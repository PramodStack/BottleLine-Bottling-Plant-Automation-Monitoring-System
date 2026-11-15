"""
User Management and RBAC Administration Endpoints
Mounted at /api/users
Provides:
- GET /api/users (list & summary metrics)
- POST /api/users (create user with role-level restrictions)
- PUT /api/users/<id> (edit user with Owner & self-elevation protections)
- PATCH /api/users/<id>/status (activate/deactivate with Owner protection)
- DELETE /api/users/<id> (delete user with Owner protection)
- GET /api/users/audit-logs (read-only administrative audit trails)
"""
import re
import datetime
from flask import Blueprint, request, jsonify, g
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError
from config import Config
from db import query_db, execute_db
from routes.auth import require_auth
from security import (
    require_roles,
    log_audit,
    is_owner_user,
    ROLE_OWNER,
    ROLE_SUPER_ADMIN,
    ROLE_ANALYST,
    ROLE_MANAGER,
    ROLE_SUPERVISOR,
    ROLE_OPERATOR,
    ALL_ROLES,
    SUPER_ADMIN_ASSIGNABLE_ROLES,
    OWNER_ASSIGNABLE_ROLES,
)

users_bp = Blueprint('users', __name__, url_prefix='/api/users')
ph = PasswordHasher()

@users_bp.route('', methods=['GET'])
@require_auth
@require_roles(ROLE_OWNER, ROLE_SUPER_ADMIN)
def get_users_list():
    """
    Returns user directory and real-time aggregated metrics.
    Protected to Owner and Super Admin only.
    Never exposes password hashes.
    """
    search = (request.args.get('search') or '').strip()
    role_filter = (request.args.get('role') or '').strip().lower()
    status_filter = (request.args.get('status') or '').strip().lower()

    where_clauses = []
    args = []

    if search:
        where_clauses.append("(full_name LIKE %s OR email LIKE %s)")
        args.extend([f"%{search}%", f"%{search}%"])

    if role_filter and role_filter in ALL_ROLES:
        where_clauses.append("role = %s")
        args.append(role_filter)

    if status_filter in ('active', '1', 'true'):
        where_clauses.append("is_active = 1")
    elif status_filter in ('inactive', '0', 'false'):
        where_clauses.append("is_active = 0")

    where_sql = f"WHERE {' AND '.join(where_clauses)}" if where_clauses else ""

    users = query_db(
        f"SELECT id, full_name, email, role, is_owner, is_active, created_at, updated_at, last_seen_at "
        f"FROM users {where_sql} ORDER BY is_owner DESC, id ASC",
        args
    ) or []

    now_utc = datetime.datetime.now(datetime.timezone.utc)
    threshold_seconds = getattr(Config, 'ONLINE_THRESHOLD_SECONDS', 90)

    # Calculate real-time summary across all database users
    all_users = query_db("SELECT id, role, is_owner, is_active, last_seen_at FROM users") or []
    total_users = len(all_users)
    active_users = sum(1 for u in all_users if u.get('is_active'))
    inactive_users = total_users - active_users

    def _is_user_online(u):
        ls = u.get('last_seen_at')
        if not ls or not u.get('is_active'):
            return False
        if ls.tzinfo is None:
            ls_utc = ls.replace(tzinfo=datetime.timezone.utc)
        else:
            ls_utc = ls.astimezone(datetime.timezone.utc)
        return (now_utc - ls_utc).total_seconds() <= threshold_seconds

    online_users = sum(1 for u in all_users if _is_user_online(u))

    by_role = {role: 0 for role in ALL_ROLES}
    for u in all_users:
        r = u.get('role')
        if r in by_role:
            by_role[r] += 1

    formatted_users = []
    for u in users:
        last_seen = u.get('last_seen_at')
        is_online = False
        online_status = 'never_logged_in'
        seconds_ago = None
        last_seen_iso = None

        if last_seen:
            if last_seen.tzinfo is None:
                last_seen_utc = last_seen.replace(tzinfo=datetime.timezone.utc)
            else:
                last_seen_utc = last_seen.astimezone(datetime.timezone.utc)
            
            diff = max(0, int((now_utc - last_seen_utc).total_seconds()))
            seconds_ago = diff
            last_seen_iso = last_seen_utc.isoformat()

            if diff <= threshold_seconds and bool(u.get('is_active')):
                is_online = True
                online_status = 'online'
            elif diff <= 300 and bool(u.get('is_active')):
                online_status = 'recently_active'
            else:
                online_status = 'offline'

        formatted_users.append({
            'id': u['id'],
            'full_name': u['full_name'],
            'email': u['email'],
            'role': u['role'],
            'is_owner': bool(u.get('is_owner') or u.get('role') == ROLE_OWNER),
            'is_active': bool(u.get('is_active')),
            'last_seen_at': last_seen_iso,
            'is_online': is_online,
            'online_status': online_status,
            'seconds_ago': seconds_ago,
            'created_at': u['created_at'].strftime('%Y-%m-%d %H:%M:%S') if u.get('created_at') else None,
            'updated_at': u['updated_at'].strftime('%Y-%m-%d %H:%M:%S') if u.get('updated_at') else None,
        })

    return jsonify({
        'success': True,
        'users': formatted_users,
        'summary': {
            'total_users': total_users,
            'active_users': active_users,
            'inactive_users': inactive_users,
            'online_users': online_users,
            'by_role': by_role,
        }
    }), 200

