"""
Database Migration: User Management & RBAC Schema Update
- Updates 'users' table role ENUM to support ('owner', 'super_admin', 'analyst', 'manager', 'supervisor', 'operator')
- Sets default role to 'analyst'
- Adds 'is_owner' column to 'users' for database-backed Owner protection
- Creates 'user_audit_log' table for security and administrative action auditing
- Preserves all existing users, password hashes, and timestamps
"""
import sys
import os

# Ensure backend root is in python path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from db import get_db_connection

def run_migration():
    print("=== Starting RBAC & User Management Migration ===")

    with get_db_connection() as conn:
        with conn.cursor() as cursor:
            # 1. Inspect existing columns in users table
            cursor.execute("DESCRIBE users")
            columns = {col['Field']: col for col in cursor.fetchall()}
            print(f"Current users table columns: {list(columns.keys())}")

            # 2. Check current role column type
            role_type = columns.get('role', {}).get('Type', '')
            print(f"Current role column type: {role_type}")

            cursor.execute("SELECT id, email, role FROM users")
            existing_users = cursor.fetchall()
            print(f"Found {len(existing_users)} existing users in database:")
            for u in existing_users:
                print(f" - ID {u['id']}: {u['email']} (role: {u['role']})")

            # 3. Alter role column to support all 6 RBAC roles with default 'analyst'
            print("\nAltering 'role' column in 'users' table to VARCHAR(30)...")
            cursor.execute("ALTER TABLE users MODIFY COLUMN role VARCHAR(30) NOT NULL DEFAULT 'analyst'")

            # Map legacy roles safely
            cursor.execute("UPDATE users SET role = 'analyst' WHERE role = 'viewer'")
            cursor.execute("UPDATE users SET role = 'super_admin' WHERE role = 'admin'")

            # Convert to strict ENUM with 6 roles
            print("Converting 'role' column to ENUM('owner', 'super_admin', 'analyst', 'manager', 'supervisor', 'operator')...")
            cursor.execute(
                "ALTER TABLE users MODIFY COLUMN role "
                "ENUM('owner', 'super_admin', 'analyst', 'manager', 'supervisor', 'operator') "
                "NOT NULL DEFAULT 'analyst'"
            )
            print("Successfully updated 'role' column to ENUM with default 'analyst'.")

            # 4. Add 'is_owner' column if not present
            if 'is_owner' not in columns:
                print("Adding 'is_owner' column to 'users' table...")
                cursor.execute("ALTER TABLE users ADD COLUMN is_owner TINYINT(1) NOT NULL DEFAULT 0 AFTER role")
                cursor.execute("CREATE INDEX idx_users_is_owner ON users (is_owner)")
                print("Successfully added 'is_owner' column and index.")
            else:
                print("'is_owner' column already exists.")

            # Ensure index on role
            try:
                cursor.execute("CREATE INDEX idx_users_role ON users (role)")
                print("Added index on users.role.")
            except Exception:
                pass

            # 5. Create user_audit_log table if not exists
            print("\nEnsuring 'user_audit_log' table exists...")
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS user_audit_log (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    actor_id INT NULL,
                    target_id INT NULL,
                    action VARCHAR(60) NOT NULL,
                    previous_role VARCHAR(30) NULL,
                    new_role VARCHAR(30) NULL,
                    status VARCHAR(20) NOT NULL DEFAULT 'success',
                    details TEXT NULL,
                    ip_address VARCHAR(45) NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    INDEX idx_audit_actor (actor_id),
                    INDEX idx_audit_target (target_id),
                    INDEX idx_audit_action (action),
                    INDEX idx_audit_created (created_at)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            """)
            print("Successfully ensured 'user_audit_log' table exists.")

    print("\n=== Migration completed successfully! ===")

if __name__ == '__main__':
    run_migration()
