import re
import datetime
import time
import jwt
from functools import wraps
from flask import Blueprint, request, jsonify, g
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError, InvalidHash
from config import Config
from db import query_db, execute_db
from security import (
    DEFAULT_REGISTRATION_ROLE,
    ROLE_ANALYST,
    log_audit,
    is_owner_user
)

auth_bp = Blueprint('auth', __name__, url_prefix='/api/auth')
ph = PasswordHasher()

# In-memory user activity cache to throttle database writes (writes at most every 30s per user)
_last_seen_cache = {}

def update_user_last_seen(user_id, force=False):
    """
    Updates the last_seen_at timestamp for authenticated activity.
    Throttles database writes to once every 30 seconds unless force=True (e.g. login).
    """
    now = time.time()
    last_write = _last_seen_cache.get(user_id, 0)
    if force or (now - last_write >= 30):
        try:
            execute_db(
                "UPDATE users SET last_seen_at = UTC_TIMESTAMP() WHERE id = %s",
                (user_id,)
            )
            _last_seen_cache[user_id] = now
        except Exception:
            pass

def generate_token(user_id, email, role, full_name, is_owner=False):
    payload = {
        'sub': str(user_id),
        'email': email,
        'role': role,
        'is_owner': bool(is_owner),
        'name': full_name,
        'iat': datetime.datetime.now(datetime.timezone.utc),
        'exp': datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(hours=Config.JWT_EXPIRATION_HOURS)
    }
    return jwt.encode(payload, Config.SECRET_KEY, algorithm='HS256')

def decode_token(token):
    try:
        return jwt.decode(token, Config.SECRET_KEY, algorithms=['HS256'])
    except (jwt.ExpiredSignatureError, jwt.InvalidTokenError):
        return None