@users_bp.route('', methods=['POST'])
@require_auth
@require_roles(ROLE_OWNER, ROLE_SUPER_ADMIN)
def create_user():
    """
    Creates a new user account with restricted role assignment.
    Rules:
    - The Owner role can NEVER be created through this API.
    - Super Admin can only assign Analyst, Manager, Supervisor, Operator.
    - Owner can assign Super Admin, Analyst, Manager, Supervisor, Operator.
    - Validates email uniqueness and minimum password length.
    """
    actor = g.current_user
    data = request.get_json(silent=True) or {}

    full_name = (data.get('full_name') or '').strip()
    email = (data.get('email') or '').strip().lower()
    password = data.get('password') or ''
    role = (data.get('role') or ROLE_ANALYST).strip().lower()
    is_active = 1 if data.get('is_active', True) else 0

    if not full_name:
        return jsonify({'success': False, 'message': 'Full name is required'}), 400
    if not email or not re.match(r'^[^@]+@[^@]+\.[^@]+$', email):
        return jsonify({'success': False, 'message': 'Valid email address is required'}), 400
    if len(password) < 6:
        return jsonify({'success': False, 'message': 'Password must be at least 6 characters'}), 400

    # Role validation and restrictions
    if role == ROLE_OWNER:
        log_audit(
            actor_id=actor['id'],
            target_id=None,
            action='unauthorized_owner_creation_attempt',
            status='failed',
            details=f"User {actor['email']} attempted to create an Owner account via API."
        )
        return jsonify({
            'success': False,
            'message': 'The Owner role cannot be assigned through user creation. Owner identity must be established via secure bootstrap.'
        }), 403

    if role not in ALL_ROLES:
        return jsonify({'success': False, 'message': f"Invalid role specified: '{role}'"}), 400

    if actor['role'] == ROLE_SUPER_ADMIN and role not in SUPER_ADMIN_ASSIGNABLE_ROLES:
        log_audit(
            actor_id=actor['id'],
            target_id=None,
            action='unauthorized_role_assignment_attempt',
            status='failed',
            details=f"Super Admin attempted to assign forbidden role '{role}'."
        )
        return jsonify({
            'success': False,
            'message': f"Super Admin is only authorized to assign: {', '.join(SUPER_ADMIN_ASSIGNABLE_ROLES)}."
        }), 403

    # Check duplicate email
    existing = query_db("SELECT id FROM users WHERE email = %s", (email,), one=True)
    if existing:
        return jsonify({'success': False, 'message': 'An account with this email already exists'}), 409

    try:
        pwd_hash = ph.hash(password)
        new_user_id = execute_db(
            "INSERT INTO users (full_name, email, password_hash, role, is_owner, is_active) VALUES (%s, %s, %s, %s, 0, %s)",
            (full_name, email, pwd_hash, role, is_active),
            return_id=True
        )

        log_audit(
            actor_id=actor['id'],
            target_id=new_user_id,
            action='user_created',
            new_role=role,
            status='success',
            details=f"User '{email}' created with role '{role}' by {actor['email']}."
        )

        return jsonify({
            'success': True,
            'message': f"User '{full_name}' created successfully.",
            'user': {
                'id': new_user_id,
                'full_name': full_name,
                'email': email,
                'role': role,
                'is_owner': False,
                'is_active': bool(is_active),
                'last_seen_at': None,
                'is_online': False,
                'online_status': 'never_logged_in',
                'seconds_ago': None
            }
        }), 201

    except Exception as e:
        return jsonify({'success': False, 'message': 'Error creating user account'}), 500

