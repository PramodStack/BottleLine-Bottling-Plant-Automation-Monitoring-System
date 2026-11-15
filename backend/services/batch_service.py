"""
Batch Service for Production Batch Management.
Handles:
- Automatic batch number generation (BATCH-001, BATCH-002, etc.)
- Continuous vs Set Quantity production modes
- Immediate vs Scheduled start times
- Strict Single-Active-Batch invariant (at most one 'In Progress' batch at any time)
- Deterministic queue processing (earliest scheduled start, then creation time)
- Safe batch editing and stopping
- Background evaluation loop for due batches and target completion
"""

import re
import datetime
import threading
import logging
from typing import Optional, Dict, Any, List
from db import query_db, execute_db, get_db_connection

logger = logging.getLogger(__name__)

# Mutex to ensure concurrency safety across threads and requests
_batch_lock = threading.Lock()

# Background scheduler state
_scheduler_started = False
_scheduler_thread = None

def get_current_time() -> datetime.datetime:
    """Returns the current local time."""
    return datetime.datetime.now()

def parse_datetime(dt_str: Optional[str]) -> Optional[datetime.datetime]:
    """Safely parses date/time strings into a datetime object."""
    if not dt_str:
        return None
    dt_str = str(dt_str).strip()
    if not dt_str or dt_str.lower() in ('none', 'null', ''):
        return None
    
    # Try common formats
    formats = [
        '%Y-%m-%dT%H:%M:%S',
        '%Y-%m-%dT%H:%M',
        '%Y-%m-%d %H:%M:%S',
        '%Y-%m-%d %H:%M',
        '%Y-%m-%d',
    ]
    for fmt in formats:
        try:
            return datetime.datetime.strptime(dt_str, fmt)
        except ValueError:
            continue
    
    # Fallback to dateutil if available or ISO fromisoformat
    try:
        # Strip timezone offset if present for local naive comparison
        clean_str = dt_str.replace('Z', '').split('+')[0]
        return datetime.datetime.fromisoformat(clean_str)
    except Exception:
        pass
    
    return None

def format_datetime(dt: Optional[datetime.datetime]) -> Optional[str]:
    """Formats datetime object to standard string."""
    if isinstance(dt, datetime.datetime):
        return dt.strftime('%Y-%m-%d %H:%M:%S')
    return str(dt) if dt else None

def get_next_batch_number() -> str:
    """
    Generates the next sequential unique batch ID like BATCH-001, BATCH-002.
    Scans all existing batch_numbers to avoid collisions.
    """
    with _batch_lock:
        rows = query_db("SELECT id, batch_number FROM production_batch") or []
        highest_num = 0
        pattern = re.compile(r'^BATCH-(\d+)$', re.IGNORECASE)
        
        for r in rows:
            b_num = str(r.get('batch_number') or '')
            match = pattern.match(b_num.strip())
            if match:
                try:
                    num = int(match.group(1))
                    if num > highest_num:
                        highest_num = num
                except ValueError:
                    pass
            # Also consider the primary key ID as a lower bound
            row_id = r.get('id') or 0
            if isinstance(row_id, int) and row_id > highest_num:
                highest_num = max(highest_num, row_id)
        
        next_num = highest_num + 1
        candidate = f"BATCH-{next_num:03d}"
        
        # Double check candidate does not exist in DB
        existing_numbers = {str(r.get('batch_number')).strip().upper() for r in rows if r.get('batch_number')}
        while candidate.upper() in existing_numbers:
            next_num += 1
            candidate = f"BATCH-{next_num:03d}"
            
        return candidate

