"""
Database Migration: Add avatar_url column to users table
"""
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from db import get_db_connection

def run_migration():
    print("=== Adding avatar_url column to users table ===")
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cursor:
                cursor.execute("SHOW COLUMNS FROM users LIKE 'avatar_url'")
                res = cursor.fetchone()
                if not res:
                    print("Adding avatar_url MEDIUMTEXT NULL DEFAULT NULL AFTER is_active...")
                    cursor.execute("ALTER TABLE users ADD COLUMN avatar_url MEDIUMTEXT NULL DEFAULT NULL AFTER is_active")
                    print("Successfully added avatar_url column.")
                else:
                    print("Column avatar_url already exists in users table.")
            conn.commit()
        print("Migration finished successfully.")
    except Exception as e:
        print(f"Migration note/error: {e}")

if __name__ == '__main__':
    run_migration()

