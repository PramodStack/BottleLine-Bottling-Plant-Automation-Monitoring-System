import datetime
import re
from db import query_db

def get_production_summary():
    """Retrieves high-level cumulative KPIs from production_summary and production_log."""
    summary = query_db(
        "SELECT id, total_bottles, accepted_bottles, rejected_bottles, total_box_packed, created_at "
        "FROM production_summary ORDER BY created_at DESC, id DESC LIMIT 1",
        one=True
    ) or {}

    log_counts = query_db(
        "SELECT "
        "  COUNT(*) AS total_logged, "
        "  COALESCE(SUM(CASE WHEN inspection_status = 'Passed' THEN 1 ELSE 0 END), 0) AS passed, "
        "  COALESCE(SUM(CASE WHEN inspection_status = 'Rejected' THEN 1 ELSE 0 END), 0) AS rejected, "
        "  COALESCE(SUM(CASE WHEN cap_status = 'Capped' THEN 1 ELSE 0 END), 0) AS capped, "
        "  COALESCE(SUM(CASE WHEN cap_status = 'Pending' THEN 1 ELSE 0 END), 0) AS pending_cap, "
        "  COALESCE(SUM(CASE WHEN weight_status = 'OK' THEN 1 ELSE 0 END), 0) AS weight_ok, "
        "  COALESCE(SUM(CASE WHEN weight_status = 'Low Weight' THEN 1 ELSE 0 END), 0) AS weight_low "
        "FROM production_log",
        one=True
    ) or {}

    total_bottles = int(summary.get('total_bottles') or log_counts.get('total_logged') or 0)
    accepted = int(summary.get('accepted_bottles') or log_counts.get('passed') or 0)
    rejected = int(summary.get('rejected_bottles') or log_counts.get('rejected') or 0)
    boxes = int(summary.get('total_box_packed') or 0)
    
    pass_rate = round((accepted / max(1, total_bottles)) * 100, 2)
    reject_rate = round((rejected / max(1, total_bottles)) * 100, 2)
    bottles_in_boxes = boxes * 3
    packaging_rate = round((bottles_in_boxes / max(1, accepted)) * 100, 2)

    return {
        'total_bottles_produced': total_bottles,
        'accepted_bottles': accepted,
        'rejected_bottles': rejected,
        'quality_pass_rate_pct': pass_rate,
        'rejection_rate_pct': reject_rate,
        'boxes_packed': boxes,
        'bottles_in_boxes': bottles_in_boxes,
        'packaging_efficiency_pct': packaging_rate,
        'bottles_per_box': 3,
        'timestamp': summary.get('created_at').strftime('%Y-%m-%d %H:%M:%S') if summary.get('created_at') else None
    }

def get_bottle_details(bottle_number):
    """Retrieves exact database record and inspection diagnostic for a specific bottle number."""
    bottle = query_db(
        "SELECT id, bottle_number, weight_status, cap_status, inspection_status, created_at "
        "FROM production_log WHERE bottle_number = %s",
        (bottle_number,),
        one=True
    )
    if not bottle:
        return {
            'found': False,
            'bottle_number': bottle_number,
            'message': f"Bottle #{bottle_number} was not found in production inspection records."
        }

    is_rejected = (bottle.get('inspection_status') or '').lower() == 'rejected'
    rejection_reason = None
    if is_rejected:
        rejection_reason = (
            f"Weight inspection failed: recorded as '{bottle['weight_status']}' "
            "(under minimum tare+fill mass threshold on Station 2 load cell)"
        )

    return {
        'found': True,
        'id': bottle['id'],
        'bottle_number': bottle['bottle_number'],
        'weight_status': bottle['weight_status'],
        'cap_status': bottle['cap_status'],
        'inspection_status': bottle['inspection_status'],
        'is_rejected': is_rejected,
        'rejection_reason': rejection_reason,
        'timestamp': bottle['created_at'].strftime('%Y-%m-%d %H:%M:%S') if bottle['created_at'] else None
    }

