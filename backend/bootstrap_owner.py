"""
Secure Owner Bootstrap Script
Establishes the protected Owner account for the Bottling Plant web application.
Enforces:
- Explicit developer selection by email (never guessing)
- Database-backed identity (role = 'owner', is_owner = 1)
- Audit log entry for security traceability
- No hardcoded passwords or credentials
Usage:
    python bootstrap_owner.py --email <user_email>
    python bootstrap_owner.py --list
"""
import sys
import os
import argparse

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from db import get_db_connection

def list_registered_users():
    with get_db_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute("SELECT id, full_name, email, role, is_owner, is_active FROM users ORDER BY id ASC")
            users = cursor.fetchall()
            print("\nRegistered Users in Bottling Plant Database:")
            print("-" * 75)
            print(f"{'ID':<5} | {'Full Name':<22} | {'Email':<30} | {'Role':<12} | {'Owner':<6}")
            print("-" * 75)
            for u in users:
                is_o = "YES" if u.get('is_owner') else "NO"
                print(f"{u['id']:<5} | {u['full_name']:<22} | {u['email']:<30} | {u['role']:<12} | {is_o:<6}")
            print("-" * 75)
            return users

def bootstrap_owner(target_email: str):
    target_email = target_email.strip().lower()
    if not target_email:
        print("Error: A valid email address is required to bootstrap the Owner.")
        sys.exit(1)

    with get_db_connection() as conn:
        with conn.cursor() as cursor:
            # 1. Look up user by email
            cursor.execute("SELECT id, full_name, email, role, is_owner, is_active FROM users WHERE LOWER(email) = %s", (target_email,))
            user = cursor.fetchone()

            if not user:
                print(f"\n[ERROR] No registered user found with email: '{target_email}'")
                print("Please register the account first through the application, or select an existing user:")
                list_registered_users()
                sys.exit(1)

            prev_role = user['role']
            user_id = user['id']

            # 2. Check if already owner
            if user.get('is_owner') and user.get('role') == 'owner':
                print(f"\n[INFO] User '{user['full_name']}' ({user['email']}) is ALREADY the confirmed protected Owner.")
                return user

            # 3. Promote to Owner
            print(f"\nPromoting User ID {user_id} ('{user['full_name']}' <{user['email']}>) to Protected Owner...")
            cursor.execute(
                "UPDATE users SET role = 'owner', is_owner = 1, is_active = 1, updated_at = CURRENT_TIMESTAMP WHERE id = %s",
                (user_id,)
            )

            # 4. Record audit event
            cursor.execute(
                "INSERT INTO user_audit_log (actor_id, target_id, action, previous_role, new_role, status, details) "
                "VALUES (%s, %s, %s, %s, %s, %s, %s)",
                (user_id, user_id, 'owner_bootstrapped', prev_role, 'owner', 'success',
                 f"Account established as system Owner via secure bootstrap procedure.")
            )

            print(f"[SUCCESS] Account '{user['email']}' successfully established as the Protected Owner.")
            print("Owner Protection Active: Cannot be demoted, deactivated, or deleted by any other user.")
            return user

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description="Bootstrap the Bottling Plant Application Owner.")
    parser.add_argument('--email', type=str, help="Email address of the account to establish as Owner.")
    parser.add_argument('--list', action='store_true', help="List all registered users.")

    args = parser.parse_args()

    # Check environment variable fallback
    env_email = os.environ.get('INITIAL_OWNER_EMAIL')

    if args.list:
        list_registered_users()
    elif args.email:
        bootstrap_owner(args.email)
    elif env_email:
        print(f"Using INITIAL_OWNER_EMAIL from environment: {env_email}")
        bootstrap_owner(env_email)
    else:
        print("No --email provided. Inspecting registered users:")
        users = list_registered_users()
        print("\nTo establish an Owner, run:")
        print("    python bootstrap_owner.py --email <user_email>")