def require_auth(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        auth_header = request.headers.get('Authorization', '')
        if not auth_header.startswith('Bearer '):
            return jsonify({'success': False, 'message': 'Authentication required'}), 401
        
        token = auth_header.split(' ', 1)[1].strip()
        decoded = decode_token(token)
        if not decoded:
            return jsonify({'success': False, 'message': 'Invalid or expired session token'}), 401
        
        user = query_db(
            "SELECT id, full_name, email, role, is_owner, is_active, created_at, updated_at, last_seen_at FROM users WHERE id = %s",
            (decoded['sub'],),
            one=True
        )
        if not user or not user.get('is_active'):
            return jsonify({'success': False, 'message': 'Account is inactive or not found'}), 403
        
        g.current_user = user
        update_user_last_seen(user['id'], force=False)
        return f(*args, **kwargs)
    return decorated

@auth_bp.route('/signup', methods=['POST'])
def signup():
    data = request.get_json(silent=True) or {}
    full_name = (data.get('full_name') or '').strip()
    email = (data.get('email') or '').strip().lower()
    password = data.get('password') or ''
    confirm_password = data.get('confirm_password') or ''

    # Input validation
    if not full_name:
        return jsonify({'success': False, 'message': 'Full name is required'}), 400
    if not email or not re.match(r'^[^@]+@[^@]+\.[^@]+$', email):
        return jsonify({'success': False, 'message': 'Valid email address is required'}), 400
    if len(password) < 6:
        return jsonify({'success': False, 'message': 'Password must be at least 6 characters'}), 400
    if password != confirm_password:
        return jsonify({'success': False, 'message': 'Passwords do not match'}), 400

    # Duplicate email check
    existing = query_db("SELECT id FROM users WHERE email = %s", (email,), one=True)
    if existing:
        return jsonify({'success': False, 'message': 'An account with this email already exists'}), 409

    # Securely hash password with Argon2id
    try:
        pwd_hash = ph.hash(password)
        # Requirement: Normal registration ALWAYS assigns 'analyst' on the server.
        # User-supplied roles are strictly ignored.
        assigned_role = DEFAULT_REGISTRATION_ROLE
        
        user_id = execute_db(
            "INSERT INTO users (full_name, email, password_hash, role, is_owner, is_active) VALUES (%s, %s, %s, %s, 0, 1)",
            (full_name, email, pwd_hash, assigned_role),
            return_id=True
        )

        user_data = {
            'id': user_id,
            'full_name': full_name,
            'email': email,
            'role': assigned_role,
            'is_owner': False,
            'is_active': True
        }
        token = generate_token(user_id, email, assigned_role, full_name, is_owner=False)

        log_audit(
            actor_id=user_id,
            target_id=user_id,
            action='user_registered',
            new_role=assigned_role,
            status='success',
            details=f"New user registered with default role '{assigned_role}'."
        )

        return jsonify({
            'success': True,
            'message': 'Account created successfully with Analyst role.',
            'token': token,
            'user': user_data
        }), 201

    except Exception as e:
        return jsonify({'success': False, 'message': 'Registration error occurred'}), 500

@auth_bp.route('/login', methods=['POST'])
def login():
    data = request.get_json(silent=True) or {}
    email = (data.get('email') or '').strip().lower()
    password = data.get('password') or ''

    if not email or not password:
        return jsonify({'success': False, 'message': 'Email and password are required'}), 400

    try:
        user = query_db(
            "SELECT id, full_name, email, password_hash, role, is_owner, is_active, avatar_url FROM users WHERE email = %s",
            (email,),
            one=True
        )
    except Exception:
        user = query_db(
            "SELECT id, full_name, email, password_hash, role, is_owner, is_active FROM users WHERE email = %s",
            (email,),
            one=True
        )
    if not user:
        return jsonify({'success': False, 'message': 'Invalid credentials'}), 401
    
    if not user.get('is_active'):
        log_audit(
            actor_id=user['id'],
            target_id=user['id'],
            action='login_attempt_deactivated_account',
            status='failed',
            details=f"Login attempt rejected for deactivated account '{email}'."
        )
        return jsonify({'success': False, 'message': 'This account has been deactivated'}), 403

    try:
        ph.verify(user['password_hash'], password)
    except (VerifyMismatchError, InvalidHash):
        log_audit(
            actor_id=user['id'],
            target_id=user['id'],
            action='login_failed_bad_password',
            status='failed',
            details=f"Failed password verification for user '{email}'."
        )
        return jsonify({'success': False, 'message': 'Invalid credentials'}), 401

    is_owner = is_owner_user(user)
    token = generate_token(user['id'], user['email'], user['role'], user['full_name'], is_owner=is_owner)
    user_data = {
        'id': user['id'],
        'full_name': user['full_name'],
        'email': user['email'],
        'role': user['role'],
        'is_owner': is_owner,
        'is_active': bool(user['is_active']),
        'avatar_url': user.get('avatar_url') or None
    }

    log_audit(
        actor_id=user['id'],
        target_id=user['id'],
        action='user_login',
        status='success',
        details=f"User '{email}' logged in successfully with role '{user['role']}'."
    )

    update_user_last_seen(user['id'], force=True)

    return jsonify({
        'success': True,
        'message': 'Login successful',
        'token': token,
        'user': user_data
    }), 200

@auth_bp.route('/heartbeat', methods=['POST'])
@require_auth
def heartbeat():
    user = g.current_user
    update_user_last_seen(user['id'], force=False)
    return jsonify({
        'success': True,
        'user_id': user['id'],
        'timestamp': datetime.datetime.now(datetime.timezone.utc).isoformat()
    }), 200

_avatar_col_checked = False

def _ensure_avatar_column():
    global _avatar_col_checked
    if _avatar_col_checked:
        return
    try:
        cols = query_db("SHOW COLUMNS FROM users LIKE 'avatar_url'")
        if not cols:
            execute_db("ALTER TABLE users ADD COLUMN avatar_url MEDIUMTEXT NULL DEFAULT NULL AFTER is_active")
        _avatar_col_checked = True
    except Exception:
        pass

def _fetch_user_by_id(user_id):
    _ensure_avatar_column()
    try:
        return query_db(
            "SELECT id, full_name, email, role, is_owner, is_active, avatar_url, created_at, updated_at, last_seen_at FROM users WHERE id = %s",
            (user_id,),
            one=True
        )
    except Exception:
        return query_db(
            "SELECT id, full_name, email, role, is_owner, is_active, created_at, updated_at, last_seen_at FROM users WHERE id = %s",
            (user_id,),
            one=True
        )

def _format_user_profile(user):
    created_at_val = user.get('created_at')
    updated_at_val = user.get('updated_at')
    last_seen_val = user.get('last_seen_at')

    return {
        'id': user['id'],
        'full_name': user['full_name'],
        'email': user['email'],
        'role': user['role'],
        'is_owner': is_owner_user(user),
        'is_active': bool(user.get('is_active', 1)),
        'avatar_url': user.get('avatar_url') or user.get('avatar') or None,
        'created_at': created_at_val.isoformat() if created_at_val and hasattr(created_at_val, 'isoformat') else (str(created_at_val) if created_at_val else None),
        'updated_at': updated_at_val.isoformat() if updated_at_val and hasattr(updated_at_val, 'isoformat') else (str(updated_at_val) if updated_at_val else None),
        'last_seen_at': last_seen_val.isoformat() if last_seen_val and hasattr(last_seen_val, 'isoformat') else (str(last_seen_val) if last_seen_val else None)
    }

@auth_bp.route('/me', methods=['GET', 'PUT'], strict_slashes=False)
@auth_bp.route('/profile', methods=['GET', 'PUT'], strict_slashes=False)
@require_auth
def user_profile_endpoint():
    if request.method == 'GET':
        user = g.current_user
        fresh_user = _fetch_user_by_id(user['id']) or user
        return jsonify({
            'success': True,
            'user': _format_user_profile(fresh_user)
        }), 200
    return update_profile()

def update_profile():
    user = g.current_user
    user_id = user['id']  # Never trust user-supplied ID
    data = request.get_json(silent=True) or {}

    full_name = (data.get('full_name') or '').strip()
    email = (data.get('email') or '').strip().lower()
    avatar_url = data.get('avatar_url') or data.get('avatar')

    if not full_name:
        return jsonify({'success': False, 'message': 'Full name cannot be empty'}), 400
    if len(full_name) > 100:
        return jsonify({'success': False, 'message': 'Full name must be under 100 characters'}), 400

    if not email or not re.match(r'^[^@]+@[^@]+\.[^@]+$', email):
        return jsonify({'success': False, 'message': 'Valid email address is required'}), 400

    # If email changed, ensure no conflict
    if email != user['email'].lower():
        existing = query_db("SELECT id FROM users WHERE email = %s AND id != %s", (email, user_id), one=True)
        if existing:
            return jsonify({'success': False, 'message': 'Email address is already in use by another account'}), 409

    try:
        _ensure_avatar_column()
        if avatar_url is not None:
            try:
                execute_db(
                    "UPDATE users SET full_name = %s, email = %s, avatar_url = %s, updated_at = UTC_TIMESTAMP() WHERE id = %s",
                    (full_name, email, avatar_url, user_id)
                )
            except Exception:
                execute_db(
                    "UPDATE users SET full_name = %s, email = %s, updated_at = UTC_TIMESTAMP() WHERE id = %s",
                    (full_name, email, user_id)
                )
        else:
            execute_db(
                "UPDATE users SET full_name = %s, email = %s, updated_at = UTC_TIMESTAMP() WHERE id = %s",
                (full_name, email, user_id)
            )

        updated = _fetch_user_by_id(user_id) or user

        is_owner = is_owner_user(updated)
        new_token = generate_token(updated['id'], updated['email'], updated['role'], updated['full_name'], is_owner=is_owner)

        log_audit(
            actor_id=user_id,
            target_id=user_id,
            action='profile_updated',
            status='success',
            details=f"User updated profile. Name: '{full_name}', Email: '{email}'."
        )

        return jsonify({
            'success': True,
            'message': 'Profile updated successfully',
            'token': new_token,
            'user': _format_user_profile(updated)
        }), 200

    except Exception as e:
        return jsonify({'success': False, 'message': f'Failed to update profile: {str(e)}'}), 500

@auth_bp.route('/avatar', methods=['POST', 'PUT'], strict_slashes=False)
@require_auth
def update_avatar():
    user = g.current_user
    user_id = user['id']
    avatar_data = None

    if request.is_json:
        data = request.get_json(silent=True) or {}
        avatar_data = data.get('avatar') or data.get('avatar_url')
    elif 'file' in request.files or 'avatar' in request.files:
        file = request.files.get('file') or request.files.get('avatar')
        if file and file.filename:
            import base64
            mimetype = file.content_type or 'image/png'
            file_bytes = file.read()
            if len(file_bytes) > 5 * 1024 * 1024:
                return jsonify({'success': False, 'message': 'Image exceeds 5MB limit'}), 400
            encoded = base64.b64encode(file_bytes).decode('utf-8')
            avatar_data = f"data:{mimetype};base64,{encoded}"

    if not avatar_data:
        return jsonify({'success': False, 'message': 'No avatar image data provided'}), 400

    try:
        _ensure_avatar_column()
        execute_db(
            "UPDATE users SET avatar_url = %s, updated_at = UTC_TIMESTAMP() WHERE id = %s",
            (avatar_data, user_id)
        )

        updated = _fetch_user_by_id(user_id) or user

        log_audit(
            actor_id=user_id,
            target_id=user_id,
            action='avatar_updated',
            status='success',
            details=f"User '{user['email']}' updated their profile picture."
        )

        return jsonify({
            'success': True,
            'message': 'Profile picture updated successfully',
            'user': _format_user_profile(updated)
        }), 200

    except Exception as e:
        return jsonify({'success': False, 'message': f'Failed to update profile picture: {str(e)}'}), 500

@auth_bp.route('/avatar', methods=['DELETE'], strict_slashes=False)
@require_auth
def delete_avatar():
    user = g.current_user
    user_id = user['id']
    try:
        _ensure_avatar_column()
        execute_db(
            "UPDATE users SET avatar_url = NULL, updated_at = UTC_TIMESTAMP() WHERE id = %s",
            (user_id,)
        )

        updated = _fetch_user_by_id(user_id) or user

        log_audit(
            actor_id=user_id,
            target_id=user_id,
            action='avatar_removed',
            status='success',
            details=f"User '{user['email']}' removed their profile picture."
        )

        return jsonify({
            'success': True,
            'message': 'Profile picture removed successfully',
            'user': _format_user_profile(updated)
        }), 200

    except Exception as e:
        return jsonify({'success': False, 'message': f'Failed to remove profile picture: {str(e)}'}), 500

@auth_bp.route('/change-password', methods=['POST'], strict_slashes=False)
@auth_bp.route('/password', methods=['PUT', 'POST'], strict_slashes=False)
@require_auth
def change_password():
    user = g.current_user
    user_id = user['id']
    data = request.get_json(silent=True) or {}

    current_password = data.get('current_password') or ''
    new_password = data.get('new_password') or ''
    confirm_password = data.get('confirm_password') or ''

    if not current_password or not new_password or not confirm_password:
        return jsonify({'success': False, 'message': 'Current password, new password, and confirmation are required'}), 400

    if len(new_password) < 6:
        return jsonify({'success': False, 'message': 'New password must be at least 6 characters long'}), 400

    if new_password != confirm_password:
        return jsonify({'success': False, 'message': 'New password and confirmation do not match'}), 400

    if new_password == current_password:
        return jsonify({'success': False, 'message': 'New password cannot be the same as your current password'}), 400

    db_user = query_db("SELECT password_hash FROM users WHERE id = %s", (user_id,), one=True)
    if not db_user or not db_user.get('password_hash'):
        return jsonify({'success': False, 'message': 'User record not found'}), 404

    try:
        ph.verify(db_user['password_hash'], current_password)
    except (VerifyMismatchError, InvalidHash):
        log_audit(
            actor_id=user_id,
            target_id=user_id,
            action='password_change_failed_bad_current',
            status='failed',
            details="Password change attempt rejected due to invalid current password."
        )
        return jsonify({'success': False, 'message': 'Current password is incorrect'}), 400

    try:
        new_hash = ph.hash(new_password)
        execute_db(
            "UPDATE users SET password_hash = %s, updated_at = UTC_TIMESTAMP() WHERE id = %s",
            (new_hash, user_id)
        )

        log_audit(
            actor_id=user_id,
            target_id=user_id,
            action='password_changed',
            status='success',
            details=f"User '{user['email']}' successfully changed their password."
        )

        return jsonify({
            'success': True,
            'message': 'Password has been updated successfully'
        }), 200

    except Exception as e:
        return jsonify({'success': False, 'message': f'Error changing password: {str(e)}'}), 500

@auth_bp.route('/logout', methods=['POST'], strict_slashes=False)
def logout():
    return jsonify({'success': True, 'message': 'Logged out successfully'}), 200
