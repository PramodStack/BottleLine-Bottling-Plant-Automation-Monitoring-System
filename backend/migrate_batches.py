"""
Migration script for Production Batch Management upgrade.
Safely adds fields to production_batch and production_log without dropping or resetting data.
"""
import sys
from db import get_db_connection, query_db, execute_db

def migrate():
    print("Starting production batch schema migration...")
    
    with get_db_connection() as conn:
        with conn.cursor() as cursor:
            # 1. Inspect existing columns in production_batch
            cursor.execute("DESCRIBE production_batch")
            batch_cols = {col['Field']: col for col in cursor.fetchall()}
            
            # Add production_mode
            if 'production_mode' not in batch_cols:
                print("Adding production_mode to production_batch...")
                cursor.execute(
                    "ALTER TABLE production_batch ADD COLUMN production_mode VARCHAR(30) NOT NULL DEFAULT 'continuous' AFTER batch_number"
                )
            
            # Add scheduled_start
            if 'scheduled_start' not in batch_cols:
                print("Adding scheduled_start to production_batch...")
                cursor.execute(
                    "ALTER TABLE production_batch ADD COLUMN scheduled_start DATETIME NULL DEFAULT NULL AFTER target_quantity"
                )
                
            # Add actual_start
            if 'actual_start' not in batch_cols:
                print("Adding actual_start to production_batch...")
                cursor.execute(
                    "ALTER TABLE production_batch ADD COLUMN actual_start DATETIME NULL DEFAULT NULL AFTER scheduled_start"
                )
                
            # Add completed_at
            if 'completed_at' not in batch_cols:
                print("Adding completed_at to production_batch...")
                cursor.execute(
                    "ALTER TABLE production_batch ADD COLUMN completed_at DATETIME NULL DEFAULT NULL AFTER actual_start"
                )
                
            # Add stopped_at
            if 'stopped_at' not in batch_cols:
                print("Adding stopped_at to production_batch...")
                cursor.execute(
                    "ALTER TABLE production_batch ADD COLUMN stopped_at DATETIME NULL DEFAULT NULL AFTER completed_at"
                )
                
            # Ensure target_quantity is nullable or defaults properly
            cursor.execute(
                "ALTER TABLE production_batch MODIFY COLUMN target_quantity INT NULL DEFAULT NULL"
            )

            # Check indexes on production_batch
            cursor.execute("SHOW INDEX FROM production_batch")
            indexes = {idx['Key_name'] for idx in cursor.fetchall()}
            if 'idx_batch_status' not in indexes:
                print("Adding index on batch_status...")
                cursor.execute("CREATE INDEX idx_batch_status ON production_batch (batch_status)")
            if 'idx_batch_status_sched' not in indexes:
                print("Adding index on (batch_status, scheduled_start)...")
                cursor.execute("CREATE INDEX idx_batch_status_sched ON production_batch (batch_status, scheduled_start)")

            # 2. Inspect existing columns in production_log
            cursor.execute("DESCRIBE production_log")
            log_cols = {col['Field']: col for col in cursor.fetchall()}
            
            if 'batch_id' not in log_cols:
                print("Adding batch_id to production_log...")
                cursor.execute(
                    "ALTER TABLE production_log ADD COLUMN batch_id INT NULL DEFAULT NULL AFTER id"
                )
                cursor.execute("CREATE INDEX idx_log_batch_id ON production_log (batch_id)")

            # 3. Migrate existing records
            print("Migrating existing batch records...")
            # If target_quantity is 0 or NULL, set production_mode = 'continuous'
            cursor.execute(
                "UPDATE production_batch SET production_mode = 'continuous', target_quantity = NULL "
                "WHERE (target_quantity = 0 OR target_quantity IS NULL) AND (production_mode IS NULL OR production_mode = '')"
            )
            # If target_quantity > 0, set production_mode = 'set_quantity'
            cursor.execute(
                "UPDATE production_batch SET production_mode = 'set_quantity' "
                "WHERE target_quantity > 0 AND (production_mode IS NULL OR production_mode = '')"
            )
            # Set actual_start for any active or completed batch that lacks actual_start
            cursor.execute(
                "UPDATE production_batch SET actual_start = created_at WHERE actual_start IS NULL AND batch_status IN ('In Progress', 'Completed')"
            )
            
            # Associate existing production_log rows with existing batch 1 if batch_id is NULL
            cursor.execute(
                "UPDATE production_log SET batch_id = 1 WHERE batch_id IS NULL AND (SELECT COUNT(*) FROM production_batch WHERE id = 1) > 0"
            )
            
    print("Migration completed successfully!")

if __name__ == '__main__':
    migrate()