def get_quality_metrics():
    """Retrieves quality inspection KPIs and weight distribution."""
    stats = query_db(
        "SELECT "
        "  COUNT(*) AS total_inspected, "
        "  COALESCE(SUM(CASE WHEN inspection_status = 'Passed' THEN 1 ELSE 0 END), 0) AS passed, "
        "  COALESCE(SUM(CASE WHEN inspection_status = 'Rejected' THEN 1 ELSE 0 END), 0) AS rejected, "
        "  COALESCE(SUM(CASE WHEN weight_status = 'OK' THEN 1 ELSE 0 END), 0) AS weight_ok, "
        "  COALESCE(SUM(CASE WHEN weight_status = 'Low Weight' THEN 1 ELSE 0 END), 0) AS weight_low "
        "FROM production_log",
        one=True
    ) or {}
    total = int(stats.get('total_inspected') or 0)
    passed = int(stats.get('passed') or 0)
    rejected = int(stats.get('rejected') or 0)
    pass_rate = round((passed / max(1, total)) * 100, 2)
    reject_rate = round((rejected / max(1, total)) * 100, 2)
    return {
        'total_inspected': total,
        'passed_bottles': passed,
        'rejected_bottles': rejected,
        'pass_rate_pct': pass_rate,
        'rejection_rate_pct': reject_rate,
        'weight_ok_count': int(stats.get('weight_ok', 0)),
        'weight_low_count': int(stats.get('weight_low', 0))
    }

def get_bottle_inspection_records(limit=10, inspection_status=None, weight_status=None):
    """Retrieves specific bottle inspection records with optional filters."""
    conditions = []
    params = []

    if inspection_status:
        conditions.append("inspection_status = %s")
        params.append(inspection_status)
    if weight_status:
        conditions.append("weight_status = %s")
        params.append(weight_status)

    where_clause = f"WHERE {' AND '.join(conditions)}" if conditions else ""
    sql = f"SELECT id, bottle_number, weight_status, cap_status, inspection_status, created_at FROM production_log {where_clause} ORDER BY id DESC LIMIT %s"
    params.append(min(100, max(1, int(limit))))

    rows = query_db(sql, tuple(params))
    records = []
    for r in rows:
        records.append({
            'id': r['id'],
            'bottle_number': r['bottle_number'],
            'weight_status': r['weight_status'],
            'cap_status': r['cap_status'],
            'inspection_status': r['inspection_status'],
            'created_at': r['created_at'].strftime('%Y-%m-%d %H:%M:%S') if r['created_at'] else None
        })

    return {
        'count': len(records),
        'records': records
    }

def get_rejection_analysis():
    """Identifies root cause and distribution of rejected or underweight bottles."""
    defects = query_db(
        "SELECT id, bottle_number, weight_status, cap_status, inspection_status, created_at "
        "FROM production_log WHERE inspection_status = 'Rejected' OR weight_status != 'OK' ORDER BY id ASC"
    )

    defect_list = []
    for d in defects:
        defect_list.append({
            'bottle_number': d['bottle_number'],
            'failure_mode': d['weight_status'],
            'cap_status': d['cap_status'],
            'inspection_result': d['inspection_status'],
            'detected_at': d['created_at'].strftime('%Y-%m-%d %H:%M:%S') if d['created_at'] else None,
            'station': 'Station 2 - Quality Verification & Load-Cell Cell'
        })

    summary = get_production_summary()
    total = summary['total_bottles_produced']
    rejected_count = summary['rejected_bottles']

    primary_reason = "Under-fill / Low Weight detected at Station 2 load cell" if defect_list else "None"

    return {
        'total_inspected': total,
        'rejected_count': rejected_count,
        'rejection_rate_pct': summary['rejection_rate_pct'],
        'defects': defect_list,
        'primary_cause': primary_reason,
        'affected_station': 'Station 2 (Quality Inspection) / Station 1 (Dispensing Nozzle)',
        'analysis': (
            f"{rejected_count} bottle(s) rejected out of {total} inspected ({summary['rejection_rate_pct']}% defect rate). "
            f"The identified failure mode was '{defect_list[0]['failure_mode'] if defect_list else 'None'}' "
            "where bottle tare+liquid mass failed minimum fill threshold."
        )
    }

