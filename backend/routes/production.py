import datetime
from flask import Blueprint, request, jsonify
from db import query_db, execute_db
from routes.auth import require_auth
from security import (
    require_roles,
    ROLE_OWNER,
    ROLE_SUPER_ADMIN,
    ROLE_MANAGER,
    ROLE_SUPERVISOR,
    ROLE_OPERATOR
)
from services.batch_service import (
    evaluate_and_update_batches,
    create_batch,
    update_batch,
    stop_batch,
    format_batch_row,
    get_next_batch_number
)

production_bp = Blueprint('production', __name__, url_prefix='/api/production')

@production_bp.route('/summary', methods=['GET'])
@require_auth
def get_production_summary():
    """
    Returns latest production summary record and overall KPIs from MySQL.
    Follows: SELECT * FROM production_summary ORDER BY created_at DESC, id DESC LIMIT 1
    """
    # Evaluate batches to keep state accurate and fresh
    evaluate_and_update_batches()

    summary = query_db(
        "SELECT id, total_bottles, accepted_bottles, rejected_bottles, total_box_packed, created_at "
        "FROM production_summary ORDER BY created_at DESC, id DESC LIMIT 1",
        one=True
    ) or {
        'id': 1,
        'total_bottles': 0,
        'accepted_bottles': 0,
        'rejected_bottles': 0,
        'total_box_packed': 0,
        'created_at': None
    }

    batches = query_db(
        "SELECT id, batch_number, production_mode, target_quantity, produced_quantity, batch_status, "
        "scheduled_start, actual_start, completed_at, stopped_at, created_at "
        "FROM production_batch ORDER BY created_at DESC, id DESC"
    ) or []

    total_bottles = int(summary.get('total_bottles') or 0)
    accepted = int(summary.get('accepted_bottles') or 0)
    rejected = int(summary.get('rejected_bottles') or 0)
    boxes = int(summary.get('total_box_packed') or 0)

    # Safe rate calculations without division by zero
    acceptance_rate = round((accepted / total_bottles * 100), 1) if total_bottles > 0 else 0.0
    rejection_rate = round((rejected / total_bottles * 100), 1) if total_bottles > 0 else 0.0
    packaging_rate = round((boxes * 3 / total_bottles * 100), 1) if total_bottles > 0 else 0.0

    # Format created_at
    created_at_str = summary['created_at'].strftime('%Y-%m-%d %H:%M:%S') if isinstance(summary.get('created_at'), datetime.datetime) else str(summary.get('created_at') or '')

    # Enriched batches with calculated progress and scheduling metadata
    enriched_batches = [format_batch_row(b) for b in batches]

    return jsonify({
        'success': True,
        'summary': {
            'id': summary.get('id'),
            'total_bottles': total_bottles,
            'accepted_bottles': accepted,
            'rejected_bottles': rejected,
            'total_box_packed': boxes,
            'created_at': created_at_str,
            'bottles_per_box': 3
        },
        'kpis': {
            'total_bottles': total_bottles,
            'accepted_bottles': accepted,
            'rejected_bottles': rejected,
            'total_box_packed': boxes,
            'acceptance_rate': acceptance_rate,
            'rejection_rate': rejection_rate,
            'pass_rate': acceptance_rate,
            'packaging_rate': packaging_rate,
            'total_batches': len(batches),
            'summary_update_time': created_at_str
        },
        'batches': enriched_batches
    })

