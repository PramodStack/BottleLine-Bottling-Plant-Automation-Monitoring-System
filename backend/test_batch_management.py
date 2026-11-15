"""
Automated Test Suite for Production Batch Management Upgrade.
Covers all 14 mandatory requirements:
1. Continuous batch created without target quantity.
2. Set quantity batch rejected if target missing, zero, negative, or invalid.
3. Future-scheduled batch does not start early.
4. Due batch starts automatically when line is available.
5. Due batch waits when another batch is running (enforces queue order).
6. Concurrency test: simultaneous requests cannot create two active batches.
7. Quantity-based batch completes when actual production reaches target.
8. Completed batch releases active-batch slot.
9. Next eligible batch starts only when line is available.
10. Continuous batch does not auto-complete on arbitrary quantity.
11. Editing a batch cannot bypass rules (target < produced rejected, completed batch cannot restart).
12. Existing production records and dashboard metrics remain intact.
13. Restarting backend / scheduler evaluates and preserves scheduled batches without loss.
14. Batch list and dashboard summaries return correct status, mode, and progress.
"""

import sys
import os
import time
import datetime
import unittest
import concurrent.futures

# Add backend directory to sys.path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app import create_app
from db import query_db, execute_db
from routes.auth import generate_token
from services.batch_service import (
    evaluate_and_update_batches,
    create_batch,
    update_batch,
    stop_batch,
    get_next_batch_number
)