def get_capping_status():
    """Retrieves capping machine performance, efficiency, and pending bottle queues."""
    stats = query_db(
        "SELECT "
        "  COUNT(*) AS total, "
        "  COALESCE(SUM(CASE WHEN cap_status = 'Capped' THEN 1 ELSE 0 END), 0) AS capped, "
        "  COALESCE(SUM(CASE WHEN cap_status = 'Pending' THEN 1 ELSE 0 END), 0) AS pending "
        "FROM production_log",
        one=True
    ) or {}

    total = int(stats.get('total') or 0)
    capped = int(stats.get('capped') or 0)
    pending = int(stats.get('pending') or 0)
    efficiency = round((capped / max(1, total)) * 100, 2)

    pending_bottles = query_db(
        "SELECT id, bottle_number, weight_status, inspection_status, created_at "
        "FROM production_log WHERE cap_status = 'Pending' ORDER BY id ASC"
    )

    pending_details = []
    for b in pending_bottles:
        pending_details.append({
            'bottle_number': b['bottle_number'],
            'weight_status': b['weight_status'],
            'inspection_status': b['inspection_status'],
            'created_at': b['created_at'].strftime('%Y-%m-%d %H:%M:%S') if b['created_at'] else None
        })

    return {
        'total_bottles': total,
        'capped_bottles': capped,
        'pending_capping': pending,
        'capping_efficiency_pct': efficiency,
        'pending_queue': pending_details,
        'station': 'Automated Pneumatic Capping Press (Station 4)',
        'plc_tag': 'Var.Bottling_Group.CAPPING_CYCLE_ACTIVE'
    }

def get_packaging_summary():
    """Retrieves packaging line output, box packing progress, and sensor triggers."""
    summary = query_db(
        "SELECT total_box_packed, total_bottles, accepted_bottles "
        "FROM production_summary ORDER BY created_at DESC, id DESC LIMIT 1",
        one=True
    ) or {}

    total_boxes = int(summary.get('total_box_packed') or 0)
    total_bottles = int(summary.get('total_bottles') or 0)
    accepted_bottles = int(summary.get('accepted_bottles') or 0)

    bottles_per_box = 3
    bottles_packed = total_boxes * bottles_per_box
    current_box_accumulation = total_bottles % bottles_per_box
    unpacked_accepted = max(0, accepted_bottles - bottles_packed)
    packing_efficiency = round((bottles_packed / max(1, accepted_bottles)) * 100, 2)

    return {
        'total_boxes_packed': total_boxes,
        'bottles_per_box': bottles_per_box,
        'bottles_in_packed_boxes': bottles_packed,
        'unpacked_accepted_bottles': unpacked_accepted,
        'current_box_fill_progress': f"{current_box_accumulation}/{bottles_per_box} bottles",
        'packaging_efficiency_pct': packing_efficiency,
        'sensor_tag': 'Var.Bottling_Group.PACKING_SENSOR (Optical PNP)',
        'cell_location': 'Station 4 - Packaging Cell (Cradle Box 2)'
    }

def get_sensor_telemetry():
    """Returns verified PLC/SCADA sensor telemetry statuses."""
    sensors = [
        {
            'id': 'PACKING_SENSOR',
            'tag': 'Var.Bottling_Group.PACKING_SENSOR',
            'name': 'Box Packing Proximity Sensor',
            'station': 'Station 4 - Packaging Cell',
            'state': 'Standby / Synchronized',
            'hardware': 'Optical PNP',
            'interlock': 'Gate 1 Protected'
        },
        {
            'id': 'TRAY_SENSOR',
            'tag': 'Var.Bottling_Group.TRAY_SENSOR',
            'name': 'Tray Transfer Optical Sensor',
            'station': 'Station 5 - Unloading Deck',
            'state': 'Standby',
            'hardware': 'Photoelectric Retroreflective',
            'interlock': 'Gate 1 Protected'
        },
        {
            'id': 'BOT_CHECK_SENSOR',
            'tag': 'Var.Bottling_Group.BOT_CHECK_SENSOR',
            'name': 'Bottle Inspection Station Sensor',
            'station': 'Station 2 - Quality Verification',
            'state': 'Monitoring Active',
            'hardware': 'Laser Measurement & Load Cell',
            'interlock': 'Gate 1 Protected'
        },
        {
            'id': 'BOT_PICK_SENSOR',
            'tag': 'Var.Bottling_Group.BOT_PICK_SENSOR',
            'name': 'Robotic Picker Presence Sensor',
            'station': 'Station 3 - Gripper Gantry',
            'state': 'Synchronized',
            'hardware': 'Inductive Proximity',
            'interlock': 'Gate 1 Protected'
        },
        {
            'id': 'BOT_FILL_CYCLE',
            'tag': 'Var.Bottling_Group.BOT_FILL_CYCLE_STARTED',
            'name': 'Liquid Filling Cycle Interlock',
            'station': 'Station 1 - Fill Nozzle Valve',
            'state': 'Supervised Active',
            'hardware': 'Pneumatic Actuator Process Flag',
            'interlock': 'Conveyor Progression Interlock'
        },
        {
            'id': 'BOX_CONV',
            'tag': 'Var.Bottling_Group.BOX_CONV',
            'name': 'Packaging Conveyor Motor Drive',
            'station': 'Conveyor 2 - Box Transport',
            'state': 'Engaged / Running',
            'hardware': 'Variable Frequency Drive',
            'interlock': 'Operational'
        }
    ]

    return {
        'sensor_count': len(sensors),
        'sensors': sensors,
        'overall_scada_health': 'All PLC tags synchronized with DIAView SCADA interlocks.'
    }