def evaluate_and_update_batches():
    """
    Core state-machine evaluation function.
    Must be called:
    1. Periodically by the background scheduler
    2. Synchronously on batch read/write API calls
    
    Invariants enforced:
    - At most ONE batch can be 'In Progress'.
    - If active batch is 'set_quantity' and reached target -> 'Completed'.
    - If line is free -> activate the highest priority due batch ('Pending' or 'Scheduled' where scheduled_start <= NOW).
    - If line is busy -> scheduled batches whose scheduled_start <= NOW become 'Pending' (waiting in queue).
    """
    with _batch_lock:
        now = get_current_time()
        
        # 1. Inspect current 'In Progress' batches
        active_batches = query_db(
            "SELECT id, batch_number, production_mode, target_quantity, produced_quantity, batch_status "
            "FROM production_batch WHERE batch_status = 'In Progress' ORDER BY id ASC"
        ) or []
        
        # Safety invariant check: if for any reason > 1 batch is In Progress, keep only the earliest one active
        if len(active_batches) > 1:
            logger.warning(f"Invariant breach detected: {len(active_batches)} batches In Progress. Resolving...")
            primary_active = active_batches[0]
            for extra in active_batches[1:]:
                execute_db(
                    "UPDATE production_batch SET batch_status = 'Pending' WHERE id = %s",
                    (extra['id'],)
                )
            active_batches = [primary_active]
            
        active_batch = active_batches[0] if active_batches else None

        # Synchronize produced_quantity for active batch with actual production logs
        if active_batch:
            b_id = active_batch['id']
            # Link any newly inserted production_log rows (from DIAView VBScript) to the active batch
            execute_db(
                "UPDATE production_log SET batch_id = %s WHERE batch_id IS NULL",
                (b_id,)
            )

            # Recalculate true bottle count produced for this batch
            cnt_row = query_db(
                "SELECT COUNT(*) as cnt FROM production_log WHERE batch_id = %s",
                (b_id,),
                one=True
            )
            real_count = int(cnt_row.get('cnt') or 0)
            if real_count != int(active_batch.get('produced_quantity') or 0):
                execute_db(
                    "UPDATE production_batch SET produced_quantity = %s WHERE id = %s",
                    (real_count, b_id)
                )
                active_batch['produced_quantity'] = real_count

        # 2. Check if active batch has completed (Quantity-based only)
        if active_batch:
            mode = (active_batch.get('production_mode') or 'continuous').strip().lower()
            target = active_batch.get('target_quantity')
            produced = int(active_batch.get('produced_quantity') or 0)
            batch_id = active_batch['id']
            
            if mode == 'set_quantity' and target is not None and int(target) > 0 and produced >= int(target):
                # Auto complete batch
                execute_db(
                    "UPDATE production_batch SET batch_status = 'Completed', completed_at = %s "
                    "WHERE id = %s AND batch_status = 'In Progress'",
                    (now, batch_id)
                )
                logger.info(f"Batch {active_batch.get('batch_number')} (ID {batch_id}) reached target {target} and is COMPLETED.")
                active_batch = None  # Slot is now released!
        
        # 3. If line is free (no active batch), find the next eligible waiting batch
        if not active_batch:
            # An eligible batch is Scheduled or Pending, and if scheduled_start is set, scheduled_start <= now
            eligible = query_db(
                "SELECT id, batch_number, production_mode, target_quantity, scheduled_start, created_at "
                "FROM production_batch "
                "WHERE batch_status IN ('Pending', 'Scheduled') "
                "  AND (scheduled_start IS NULL OR scheduled_start <= %s) "
                "ORDER BY "
                "  CASE WHEN scheduled_start IS NOT NULL THEN scheduled_start ELSE created_at END ASC, "
                "  created_at ASC, id ASC "
                "LIMIT 1",
                (now,),
                one=True
            )
            
            if eligible:
                # Concurrency-safe atomic activation: check again inside SQL that no batch is In Progress
                rows_updated = execute_db(
                    "UPDATE production_batch "
                    "SET batch_status = 'In Progress', actual_start = %s "
                    "WHERE id = %s AND batch_status IN ('Pending', 'Scheduled') "
                    "  AND (SELECT COUNT(*) FROM (SELECT id FROM production_batch WHERE batch_status = 'In Progress') t) = 0",
                    (now, eligible['id'])
                )
                if rows_updated:
                    logger.info(f"Activated next eligible batch: {eligible.get('batch_number')} (ID: {eligible['id']})")
                    active_batch = eligible

        # 4. For any remaining 'Scheduled' batch whose scheduled_start has passed while line is busy,
        # update status to 'Pending' (Queued) so UI clearly indicates it's waiting
        execute_db(
            "UPDATE production_batch SET batch_status = 'Pending' "
            "WHERE batch_status = 'Scheduled' AND scheduled_start IS NOT NULL AND scheduled_start <= %s",
            (now,)
        )