@users_bp.route('/<int:user_id>', methods=['PUT'])
@require_auth
@require_roles(ROLE_OWNER, ROLE_SUPER_ADMIN)
def update_user(user_id):
    """
    Updates user details (full_name, email, role, password).
    Enforces strict Owner protection and role elevation prevention.
    """
    actor = g.current_user
    data = request.get_json(silent=True) or {}

    target = query_db("SELECT id, full_name, email, role, is_owner, is_active, last_seen_at FROM users WHERE id = %s", (user_id,), one=True)
    if not target:
        return jsonify({'success': False, 'message': 'User not found'}), 404

    target_is_owner = is_owner_user(target)
    actor_is_owner = is_owner_user(actor)

    # 1. OWNER PROTECTION: No other account may modify the Owner!
    if target_is_owner and actor['id'] != target['id']:
        log_audit(
            actor_id=actor['id'],
            target_id=target['id'],
            action='unauthorized_owner_modification_attempt',
            status='failed',
            details=f"User {actor['email']} attempted to modify protected Owner account {target['email']}."
        )
        return jsonify({
            'success': False,
            'message': 'Cannot modify the protected Owner account. Super Admin and other accounts cannot alter the Owner.'
        }), 403

    full_name = (data.get('full_name') or target['full_name']).strip()
    email = (data.get('email') or target['email']).strip().lower()
    new_role = data.get('role')
    new_password = data.get('password')

    if not full_name:
        return jsonify({'success': False, 'message': 'Full name cannot be empty'}), 400
    if not email or not re.match(r'^[^@]+@[^@]+\.[^@]+$', email):
        return jsonify({'success': False, 'message': 'Valid email address is required'}), 400

    # Check email duplicate if changing email
    if email != target['email'].lower():
        existing = query_db("SELECT id FROM users WHERE email = %s AND id != %s", (email, user_id), one=True)
        if existing:
            return jsonify({'success': False, 'message': 'Email address is already in use by another account'}), 409

    role_to_set = target['role']

    # 2. ROLE CHANGE RULES
    if new_role and new_role != target['role']:
        new_role = new_role.strip().lower()
        if new_role not in ALL_ROLES:
            return jsonify({'success': False, 'message': f"Invalid role: '{new_role}'"}), 400

        # Cannot promote anyone to Owner via API
        if new_role == ROLE_OWNER and not target_is_owner:
            return jsonify({
                'success': False,
                'message': 'The Owner role cannot be assigned through the user management API.'
            }), 403

        # Owner editing self cannot demote self
        if target_is_owner and new_role != ROLE_OWNER:
            return jsonify({
                'success': False,
                'message': 'The protected Owner cannot demote their own account.'
            }), 403

        # Self role modification check: Non-owner cannot change own role
        if actor['id'] == target['id'] and not actor_is_owner:
            log_audit(
                actor_id=actor['id'],
                target_id=target['id'],
                action='self_role_elevation_attempt',
                status='failed',
                details=f"User {actor['email']} attempted to change own role from {target['role']} to {new_role}."
            )
            return jsonify({'success': False, 'message': 'Users cannot modify their own role.'}), 403

        # Super Admin restrictions
        if actor['role'] == ROLE_SUPER_ADMIN:
            if new_role not in SUPER_ADMIN_ASSIGNABLE_ROLES:
                return jsonify({
                    'success': False,
                    'message': f"Super Admin can only assign: {', '.join(SUPER_ADMIN_ASSIGNABLE_ROLES)}."
                }), 403

        role_to_set = new_role

    # Update database
    try:
        if new_password and len(new_password) >= 6:
            pwd_hash = ph.hash(new_password)
            execute_db(
                "UPDATE users SET full_name = %s, email = %s, role = %s, password_hash = %s, updated_at = CURRENT_TIMESTAMP WHERE id = %s",
                (full_name, email, role_to_set, pwd_hash, user_id)
            )
        else:
            execute_db(
                "UPDATE users SET full_name = %s, email = %s, role = %s, updated_at = CURRENT_TIMESTAMP WHERE id = %s",
                (full_name, email, role_to_set, user_id)
            )

        action_name = 'role_changed' if role_to_set != target['role'] else 'user_updated'
        log_audit(
            actor_id=actor['id'],
            target_id=user_id,
            action=action_name,
            previous_role=target['role'],
            new_role=role_to_set,
            status='success',
            details=f"User {target['email']} updated by {actor['email']}."
        )

        target_last_seen = target.get('last_seen_at')
        target_last_seen_iso = None
        target_is_online = False
        target_online_status = 'never_logged_in'
        target_seconds_ago = None
        if target_last_seen:
            if target_last_seen.tzinfo is None:
                tls_utc = target_last_seen.replace(tzinfo=datetime.timezone.utc)
            else:
                tls_utc = target_last_seen.astimezone(datetime.timezone.utc)
            diff = max(0, int((datetime.datetime.now(datetime.timezone.utc) - tls_utc).total_seconds()))
            target_seconds_ago = diff
            target_last_seen_iso = tls_utc.isoformat()
            if diff <= getattr(Config, 'ONLINE_THRESHOLD_SECONDS', 90) and bool(target['is_active']):
                target_is_online = True
                target_online_status = 'online'
            elif diff <= 300 and bool(target['is_active']):
                target_online_status = 'recently_active'
            else:
                target_online_status = 'offline'

        return jsonify({
            'success': True,
            'message': 'User updated successfully.',
            'user': {
                'id': user_id,
                'full_name': full_name,
                'email': email,
                'role': role_to_set,
                'is_owner': target_is_owner,
                'is_active': bool(target['is_active']),
                'last_seen_at': target_last_seen_iso,
                'is_online': target_is_online,
                'online_status': target_online_status,
                'seconds_ago': target_seconds_ago
            }
        }), 200

    except Exception as e:
        return jsonify({'success': False, 'message': 'Error updating user'}), 500