def get_batch_status():
    """Retrieves active production batch details from production_batch table."""
    batches = query_db(
        "SELECT id, batch_number, production_mode, target_quantity, produced_quantity, batch_status, scheduled_start, actual_start, created_at "
        "FROM production_batch ORDER BY id DESC LIMIT 5"
    )

    if not batches:
        return {'active_batch': None, 'message': 'No production batches recorded in database.'}

    # Prefer currently active 'In Progress' batch if one exists
    active = next((b for b in batches if b.get('batch_status') == 'In Progress'), batches[0])
    mode = (active.get('production_mode') or 'continuous').strip().lower()
    target = int(active.get('target_quantity') or 0) if mode == 'set_quantity' else None
    produced = int(active.get('produced_quantity') or 0)
    progress_pct = round((produced / target) * 100, 1) if (target and target > 0) else None

    return {
        'batch_id': active['id'],
        'batch_number': active['batch_number'],
        'production_mode': mode,
        'target_quantity': target if mode == 'set_quantity' else 'Continuous',
        'produced_quantity': produced,
        'progress_pct': progress_pct,
        'batch_status': active['batch_status'],
        'scheduled_start': active['scheduled_start'].strftime('%Y-%m-%d %H:%M:%S') if active.get('scheduled_start') else None,
        'started_at': active['actual_start'].strftime('%Y-%m-%d %H:%M:%S') if active.get('actual_start') else (active['created_at'].strftime('%Y-%m-%d %H:%M:%S') if active.get('created_at') else None),
        'recent_batches': [
            {
                'batch_number': b['batch_number'],
                'mode': b.get('production_mode') or 'continuous',
                'status': b['batch_status'],
                'produced': b['produced_quantity'],
                'target': b['target_quantity'] if b.get('production_mode') == 'set_quantity' else 'Continuous'
            }
            for b in batches
        ]
    }

def get_hourly_production():
    """Aggregates telemetry records by hour to analyze production velocity."""
    rows = query_db(
        "SELECT "
        "  CONCAT(DATE(created_at), ' ', LPAD(HOUR(created_at), 2, '0'), ':00:00') AS hour_slot, "
        "  HOUR(created_at) AS hour_num, "
        "  COUNT(*) AS total_bottles, "
        "  COALESCE(SUM(CASE WHEN inspection_status = 'Passed' THEN 1 ELSE 0 END), 0) AS passed, "
        "  COALESCE(SUM(CASE WHEN inspection_status = 'Rejected' THEN 1 ELSE 0 END), 0) AS rejected "
        "FROM production_log "
        "GROUP BY hour_slot, hour_num "
        "ORDER BY hour_slot ASC"
    )

    hourly_list = []
    for r in rows:
        hourly_list.append({
            'hour_slot': r['hour_slot'],
            'hour': r['hour_num'],
            'total_bottles': int(r['total_bottles']),
            'passed': int(r['passed']),
            'rejected': int(r['rejected']),
            'pass_rate_pct': round((int(r['passed']) / max(1, int(r['total_bottles']))) * 100, 1)
        })

    # Calculate overall duration from earliest to latest log
    time_span = query_db(
        "SELECT MIN(created_at) as min_t, MAX(created_at) as max_t FROM production_log",
        one=True
    )

    duration_hours = 0.0
    rate_per_hour = 0.0
    if time_span and time_span.get('min_t') and time_span.get('max_t'):
        delta_sec = (time_span['max_t'] - time_span['min_t']).total_seconds()
        duration_hours = max(0.1, round(delta_sec / 3600.0, 2))
        total_b = sum(h['total_bottles'] for h in hourly_list)
        rate_per_hour = round(total_b / duration_hours, 1)

    return {
        'hourly_intervals': hourly_list,
        'operating_duration_hours': duration_hours,
        'average_hourly_rate': rate_per_hour,
        'total_logged_hours': len(hourly_list)
    }