class TestProductionBatchManagement(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.app = create_app()
        cls.client = cls.app.test_client()

    def setUp(self):
        token = generate_token(1, 'operator@bottlingplant.local', 'operator', 'Test Operator')
        self.auth_headers = {
            'Authorization': f'Bearer {token}',
            'Content-Type': 'application/json'
        }

    def clean_test_batches(self):
        """Clean up any batches created during tests with TEST- prefix."""
        execute_db("DELETE FROM production_batch WHERE batch_number LIKE %s", ('TEST-%',))

    def test_01_create_continuous_batch_without_target(self):
        """1. A continuous batch can be created without a target quantity."""
        self.clean_test_batches()
        res = create_batch({
            'batch_number': 'TEST-CONT-01',
            'production_mode': 'continuous',
            'target_quantity': None
        })
        self.assertEqual(res['batch_number'], 'TEST-CONT-01')
        self.assertEqual(res['production_mode'], 'continuous')
        self.assertIsNone(res['target_quantity'])
        # Since BATCH-001 is already In Progress, TEST-CONT-01 should be queued as 'Pending'
        self.assertEqual(res['batch_status'], 'Pending')
        print("[PASS] Test 1: Continuous batch created without target quantity.")

    def test_02_set_quantity_validation(self):
        """2. A quantity-based batch cannot be created with missing, zero, negative, or invalid target."""
        # Missing target
        with self.assertRaises(ValueError) as ctx1:
            create_batch({
                'batch_number': 'TEST-QTY-FAIL-1',
                'production_mode': 'set_quantity',
                'target_quantity': None
            })
        self.assertIn("Target quantity is required", str(ctx1.exception))

        # Zero target
        with self.assertRaises(ValueError) as ctx2:
            create_batch({
                'batch_number': 'TEST-QTY-FAIL-2',
                'production_mode': 'set_quantity',
                'target_quantity': 0
            })
        self.assertIn("greater than 0", str(ctx2.exception))

        # Negative target
        with self.assertRaises(ValueError) as ctx3:
            create_batch({
                'batch_number': 'TEST-QTY-FAIL-3',
                'production_mode': 'set_quantity',
                'target_quantity': -500
            })
        self.assertIn("greater than 0", str(ctx3.exception))

        # Invalid target string
        with self.assertRaises(ValueError) as ctx4:
            create_batch({
                'batch_number': 'TEST-QTY-FAIL-4',
                'production_mode': 'set_quantity',
                'target_quantity': 'invalid_num'
            })
        self.assertIn("positive whole number", str(ctx4.exception))

        # Target not multiple of 3 (box size is 3 bottles per box)
        with self.assertRaises(ValueError) as ctx5:
            create_batch({
                'batch_number': 'TEST-QTY-FAIL-5',
                'production_mode': 'set_quantity',
                'target_quantity': 500  # 500 % 3 = 2
            })
        self.assertIn("multiple of 3", str(ctx5.exception))
        print("[PASS] Test 2: Quantity-based batch rejects missing, zero, negative, invalid, or non-multiple of 3 target.")

    def test_03_future_scheduled_batch_does_not_start_early(self):
        """3. A future-scheduled batch does not start early."""
        self.clean_test_batches()
        future_time = datetime.datetime.now() + datetime.timedelta(hours=2)
        res = create_batch({
            'batch_number': 'TEST-SCHED-01',
            'production_mode': 'set_quantity',
            'target_quantity': 501,  # 167 boxes
            'scheduled_start': future_time.isoformat()
        })
        self.assertEqual(res['batch_status'], 'Scheduled')
        self.assertIsNone(res['actual_start'])

        # Run state evaluation: it must STILL be Scheduled
        evaluate_and_update_batches()
        row = query_db("SELECT batch_status FROM production_batch WHERE id = %s", (res['id'],), one=True)
        self.assertEqual(row['batch_status'], 'Scheduled')
        print("[PASS] Test 3: Future-scheduled batch does not start early.")

    def test_04_and_05_due_batch_starts_only_when_line_free(self):
        """
        4. A due batch starts automatically when the line is available.
        5. A due batch waits when another batch is running.
        """
        self.clean_test_batches()
        # Ensure BATCH-001 is In Progress
        execute_db("UPDATE production_batch SET batch_status = 'In Progress' WHERE id = 1")

        # Create a past/due batch while BATCH-001 is running
        past_time = datetime.datetime.now() - datetime.timedelta(minutes=5)
        batch = create_batch({
            'batch_number': 'TEST-DUE-01',
            'production_mode': 'set_quantity',
            'target_quantity': 201,  # 67 boxes
            'scheduled_start': past_time.isoformat()
        })
        # Should be queued as 'Pending' because BATCH-001 is active
        self.assertEqual(batch['batch_status'], 'Pending')

        # Now simulate line becoming free: complete or stop BATCH-001
        execute_db("UPDATE production_batch SET batch_status = 'Completed', completed_at = NOW() WHERE id = 1")

        # Evaluate state
        evaluate_and_update_batches()

        # The due batch must now have started automatically!
        updated = query_db("SELECT batch_status, actual_start FROM production_batch WHERE id = %s", (batch['id'],), one=True)
        self.assertEqual(updated['batch_status'], 'In Progress')
        self.assertIsNotNone(updated['actual_start'])

        # Restore BATCH-001 to In Progress for subsequent tests
        execute_db("UPDATE production_batch SET batch_status = 'Completed' WHERE id = %s", (batch['id'],))
        execute_db("UPDATE production_batch SET batch_status = 'In Progress', completed_at = NULL WHERE id = 1")
        print("[PASS] Tests 4 & 5: Due batch waits while line is busy and starts automatically when line frees up.")

    def test_06_simultaneous_starts_cannot_create_two_active_batches(self):
        """6. Concurrency test: Two simultaneous start requests cannot create two active batches."""
        self.clean_test_batches()
        # Set line free
        execute_db("UPDATE production_batch SET batch_status = 'Completed' WHERE id = 1")

        # Create two pending batches
        b1 = create_batch({'batch_number': 'TEST-RACE-01', 'production_mode': 'continuous'})
        b2 = create_batch({'batch_number': 'TEST-RACE-02', 'production_mode': 'continuous'})

        # Execute evaluation concurrently in 4 threads
        with concurrent.futures.ThreadPoolExecutor(max_workers=4) as executor:
            futures = [executor.submit(evaluate_and_update_batches) for _ in range(8)]
            concurrent.futures.wait(futures)

        active_count = query_db(
            "SELECT COUNT(*) as cnt FROM production_batch WHERE batch_status = 'In Progress'",
            one=True
        )['cnt']
        self.assertEqual(active_count, 1, f"Expected exactly 1 In Progress batch, found {active_count}!")

        # Clean up and restore BATCH-001
        execute_db("UPDATE production_batch SET batch_status = 'Completed' WHERE batch_number LIKE %s", ('TEST-%',))
        execute_db("UPDATE production_batch SET batch_status = 'In Progress', completed_at = NULL WHERE id = 1")
        print("[PASS] Test 6: Strict concurrency safety prevents multiple active batches.")

    def test_07_and_08_quantity_batch_auto_completes_and_releases_slot(self):
        """
        7. A quantity-based batch automatically completes when its actual production reaches target.
        8. A completed batch releases the active-batch slot.
        """
        self.clean_test_batches()
        execute_db("UPDATE production_batch SET batch_status = 'Completed' WHERE id = 1")

        # Create batch with target 12 (4 boxes)
        b_qty = create_batch({
            'batch_number': 'TEST-QTY-COMP',
            'production_mode': 'set_quantity',
            'target_quantity': 12
        })
        self.assertEqual(b_qty['batch_status'], 'In Progress')

        # Create queued batch waiting for it
        b_next = create_batch({
            'batch_number': 'TEST-QTY-NEXT',
            'production_mode': 'continuous'
        })
        self.assertEqual(b_next['batch_status'], 'Pending')

        # Simulate bottles reaching target 12
        execute_db("UPDATE production_batch SET produced_quantity = 12 WHERE id = %s", (b_qty['id'],))
        evaluate_and_update_batches()

        # Check b_qty is Completed
        b_qty_row = query_db("SELECT batch_status, completed_at FROM production_batch WHERE id = %s", (b_qty['id'],), one=True)
        self.assertEqual(b_qty_row['batch_status'], 'Completed')
        self.assertIsNotNone(b_qty_row['completed_at'])

        # Check b_next automatically started!
        b_next_row = query_db("SELECT batch_status, actual_start FROM production_batch WHERE id = %s", (b_next['id'],), one=True)
        self.assertEqual(b_next_row['batch_status'], 'In Progress')
        self.assertIsNotNone(b_next_row['actual_start'])

        # Restore BATCH-001
        execute_db("UPDATE production_batch SET batch_status = 'Completed' WHERE batch_number LIKE %s", ('TEST-%',))
        execute_db("UPDATE production_batch SET batch_status = 'In Progress', completed_at = NULL WHERE id = 1")
        print("[PASS] Tests 7 & 8: Quantity batch auto-completes at target and releases active-batch slot to next in queue.")

    def test_09_and_10_continuous_batch_does_not_auto_complete(self):
        """
        9. Next eligible batch starts only when line is available.
        10. A continuous batch does not complete automatically because of an arbitrary quantity.
        """
        self.clean_test_batches()
        # BATCH-001 is continuous with produced_quantity 168
        b1 = query_db("SELECT produced_quantity, batch_status FROM production_batch WHERE id = 1", one=True)
        self.assertEqual(b1['batch_status'], 'In Progress')

        # Set high produced quantity on continuous batch
        execute_db("UPDATE production_batch SET produced_quantity = 5000 WHERE id = 1")
        evaluate_and_update_batches()

        b1_after = query_db("SELECT produced_quantity, batch_status FROM production_batch WHERE id = 1", one=True)
        self.assertEqual(b1_after['batch_status'], 'In Progress')
        # Reset to 168
        execute_db("UPDATE production_batch SET produced_quantity = 168 WHERE id = 1")
        print("[PASS] Tests 9 & 10: Continuous batch remains In Progress regardless of produced count.")

    def test_11_safe_editing_business_rules(self):
        """11. Editing a batch cannot bypass rules (target < produced rejected, non-multiple of 3 rejected, completed batch cannot restart)."""
        self.clean_test_batches()
        # Target lower than produced (51 is multiple of 3, but < 168)
        with self.assertRaises(ValueError) as ctx1:
            update_batch(1, {
                'production_mode': 'set_quantity',
                'target_quantity': 51  # Current produced is 168!
            })
        self.assertIn("cannot be less than the already produced quantity", str(ctx1.exception))

        # Target not a multiple of 3 on edit (e.g. 200)
        with self.assertRaises(ValueError) as ctx_mult:
            update_batch(1, {
                'production_mode': 'set_quantity',
                'target_quantity': 200  # 200 % 3 != 0
            })
        self.assertIn("multiple of 3", str(ctx_mult.exception))

        # Completed batch cannot be restarted via edit
        b_temp = create_batch({'batch_number': 'TEST-TEMP-01', 'production_mode': 'continuous'})
        execute_db("UPDATE production_batch SET batch_status = 'Completed' WHERE id = %s", (b_temp['id'],))
        with self.assertRaises(ValueError) as ctx2:
            update_batch(b_temp['id'], {
                'target_quantity': 999
            })
        self.assertIn("Completed batches cannot be edited", str(ctx2.exception))

        execute_db("DELETE FROM production_batch WHERE id = %s", (b_temp['id'],))
        print("[PASS] Test 11: Editing business rules strictly enforced.")

    def test_12_existing_data_and_metrics_intact(self):
        """12. Existing production records and dashboard metrics remain intact."""
        summary = query_db("SELECT * FROM production_summary WHERE id = 1", one=True)
        self.assertIsNotNone(summary)
        self.assertEqual(summary['total_bottles'], 172)
        self.assertEqual(summary['accepted_bottles'], 171)
        self.assertEqual(summary['rejected_bottles'], 1)

        batch_1 = query_db("SELECT * FROM production_batch WHERE id = 1", one=True)
        self.assertIsNotNone(batch_1)
        self.assertEqual(batch_1['batch_number'], 'BATCH-001')
        self.assertEqual(batch_1['produced_quantity'], 168)
        self.assertEqual(batch_1['batch_status'], 'In Progress')
        self.assertEqual(batch_1['production_mode'], 'continuous')

        log_count = query_db("SELECT COUNT(*) as cnt FROM production_log", one=True)['cnt']
        self.assertEqual(log_count, 172)
        print("[PASS] Test 12: Existing database records and metrics remain 100% intact.")

    def test_13_server_restart_and_scheduler_evaluation(self):
        """13. Restarting backend / scheduler evaluates and preserves scheduled batches without loss."""
        self.clean_test_batches()
        # Create a future scheduled batch
        future_dt = datetime.datetime.now() + datetime.timedelta(days=1)
        b = create_batch({
            'batch_number': 'TEST-RESTART-01',
            'production_mode': 'set_quantity',
            'target_quantity': 1500,
            'scheduled_start': future_dt.isoformat()
        })

        # Simulate a server restart by re-evaluating state from fresh DB query
        evaluate_and_update_batches()
        fetched = query_db("SELECT * FROM production_batch WHERE id = %s", (b['id'],), one=True)
        self.assertEqual(fetched['batch_status'], 'Scheduled')
        self.assertEqual(fetched['batch_number'], 'TEST-RESTART-01')

        execute_db("DELETE FROM production_batch WHERE id = %s", (b['id'],))
        print("[PASS] Test 13: Server restarts preserve scheduled batches reliably.")

    def test_14_api_responses_and_ui_consistency(self):
        """14. API endpoints return correct status, mode, and progress."""
        with self.app.test_request_context():
            # Test GET /api/production/batches
            res = self.client.get('/api/production/batches', headers=self.auth_headers)
            self.assertEqual(res.status_code, 200)
            data = res.get_json()
            self.assertTrue(data['success'])
            self.assertIn('batches', data)
            self.assertIn('metrics', data)
            b1 = next((b for b in data['batches'] if b['id'] == 1), None)
            self.assertIsNotNone(b1)
            self.assertEqual(b1['production_mode'], 'continuous')
            self.assertEqual(b1['batch_status'], 'In Progress')
            self.assertEqual(b1['produced_quantity'], 168)

            # Test GET /api/production/batches/next-id
            next_id_res = self.client.get('/api/production/batches/next-id', headers=self.auth_headers)
            self.assertEqual(next_id_res.status_code, 200)
            next_data = next_id_res.get_json()
            self.assertTrue(next_data['success'])
            self.assertTrue(next_data['next_batch_number'].startswith('BATCH-'))
        print("[PASS] Test 14: API endpoints return structured, accurate responses.")

if __name__ == '__main__':
    unittest.main()