@users_bp.route('/<int:user_id>/status', methods=['PATCH'])
@require_auth
@require_roles(ROLE_OWNER, ROLE_SUPER_ADMIN)
def toggle_user_status(user_id):
    """
    Activates or deactivates an account.
    Owner account can NEVER be deactivated by anyone.
    Users cannot deactivate their own currently authenticated account.
    """
    actor = g.current_user
    data = request.get_json(silent=True) or {}
    new_status = data.get('is_active')

    if new_status is None:
        return jsonify({'success': False, 'message': "'is_active' boolean field is required"}), 400

    new_active_val = 1 if new_status else 0

    target = query_db("SELECT id, full_name, email, role, is_owner, is_active FROM users WHERE id = %s", (user_id,), one=True)
    if not target:
        return jsonify({'success': False, 'message': 'User not found'}), 404

    target_is_owner = is_owner_user(target)

    # 1. OWNER PROTECTION: Nobody can deactivate the Owner
    if target_is_owner and new_active_val == 0:
        log_audit(
            actor_id=actor['id'],
            target_id=target['id'],
            action='unauthorized_owner_deactivation_attempt',
            status='failed',
            details=f"User {actor['email']} attempted to deactivate protected Owner {target['email']}."
        )
        return jsonify({
            'success': False,
            'message': 'The Owner account is protected and cannot be deactivated.'
        }), 403

    # 2. SELF-DEACTIVATION PROTECTION: Cannot deactivate own account
    if actor['id'] == target['id'] and new_active_val == 0:
        return jsonify({
            'success': False,
            'message': 'You cannot deactivate your own account.'
        }), 403

    # 3. Super Admin cannot deactivate Owner
    if actor['role'] == ROLE_SUPER_ADMIN and target_is_owner:
        return jsonify({
            'success': False,
            'message': 'Super Admin cannot modify or deactivate the Owner account.'
        }), 403

    try:
        execute_db(
            "UPDATE users SET is_active = %s, updated_at = CURRENT_TIMESTAMP WHERE id = %s",
            (new_active_val, user_id)
        )

        action_name = 'user_activated' if new_active_val == 1 else 'user_deactivated'
        log_audit(
            actor_id=actor['id'],
            target_id=user_id,
            action=action_name,
            previous_role=target['role'],
            new_role=target['role'],
            status='success',
            details=f"Account status set to {'active' if new_active_val == 1 else 'deactivated'} by {actor['email']}."
        )

        return jsonify({
            'success': True,
            'message': f"Account successfully {'activated' if new_active_val == 1 else 'deactivated'}.",
            'is_active': bool(new_active_val)
        }), 200

    except Exception as e:
        return jsonify({'success': False, 'message': 'Error updating account status'}), 500