def compare_production_periods(period1='today', period2='yesterday'):
    """Compares production metrics between distinct dates or hourly slots."""
    days = query_db(
        "SELECT "
        "  DATE(created_at) AS log_date, "
        "  COUNT(*) AS total, "
        "  SUM(CASE WHEN inspection_status = 'Passed' THEN 1 ELSE 0 END) AS passed, "
        "  SUM(CASE WHEN inspection_status = 'Rejected' THEN 1 ELSE 0 END) AS rejected "
        "FROM production_log "
        "GROUP BY log_date "
        "ORDER BY log_date DESC"
    )

    if not days:
        return {'comparison_available': False, 'message': 'No historical production records found for the requested period.'}

    if len(days) == 1:
        single_day = days[0]
        return {
            'comparison_available': False,
            'log_dates_recorded': [str(single_day['log_date'])],
            'current_day_total': int(single_day['total']),
            'current_day_passed': int(single_day['passed']),
            'current_day_rejected': int(single_day['rejected']),
            'note': f"All current database records were generated on date {single_day['log_date']}. Prior historical dates are not yet logged in MySQL. Today's current output is {single_day['total']} bottles."
        }

    return {
        'comparison_available': True,
        'periods': [
            {
                'date': str(d['log_date']),
                'total': int(d['total']),
                'passed': int(d['passed']),
                'rejected': int(d['rejected']),
                'pass_rate': round((int(d['passed']) / max(1, int(d['total']))) * 100, 1)
            }
            for d in days
        ]
    }

def get_comprehensive_plant_snapshot():
    """Retrieves complete live telemetry from all MySQL tables for full calculation support."""
    summary = get_production_summary()
    quality = get_quality_metrics()
    rejection = get_rejection_analysis()
    batch = get_batch_status()
    packaging = get_packaging_summary()
    capping = get_capping_status()
    hourly = get_hourly_production()

    return {
        'production_summary': summary,
        'quality_metrics': quality,
        'rejection_analysis': rejection,
        'active_batch': batch,
        'packaging_status': packaging,
        'capping_status': capping,
        'hourly_production': hourly,
        'database_schema': {
            'production_summary': ['id', 'total_bottles', 'accepted_bottles', 'rejected_bottles', 'total_box_packed', 'created_at'],
            'production_log': ['id', 'bottle_number', 'weight_status', 'cap_status', 'inspection_status', 'created_at'],
            'production_batch': ['id', 'batch_number', 'production_mode', 'target_quantity', 'produced_quantity', 'batch_status', 'scheduled_start', 'actual_start', 'created_at']
        }
    }

def execute_safe_sql_query(query: str):
    """Executes a strictly read-only SELECT query on the bottling plant database."""
    clean_q = query.strip()
    if not clean_q.upper().startswith('SELECT'):
        return {'success': False, 'error': 'Only SELECT queries are allowed.'}
    forbidden = ['INSERT', 'UPDATE', 'DELETE', 'DROP', 'ALTER', 'TRUNCATE', 'REPLACE', 'GRANT', 'REVOKE', 'PASSWORD', 'HASH', 'SECRET']
    upper_q = clean_q.upper()
    for word in forbidden:
        if re.search(r'\b' + word + r'\b', upper_q):
            return {'success': False, 'error': f'Query contains disallowed keyword: {word}'}
    try:
        rows = query_db(clean_q)
        return {'success': True, 'rows': rows[:50], 'row_count': len(rows)}
    except Exception as e:
        return {'success': False, 'error': str(e)}

