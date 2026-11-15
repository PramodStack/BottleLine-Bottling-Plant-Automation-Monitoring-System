"""
Centralized Role-Based Access Control (RBAC) & Security Module
Defines roles, permissions, authorization decorators, and audit logging.
"""
from functools import wraps
from flask import request, jsonify, g
from db import query_db, execute_db

# Role definitions
ROLE_OWNER = 'owner'
ROLE_SUPER_ADMIN = 'super_admin'
ROLE_ANALYST = 'analyst'
ROLE_MANAGER = 'manager'
ROLE_SUPERVISOR = 'supervisor'
ROLE_OPERATOR = 'operator'

ALL_ROLES = (
    ROLE_OWNER,
    ROLE_SUPER_ADMIN,
    ROLE_ANALYST,
    ROLE_MANAGER,
    ROLE_SUPERVISOR,
    ROLE_OPERATOR,
)

# Roles that a Super Admin is authorized to assign
SUPER_ADMIN_ASSIGNABLE_ROLES = (
    ROLE_ANALYST,
    ROLE_MANAGER,
    ROLE_SUPERVISOR,
    ROLE_OPERATOR,
)

# Roles that an Owner is authorized to assign to others (never Owner via standard UI/API)
OWNER_ASSIGNABLE_ROLES = (
    ROLE_SUPER_ADMIN,
    ROLE_ANALYST,
    ROLE_MANAGER,
    ROLE_SUPERVISOR,
    ROLE_OPERATOR,
)

DEFAULT_REGISTRATION_ROLE = ROLE_ANALYST

def is_owner_user(user_dict: dict) -> bool:
    """Checks if a user is the protected system Owner."""
    if not user_dict:
        return False
    return bool(user_dict.get('is_owner') or user_dict.get('role') == ROLE_OWNER)

def log_audit(actor_id, target_id, action, previous_role=None, new_role=None, status='success', details=None, ip_address=None):
    """
    Safely records administrative and security events into user_audit_log.
    Never logs passwords, hashes, tokens, or credentials.
    """
    try:
        if not ip_address and request:
            ip_address = request.headers.get('X-Forwarded-For', request.remote_addr or '')
            if ip_address and ',' in ip_address:
                ip_address = ip_address.split(',')[0].strip()

        execute_db(
            "INSERT INTO user_audit_log (actor_id, target_id, action, previous_role, new_role, status, details, ip_address) "
            "VALUES (%s, %s, %s, %s, %s, %s, %s, %s)",
            (actor_id, target_id, action, previous_role, new_role, status, details, ip_address)
        )
    except Exception as e:
        # Never break main request flow if audit logging fails
        print(f"Warning: Failed to write audit log: {e}")

def require_roles(*allowed_roles):
    """
    Decorator to restrict route access to specific roles.
    Assumes @require_auth has already populated g.current_user.
    Returns HTTP 403 if unauthorized.
    """
    def decorator(f):
        @wraps(f)
        def decorated(*args, **kwargs):
            user = getattr(g, 'current_user', None)
            if not user:
                return jsonify({'success': False, 'message': 'Authentication required'}), 401
            
            user_role = user.get('role')
            if user_role not in allowed_roles:
                log_audit(
                    actor_id=user.get('id'),
                    target_id=None,
                    action='unauthorized_access_attempt',
                    status='failed',
                    details=f"User with role '{user_role}' attempted to access endpoint requiring {allowed_roles}."
                )
                return jsonify({
                    'success': False,
                    'message': 'Access denied: You do not have permission to perform this action.'
                }), 403
            
            return f(*args, **kwargs)
        return decorated
    return decorator

# Permission check helpers
def can_create_batch(role: str) -> bool:
    return role in (ROLE_OWNER, ROLE_SUPER_ADMIN, ROLE_MANAGER)

def can_edit_batch(role: str) -> bool:
    return role in (ROLE_OWNER, ROLE_SUPER_ADMIN, ROLE_MANAGER)

def can_start_stop_batch(role: str) -> bool:
    return role in (ROLE_OWNER, ROLE_SUPER_ADMIN, ROLE_MANAGER, ROLE_SUPERVISOR, ROLE_OPERATOR)

def can_access_ai(role: str) -> bool:
    return role in (ROLE_OWNER, ROLE_SUPER_ADMIN, ROLE_ANALYST, ROLE_MANAGER, ROLE_SUPERVISOR)

def can_manage_users(role: str) -> bool:
    return role in (ROLE_OWNER, ROLE_SUPER_ADMIN)
