"""
Database Migration: Add last_seen_at to users table for real-time online tracking.
"""
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from db import get_db_connection

def run_migration():
    print("=== Adding last_seen_at column to users table ===")
    with get_db_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute("SHOW COLUMNS FROM users LIKE 'last_seen_at'")
            res = cursor.fetchone()
            if not res:
                print("Adding last_seen_at TIMESTAMP NULL DEFAULT NULL AFTER is_active...")
                cursor.execute("ALTER TABLE users ADD COLUMN last_seen_at TIMESTAMP NULL DEFAULT NULL AFTER is_active")
                try:
                    cursor.execute("CREATE INDEX idx_users_last_seen ON users (last_seen_at)")
                except Exception as e:
                    print(f"Index creation note: {e}")
                print("Successfully added last_seen_at column and index.")
            else:
                print("Column last_seen_at already exists in users table.")
        conn.commit()
    print("Migration finished successfully.")

if __name__ == '__main__':
    run_migration()