def create_batch(data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Creates a new batch adhering to all business rules:
    - Mode: 'continuous' or 'set_quantity'
    - Auto-generated or custom unique batch identifier
    - Optional scheduled_start date and time
    - Automatic initial status ('Scheduled', 'Pending', or 'In Progress')
    """
    with _batch_lock:
        now = get_current_time()
        
        # 1. Batch Number
        batch_number = (data.get('batch_number') or '').strip()
        if not batch_number:
            batch_number = get_next_batch_number()
        else:
            # Check uniqueness
            existing = query_db(
                "SELECT id FROM production_batch WHERE batch_number = %s",
                (batch_number,),
                one=True
            )
            if existing:
                raise ValueError(f"Batch identifier '{batch_number}' already exists. Please choose a unique identifier or leave blank for auto-generation.")
                
        # 2. Production Mode & Target Quantity
        raw_mode = (data.get('production_mode') or '').strip().lower()
        if raw_mode in ('set_quantity', 'quantity', 'fixed'):
            production_mode = 'set_quantity'
            raw_target = data.get('target_quantity')
            if raw_target is None or str(raw_target).strip() == '':
                raise ValueError("Target quantity is required for Set Quantity production mode.")
            try:
                target_quantity = int(raw_target)
            except (ValueError, TypeError):
                raise ValueError("Target quantity must be a positive whole number.")
            if target_quantity <= 0:
                raise ValueError("Target quantity must be a positive whole number greater than 0.")
            if target_quantity % 3 != 0:
                suggested = ((target_quantity // 3) + 1) * 3
                raise ValueError(
                    f"Target quantity ({target_quantity}) must be a multiple of 3 to match the box size (3 bottles per box). Suggested: {suggested} bottles ({suggested // 3} boxes)."
                )
        else:
            production_mode = 'continuous'
            target_quantity = None
            
        # 3. Scheduled Start Date/Time
        raw_scheduled = data.get('scheduled_start')
        scheduled_start = parse_datetime(raw_scheduled)
        
        # 4. Determine Initial Status automatically
        # Never allow manual status selection
        is_future = scheduled_start is not None and scheduled_start > now
        
        if is_future:
            initial_status = 'Scheduled'
            actual_start = None
        else:
            # Immediate batch or scheduled time in the past
            # Check if line is free
            active = query_db(
                "SELECT id FROM production_batch WHERE batch_status = 'In Progress' LIMIT 1",
                one=True
            )
            if active:
                initial_status = 'Pending'
                actual_start = None
            else:
                initial_status = 'In Progress'
                actual_start = now
                
        # 5. Insert into production_batch
        new_id = execute_db(
            "INSERT INTO production_batch "
            "(batch_number, production_mode, target_quantity, scheduled_start, actual_start, produced_quantity, batch_status) "
            "VALUES (%s, %s, %s, %s, %s, %s, %s)",
            (
                batch_number,
                production_mode,
                target_quantity,
                scheduled_start,
                actual_start,
                0,
                initial_status
            ),
            return_id=True
        )
        
        batch_row = query_db(
            "SELECT * FROM production_batch WHERE id = %s",
            (new_id,),
            one=True
        )
        
    # Trigger evaluation in case other batches need adjustment
    evaluate_and_update_batches()
    return format_batch_row(batch_row)

def update_batch(batch_id: int, data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Safely edits an existing batch:
    - Preserves batch identifier
    - Cannot reduce target quantity below already produced units
    - Cannot restart a completed batch silently
    - Respects single active batch invariant
    """
    with _batch_lock:
        now = get_current_time()
        
        batch = query_db(
            "SELECT * FROM production_batch WHERE id = %s",
            (batch_id,),
            one=True
        )
        if not batch:
            raise LookupError(f"Batch with ID {batch_id} not found.")
            
        current_status = (batch.get('batch_status') or '').strip()
        produced_qty = int(batch.get('produced_quantity') or 0)
        
        if current_status == 'Completed':
            raise ValueError("Completed batches cannot be edited to alter production mode or restart production.")
            
        if current_status == 'Stopped':
            raise ValueError("Stopped batches cannot be edited. Please create a new batch or restart via authorized procedure.")
            
        # Check production mode update
        raw_mode = data.get('production_mode')
        if raw_mode:
            new_mode = raw_mode.strip().lower()
            if new_mode not in ('continuous', 'set_quantity'):
                raise ValueError("Production mode must be either 'continuous' or 'set_quantity'.")
        else:
            new_mode = batch.get('production_mode') or 'continuous'
            
        # Check target quantity update
        if new_mode == 'set_quantity':
            raw_target = data.get('target_quantity')
            if raw_target is None or str(raw_target).strip() == '':
                # If existing target was valid and not passed, keep it
                if batch.get('target_quantity') and batch['target_quantity'] > 0:
                    new_target = batch['target_quantity']
                else:
                    raise ValueError("Target quantity is required for Set Quantity production mode.")
            else:
                try:
                    new_target = int(raw_target)
                except (ValueError, TypeError):
                    raise ValueError("Target quantity must be a positive whole number.")
                if new_target <= 0:
                    raise ValueError("Target quantity must be greater than 0.")
                if new_target % 3 != 0:
                    suggested = ((new_target // 3) + 1) * 3
                    raise ValueError(
                        f"Target quantity ({new_target}) must be a multiple of 3 to match the box size (3 bottles per box). Suggested: {suggested} bottles ({suggested // 3} boxes)."
                    )
                    
            if new_target < produced_qty:
                raise ValueError(
                    f"Target quantity ({new_target}) cannot be less than the already produced quantity ({produced_qty} units)."
                )
        else:
            new_target = None
            
        # Check scheduled start update
        if 'scheduled_start' in data:
            raw_sched = data.get('scheduled_start')
            new_scheduled = parse_datetime(raw_sched)
            
            # If batch is already In Progress, scheduled start cannot be changed to future
            if current_status == 'In Progress' and new_scheduled and new_scheduled > now:
                raise ValueError("Cannot reschedule a batch that is already In Progress.")
        else:
            new_scheduled = batch.get('scheduled_start')
            
        # Determine updated status if batch was Scheduled or Pending
        updated_status = current_status
        if current_status in ('Scheduled', 'Pending'):
            if new_scheduled and new_scheduled > now:
                updated_status = 'Scheduled'
            else:
                # Check active batch restriction
                active = query_db(
                    "SELECT id FROM production_batch WHERE batch_status = 'In Progress' AND id != %s LIMIT 1",
                    (batch_id,),
                    one=True
                )
                if not active:
                    updated_status = 'In Progress'
                else:
                    updated_status = 'Pending'
                    
        # Apply updates
        execute_db(
            "UPDATE production_batch "
            "SET production_mode = %s, target_quantity = %s, scheduled_start = %s, batch_status = %s "
            "WHERE id = %s",
            (new_mode, new_target, new_scheduled, updated_status, batch_id)
        )
        
        updated_row = query_db(
            "SELECT * FROM production_batch WHERE id = %s",
            (batch_id,),
            one=True
        )
        
    evaluate_and_update_batches()
    return format_batch_row(updated_row)

def stop_batch(batch_id: int) -> Dict[str, Any]:
    """
    Explicitly stops a batch:
    - If In Progress: sets status to 'Stopped', records stopped_at = NOW(), and releases the active slot.
    - If Scheduled or Pending: marks as 'Stopped' (cancelled).
    - Automatically evaluates next eligible waiting batch.
    """
    with _batch_lock:
        now = get_current_time()
        batch = query_db(
            "SELECT * FROM production_batch WHERE id = %s",
            (batch_id,),
            one=True
        )
        if not batch:
            raise LookupError(f"Batch with ID {batch_id} not found.")
            
        current_status = batch.get('batch_status')
        if current_status in ('Completed', 'Stopped'):
            raise ValueError(f"Batch is already {current_status} and cannot be stopped again.")
            
        execute_db(
            "UPDATE production_batch SET batch_status = 'Stopped', stopped_at = %s WHERE id = %s",
            (now, batch_id)
        )
        logger.info(f"Batch {batch.get('batch_number')} (ID {batch_id}) has been STOPPED.")
        
    # Evaluate next batch immediately
    evaluate_and_update_batches()
    
    updated_row = query_db(
        "SELECT * FROM production_batch WHERE id = %s",
        (batch_id,),
        one=True
    )
    return format_batch_row(updated_row)

def format_batch_row(b: Dict[str, Any]) -> Dict[str, Any]:
    """Formats a database row from production_batch into standard API response format."""
    if not b:
        return {}
    tgt = b.get('target_quantity')
    prod = int(b.get('produced_quantity') or 0)
    mode = (b.get('production_mode') or 'continuous').strip().lower()
    
    tgt_val = int(tgt) if tgt is not None and tgt > 0 else 0
    progress_pct = round((prod / tgt_val * 100), 1) if (mode == 'set_quantity' and tgt_val > 0) else None
    
    return {
        'id': b['id'],
        'batch_number': b['batch_number'],
        'production_mode': mode,
        'target_quantity': tgt_val if mode == 'set_quantity' else None,
        'produced_quantity': prod,
        'batch_status': b.get('batch_status') or 'Pending',
        'status': b.get('batch_status') or 'Pending',
        'progress_percentage': progress_pct,
        'scheduled_start': format_datetime(b.get('scheduled_start')),
        'actual_start': format_datetime(b.get('actual_start')),
        'completed_at': format_datetime(b.get('completed_at')),
        'stopped_at': format_datetime(b.get('stopped_at')),
        'created_at': format_datetime(b.get('created_at'))
    }

def record_bottle_production(batch_id: Optional[int] = None) -> Optional[int]:
    """
    Called when a bottle is produced in the plant/simulation.
    Associates the bottle with the currently In Progress batch and increments produced_quantity.
    Triggers auto-completion if target is reached.
    """
    with _batch_lock:
        active = None
        if batch_id:
            active = query_db(
                "SELECT * FROM production_batch WHERE id = %s AND batch_status = 'In Progress'",
                (batch_id,),
                one=True
            )
        if not active:
            active = query_db(
                "SELECT * FROM production_batch WHERE batch_status = 'In Progress' ORDER BY id ASC LIMIT 1",
                one=True
            )
            
        if active:
            b_id = active['id']
            execute_db(
                "UPDATE production_batch SET produced_quantity = produced_quantity + 1 WHERE id = %s",
                (b_id,)
            )
            return b_id
    
    evaluate_and_update_batches()
    return None

def start_batch_scheduler(poll_interval: float = 3.0):
    """
    Starts the persistent background daemon thread that runs evaluate_and_update_batches()
    every poll_interval seconds.
    Survives app lifecycle and handles server restarts cleanly.
    """
    global _scheduler_started, _scheduler_thread
    if _scheduler_started:
        return
        
    _scheduler_started = True
    
    def _run_scheduler():
        import time
        logger.info(f"Production Batch Scheduler started (poll interval: {poll_interval}s).")
        while True:
            try:
                evaluate_and_update_batches()
            except Exception as e:
                logger.error(f"Error in batch scheduler loop: {e}")
            time.sleep(poll_interval)
            
    _scheduler_thread = threading.Thread(target=_run_scheduler, daemon=True, name="BatchSchedulerThread")
    _scheduler_thread.start()