def _fetch_logs_impl():
    """Shared implementation for /api/production/logs and /api/production/history"""
    page = max(1, int(request.args.get('page', 1)))
    limit = min(1000, max(5, int(request.args.get('limit', 100))))
    offset = (page - 1) * limit

    search = request.args.get('search', '').strip()
    status = (request.args.get('status') or request.args.get('inspection_status') or '').strip()
    weight_status = request.args.get('weight_status', '').strip()
    cap_status = request.args.get('cap_status', '').strip()
    date_from = request.args.get('date_from', '').strip()
    date_to = request.args.get('date_to', '').strip()

    sort_by_raw = request.args.get('sort_by', 'id').strip().lower()
    sort_dir_raw = request.args.get('sort_dir', 'DESC').strip().upper()

    # Allowed sorting fields to prevent SQL injection
    sort_mapping = {
        'id': 'id',
        'bottle_number': 'bottle_number',
        'weight_status': 'weight_status',
        'cap_status': 'cap_status',
        'inspection_status': 'inspection_status',
        'created_at': 'created_at'
    }
    safe_sort = sort_mapping.get(sort_by_raw, 'id')
    safe_dir = 'ASC' if sort_dir_raw == 'ASC' else 'DESC'

    where_clauses = []
    args = []

    if search:
        clean_search = search.lstrip('#').strip()
        search_param = f"%{clean_search if clean_search else search}%"
        where_clauses.append("(CAST(id AS CHAR) LIKE %s OR CAST(bottle_number AS CHAR) LIKE %s OR weight_status LIKE %s OR cap_status LIKE %s OR inspection_status LIKE %s)")
        args.extend([search_param, search_param, search_param, search_param, search_param])

    if status:
        where_clauses.append("inspection_status = %s")
        args.append(status)

    if weight_status:
        where_clauses.append("weight_status = %s")
        args.append(weight_status)

    if cap_status:
        where_clauses.append("cap_status = %s")
        args.append(cap_status)

    if date_from:
        where_clauses.append("created_at >= %s")
        args.append(f"{date_from} 00:00:00")

    if date_to:
        where_clauses.append("created_at <= %s")
        args.append(f"{date_to} 23:59:59")

    where_sql = f"WHERE {' AND '.join(where_clauses)}" if where_clauses else ""

    # Count total matching rows
    count_row = query_db(
        f"SELECT COUNT(*) AS total FROM production_log {where_sql}",
        args,
        one=True
    )
    total_count = count_row['total'] if count_row else 0

    # Fetch paginated rows
    query_sql = (
        f"SELECT id, bottle_number, weight_status, cap_status, inspection_status, created_at "
        f"FROM production_log {where_sql} "
        f"ORDER BY {safe_sort} {safe_dir} "
        f"LIMIT %s OFFSET %s"
    )
    logs = query_db(query_sql, args + [limit, offset]) or []

    # Format timestamps
    formatted_logs = []
    for l in logs:
        ts = l.get('created_at')
        formatted_logs.append({
            'id': l['id'],
            'bottle_number': l.get('bottle_number'),
            'weight_status': l.get('weight_status') or 'Pending',
            'cap_status': l.get('cap_status') or 'Pending',
            'inspection_status': l.get('inspection_status') or 'Pending',
            'created_at': ts.strftime('%Y-%m-%d %H:%M:%S') if isinstance(ts, datetime.datetime) else str(ts or '')
        })

    return jsonify({
        'success': True,
        'records': formatted_logs,
        'pagination': {
            'page': page,
            'limit': limit,
            'total': total_count,
            'pages': max(1, (total_count + limit - 1) // limit)
        }
    })

@production_bp.route('/logs', methods=['GET'])
@require_auth
def get_production_logs():
    return _fetch_logs_impl()

@production_bp.route('/history', methods=['GET'])
@require_auth
def get_production_history():
    return _fetch_logs_impl()

@production_bp.route('/batches', methods=['GET'])
@require_auth
def get_production_batches():
    """
    Returns batch management data from production_batch.
    Follows: SELECT * FROM production_batch ORDER BY created_at DESC, id DESC
    """
    # Evaluate batches to keep state fresh
    evaluate_and_update_batches()

    search = request.args.get('search', '').strip()
    status = request.args.get('status', '').strip()
    limit = min(100, max(1, int(request.args.get('limit', 50))))

    where_clauses = []
    args = []

    if search:
        where_clauses.append("batch_number LIKE %s")
        args.append(f"%{search}%")

    if status:
        where_clauses.append("batch_status = %s")
        args.append(status)

    where_sql = f"WHERE {' AND '.join(where_clauses)}" if where_clauses else ""

    batches = query_db(
        f"SELECT id, batch_number, production_mode, target_quantity, produced_quantity, batch_status, "
        f"scheduled_start, actual_start, completed_at, stopped_at, created_at "
        f"FROM production_batch {where_sql} ORDER BY created_at DESC, id DESC LIMIT %s",
        args + [limit]
    ) or []

    # Aggregate counts across all batches in DB
    all_batches = query_db(
        "SELECT id, batch_status FROM production_batch"
    ) or []

    total_batches = len(all_batches)
    active_batches = sum(1 for b in all_batches if (b.get('batch_status') or '').strip().lower() in ('in progress', 'active'))
    completed_batches = sum(1 for b in all_batches if (b.get('batch_status') or '').strip().lower() in ('completed', 'done'))
    pending_batches = sum(1 for b in all_batches if (b.get('batch_status') or '').strip().lower() in ('pending', 'queued'))
    scheduled_batches = sum(1 for b in all_batches if (b.get('batch_status') or '').strip().lower() in ('scheduled',))
    stopped_batches = sum(1 for b in all_batches if (b.get('batch_status') or '').strip().lower() in ('stopped',))

    formatted = [format_batch_row(b) for b in batches]

    return jsonify({
        'success': True,
        'batches': formatted,
        'metrics': {
            'total_batches': total_batches,
            'active_batches': active_batches,
            'completed_batches': completed_batches,
            'pending_batches': pending_batches,
            'scheduled_batches': scheduled_batches,
            'stopped_batches': stopped_batches
        }
    })

@production_bp.route('/batches/next-id', methods=['GET'])
@require_auth
def get_next_batch_id():
    """Returns the next sequential unique batch identifier."""
    next_id = get_next_batch_number()
    return jsonify({
        'success': True,
        'next_batch_number': next_id
    })

@production_bp.route('/batches', methods=['POST'])
@require_auth
@require_roles(ROLE_OWNER, ROLE_SUPER_ADMIN, ROLE_MANAGER)
def create_production_batch():
    """Creates a new batch adhering to continuous/set-quantity rules and scheduling."""
    data = request.get_json(silent=True) or {}
    try:
        batch = create_batch(data)
        return jsonify({
            'success': True,
            'message': f"Batch {batch['batch_number']} created successfully.",
            'batch': batch
        }), 201
    except ValueError as ve:
        return jsonify({
            'success': False,
            'message': str(ve)
        }), 400
    except Exception as e:
        return jsonify({
            'success': False,
            'message': f"Error creating batch: {str(e)}"
        }), 500

@production_bp.route('/batches/<int:batch_id>', methods=['PUT'])
@require_auth
@require_roles(ROLE_OWNER, ROLE_SUPER_ADMIN, ROLE_MANAGER)
def update_production_batch(batch_id: int):
    """Safely updates an existing batch."""
    data = request.get_json(silent=True) or {}
    try:
        batch = update_batch(batch_id, data)
        return jsonify({
            'success': True,
            'message': f"Batch {batch['batch_number']} updated successfully.",
            'batch': batch
        }), 200
    except LookupError as le:
        return jsonify({
            'success': False,
            'message': str(le)
        }), 404
    except ValueError as ve:
        return jsonify({
            'success': False,
            'message': str(ve)
        }), 400
    except Exception as e:
        return jsonify({
            'success': False,
            'message': f"Error updating batch: {str(e)}"
        }), 500

@production_bp.route('/batches/<int:batch_id>/stop', methods=['POST'])
@require_auth
@require_roles(ROLE_OWNER, ROLE_SUPER_ADMIN, ROLE_MANAGER, ROLE_SUPERVISOR, ROLE_OPERATOR)
def stop_production_batch(batch_id: int):
    """Explicitly stops a batch and frees the active batch slot."""
    try:
        batch = stop_batch(batch_id)
        return jsonify({
            'success': True,
            'message': f"Batch {batch['batch_number']} stopped successfully.",
            'batch': batch
        }), 200
    except LookupError as le:
        return jsonify({
            'success': False,
            'message': str(le)
        }), 404
    except ValueError as ve:
        return jsonify({
            'success': False,
            'message': str(ve)
        }), 400
    except Exception as e:
        return jsonify({
            'success': False,
            'message': f"Error stopping batch: {str(e)}"
        }), 500

def _analytics_impl():
    """Returns analytics derived from real production_summary, production_log, and production_batch."""
    summary = query_db(
        "SELECT id, total_bottles, accepted_bottles, rejected_bottles, total_box_packed, created_at "
        "FROM production_summary ORDER BY created_at DESC, id DESC LIMIT 1",
        one=True
    ) or {'total_bottles': 0, 'accepted_bottles': 0, 'rejected_bottles': 0, 'total_box_packed': 0}

    total_bottles = int(summary.get('total_bottles') or 0)
    accepted = int(summary.get('accepted_bottles') or 0)
    rejected = int(summary.get('rejected_bottles') or 0)
    boxes = int(summary.get('total_box_packed') or 0)

    # Breakdown by inspection_status
    status_counts = query_db(
        "SELECT "
        "  COALESCE(SUM(CASE WHEN inspection_status = 'Passed' THEN 1 ELSE 0 END), 0) AS passed, "
        "  COALESCE(SUM(CASE WHEN inspection_status = 'Rejected' THEN 1 ELSE 0 END), 0) AS rejected, "
        "  COALESCE(SUM(CASE WHEN weight_status = 'OK' THEN 1 ELSE 0 END), 0) AS weight_ok, "
        "  COALESCE(SUM(CASE WHEN weight_status = 'Low Weight' THEN 1 ELSE 0 END), 0) AS weight_low, "
        "  COALESCE(SUM(CASE WHEN cap_status = 'Capped' THEN 1 ELSE 0 END), 0) AS capped, "
        "  COALESCE(SUM(CASE WHEN cap_status = 'Pending' THEN 1 ELSE 0 END), 0) AS pending_cap "
        "FROM production_log",
        one=True
    ) or {}

    # Sample sequential trends across all production_log records
    logs = query_db(
        "SELECT id, bottle_number, weight_status, cap_status, inspection_status, created_at "
        "FROM production_log ORDER BY id ASC"
    ) or []

    trends = []
    bucket_size = max(1, len(logs) // 16) if len(logs) > 16 else 5
    for i in range(0, len(logs), bucket_size):
        chunk = logs[i:i+bucket_size]
        p_count = sum(1 for c in chunk if c.get('inspection_status') == 'Passed')
        r_count = sum(1 for c in chunk if c.get('inspection_status') == 'Rejected')
        last = chunk[-1]
        ts = last.get('created_at')
        trends.append({
            'bucket': f"B#{chunk[0]['bottle_number']}-{last['bottle_number']}",
            'startBottle': chunk[0]['bottle_number'],
            'endBottle': last['bottle_number'],
            'passed': p_count,
            'rejected': r_count,
            'total': len(chunk),
            'timestamp': ts.strftime('%H:%M:%S') if isinstance(ts, datetime.datetime) else ''
        })

    return jsonify({
        'success': True,
        'summary': {
            'total_bottles': total_bottles,
            'accepted_bottles': accepted,
            'rejected_bottles': rejected,
            'total_box_packed': boxes,
            'acceptance_rate': round((accepted / total_bottles * 100), 1) if total_bottles > 0 else 0.0,
            'rejection_rate': round((rejected / total_bottles * 100), 1) if total_bottles > 0 else 0.0,
            'packaging_rate': round((boxes * 3 / total_bottles * 100), 1) if total_bottles > 0 else 0.0
        },
        'breakdown': {
            'passed': int(status_counts.get('passed', 0)),
            'rejected': int(status_counts.get('rejected', 0)),
            'weight_ok': int(status_counts.get('weight_ok', 0)),
            'weight_low': int(status_counts.get('weight_low', 0)),
            'capped': int(status_counts.get('capped', 0)),
            'pending_cap': int(status_counts.get('pending_cap', 0))
        },
        'trends': trends
    })

@production_bp.route('/analytics', methods=['GET'])
@require_auth
def get_production_analytics():
    return _analytics_impl()

@production_bp.route('/trends', methods=['GET'])
@require_auth
def get_production_trends():
    return _analytics_impl()