@users_bp.route('/<int:user_id>', methods=['DELETE'])
@require_auth
@require_roles(ROLE_OWNER, ROLE_SUPER_ADMIN)
def delete_user(user_id):
    """
    Deletes or soft-deactivates an eligible non-Owner account.
    The Owner can NEVER be deleted.
    Users cannot delete their own account.
    """
    actor = g.current_user

    target = query_db("SELECT id, full_name, email, role, is_owner, is_active FROM users WHERE id = %s", (user_id,), one=True)
    if not target:
        return jsonify({'success': False, 'message': 'User not found'}), 404

    target_is_owner = is_owner_user(target)

    # 1. OWNER PROTECTION: Nobody can delete the Owner
    if target_is_owner:
        log_audit(
            actor_id=actor['id'],
            target_id=target['id'],
            action='unauthorized_owner_deletion_attempt',
            status='failed',
            details=f"User {actor['email']} attempted to delete protected Owner {target['email']}."
        )
        return jsonify({
            'success': False,
            'message': 'The Owner account is protected and cannot be deleted.'
        }), 403

    # 2. Cannot delete own account
    if actor['id'] == target['id']:
        return jsonify({'success': False, 'message': 'You cannot delete your own account.'}), 403

    try:
        # Check if user has associated audit logs or production records to maintain foreign keys
        # We perform safe deletion if no foreign key constraints, or deactivate if linked
        execute_db("DELETE FROM users WHERE id = %s", (user_id,))
        log_audit(
            actor_id=actor['id'],
            target_id=user_id,
            action='user_deleted',
            previous_role=target['role'],
            status='success',
            details=f"User {target['email']} deleted by {actor['email']}."
        )
        return jsonify({'success': True, 'message': 'User deleted successfully.'}), 200

    except Exception as e:
        # If deletion fails due to database constraints, fallback to deactivation
        execute_db("UPDATE users SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = %s", (user_id,))
        log_audit(
            actor_id=actor['id'],
            target_id=user_id,
            action='user_deactivated_cascade_protect',
            previous_role=target['role'],
            status='success',
            details=f"User {target['email']} deactivated (preserved database integrity)."
        )
        return jsonify({
            'success': True,
            'message': 'User has related records and was safely deactivated instead of permanently deleted.'
        }), 200

@users_bp.route('/audit-logs', methods=['GET'])
@require_auth
@require_roles(ROLE_OWNER, ROLE_SUPER_ADMIN)
def get_audit_logs():
    """
    Returns read-only audit log entries for administrative oversight.
    Never exposes passwords, tokens, or credentials.
    """
    limit = min(200, max(1, int(request.args.get('limit', 50))))
    logs = query_db(
        "SELECT a.id, a.actor_id, a.target_id, a.action, a.previous_role, a.new_role, a.status, a.details, a.created_at, "
        "actor.email AS actor_email, actor.full_name AS actor_name, "
        "target.email AS target_email, target.full_name AS target_name "
        "FROM user_audit_log a "
        "LEFT JOIN users actor ON a.actor_id = actor.id "
        "LEFT JOIN users target ON a.target_id = target.id "
        "ORDER BY a.id DESC LIMIT %s",
        (limit,)
    ) or []

    formatted_logs = []
    for l in logs:
        formatted_logs.append({
            'id': l['id'],
            'actor_id': l['actor_id'],
            'actor_email': l.get('actor_email') or 'System',
            'actor_name': l.get('actor_name') or 'System',
            'target_id': l['target_id'],
            'target_email': l.get('target_email') or '-',
            'target_name': l.get('target_name') or '-',
            'action': l['action'],
            'previous_role': l['previous_role'],
            'new_role': l['new_role'],
            'status': l['status'],
            'details': l['details'],
            'created_at': l['created_at'].strftime('%Y-%m-%d %H:%M:%S') if l.get('created_at') else None,
        })

    return jsonify({
        'success': True,
        'logs': formatted_logs
    }), 200
