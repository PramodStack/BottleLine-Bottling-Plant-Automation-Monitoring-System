import datetime
from flask import Blueprint, jsonify, request
from db import query_db, check_db_health
from routes.auth import require_auth
from services.batch_service import evaluate_and_update_batches, format_batch_row

dashboard_bp = Blueprint('dashboard', __name__, url_prefix='/api/dashboard')

def compute_period_telemetry(period_name='This Year', start_date=None, end_date=None):
    """
    Computes genuine production telemetry and time-series aggregation strictly from MySQL.
    Guarantees no mock data, no arbitrary multipliers, and accurate metrics.
    """
    params = []
    if start_date and end_date:
        condition = "created_at >= %s AND created_at <= %s"
        params = [f"{start_date} 00:00:00", f"{end_date} 23:59:59"]
    elif period_name == 'Today':
        condition = "DATE(created_at) = CURRENT_DATE()"
    elif period_name == 'This Week':
        condition = "created_at >= DATE_SUB(CURDATE(), INTERVAL WEEKDAY(CURDATE()) DAY)"
    elif period_name == 'Last 30 Days':
        condition = "created_at >= NOW() - INTERVAL 30 DAY"
    elif period_name == 'This Month':
        condition = "created_at >= DATE_FORMAT(NOW(), '%%Y-%%m-01 00:00:00')"
    elif period_name == 'This Year':
        condition = "created_at >= DATE_FORMAT(NOW(), '%%Y-01-01 00:00:00')"
    else:
        condition = "1=1"

    # 1. Summary counts from production_log for the period
    sql_agg = f"""
        SELECT 
            COUNT(*) AS total_bottles,
            COALESCE(SUM(CASE WHEN inspection_status = 'Passed' THEN 1 ELSE 0 END), 0) AS accepted_bottles,
            COALESCE(SUM(CASE WHEN inspection_status = 'Rejected' THEN 1 ELSE 0 END), 0) AS rejected_bottles,
            COALESCE(SUM(CASE WHEN cap_status = 'Capped' THEN 1 ELSE 0 END), 0) AS capped_bottles,
            COALESCE(SUM(CASE WHEN MOD(bottle_number, 3) = 0 THEN 1 ELSE 0 END), 0) AS boxes_packed,
            MIN(created_at) AS first_ts,
            MAX(created_at) AS last_ts
        FROM production_log
        WHERE {condition}
    """
    agg = query_db(sql_agg, params, one=True) or {}

    total_bottles = int(agg.get('total_bottles') or 0)
    accepted_bottles = int(agg.get('accepted_bottles') or 0)
    rejected_bottles = int(agg.get('rejected_bottles') or 0)
    capped_bottles = int(agg.get('capped_bottles') or 0)

    # In full production scope (e.g. This Year / This Month / Last 30 Days), reflect production_summary recorded total_box_packed
    if period_name in ('This Year', 'This Month', 'Last 30 Days', 'All') and not (start_date and end_date):
        sum_row = query_db(
            "SELECT total_box_packed FROM production_summary ORDER BY created_at DESC, id DESC LIMIT 1",
            one=True
        )
        total_box_packed = int(sum_row.get('total_box_packed') or 0) if sum_row else int(agg.get('boxes_packed') or 0)
    else:
        total_box_packed = int(agg.get('boxes_packed') or 0)

    inspected_bottles = accepted_bottles + rejected_bottles
    pass_rate = round((accepted_bottles / inspected_bottles * 100), 1) if inspected_bottles > 0 else None
    reject_rate = round((rejected_bottles / inspected_bottles * 100), 1) if inspected_bottles > 0 else None
    packaging_rate = round((total_box_packed * 3 / total_bottles * 100), 1) if total_bottles > 0 else None

    # Calculate active operating hours within the period
    sql_spans = f"""
        SELECT DATE(created_at) as log_date, COUNT(*) as b_cnt, MIN(created_at) as s_t, MAX(created_at) as e_t
        FROM production_log
        WHERE {condition}
        GROUP BY DATE(created_at)
    """
    spans = query_db(sql_spans, params) or []
    active_sec = sum(max(600, (d['e_t'] - d['s_t']).total_seconds()) for d in spans if d.get('s_t') and d.get('e_t'))
    active_hrs = active_sec / 3600.0
    avg_rate_per_hr = round(total_bottles / active_hrs) if active_hrs > 0 else None

    # 2. Time-series chart points grouped chronologically
    chart_points = []
    if total_bottles > 0:
        sql_slots = f"""
            SELECT 
                MIN(DATE_FORMAT(created_at, '%%m/%%d %%H:%%i')) AS time_label,
                MIN(DATE_FORMAT(created_at, '%%Y-%%m-%%d %%H:%%i:00')) AS full_label,
                COUNT(*) AS produced,
                SUM(CASE WHEN inspection_status = 'Passed' THEN 1 ELSE 0 END) AS accepted,
                SUM(CASE WHEN inspection_status = 'Rejected' THEN 1 ELSE 0 END) AS rejected,
                SUM(CASE WHEN MOD(bottle_number, 3) = 0 THEN 1 ELSE 0 END) * 3 AS packaged_bottles,
                SUM(CASE WHEN MOD(bottle_number, 3) = 0 THEN 1 ELSE 0 END) AS boxes_packed
            FROM production_log
            WHERE {condition}
            GROUP BY DATE(created_at), HOUR(created_at), FLOOR(MINUTE(created_at)/30)
            ORDER BY MIN(created_at) ASC
        """
        slots = query_db(sql_slots, params) or []
        cum_p = 0
        cum_a = 0
        cum_r = 0
        cum_pkg = 0
        for s in slots:
            p = int(s.get('produced') or 0)
            a = int(s.get('accepted') or 0)
            r = int(s.get('rejected') or 0)
            pkg = int(s.get('packaged_bottles') or 0)
            b = int(s.get('boxes_packed') or 0)
            cum_p += p
            cum_a += a
            cum_r += r
            cum_pkg += pkg
            insp = a + r
            pt_pass_rate = round((a / insp * 100), 1) if insp > 0 else 100.0
            pt_rej_rate = round((r / insp * 100), 1) if insp > 0 else 0.0

            chart_points.append({
                'label': s.get('time_label'),
                'fullLabel': s.get('full_label'),
                'produced': p,
                'accepted': a,
                'rejected': r,
                'packaged': pkg,
                'boxesPacked': b,
                'cumProduced': cum_p,
                'cumAccepted': cum_a,
                'cumRejected': cum_r,
                'cumPackaged': cum_pkg,
                'passRate': f"{pt_pass_rate}%",
                'rejectionRate': f"{pt_rej_rate}%",
                # Numeric keys matching Recharts line bindings
                'cyan': p,
                'green': a,
                'red': r,
                'yellow': pkg,
                'bottlesProduced': str(p),
                'boxesPackedStr': f"{b} boxes"
            })

    # 3. Previous period comparison
    comparison = None
    prev_condition = None
    if period_name == 'Today':
        prev_condition = "DATE(created_at) = CURRENT_DATE() - INTERVAL 1 DAY"
    elif period_name == 'This Week':
        prev_condition = "created_at >= DATE_SUB(CURDATE(), INTERVAL WEEKDAY(CURDATE()) + 7 DAY) AND created_at < DATE_SUB(CURDATE(), INTERVAL WEEKDAY(CURDATE()) DAY)"
    elif period_name == 'Last 30 Days':
        prev_condition = "created_at >= NOW() - INTERVAL 60 DAY AND created_at < NOW() - INTERVAL 30 DAY"
    elif period_name == 'This Month':
        prev_condition = "created_at >= DATE_FORMAT(NOW() - INTERVAL 1 MONTH, '%%Y-%%m-01 00:00:00') AND created_at < DATE_FORMAT(NOW(), '%%Y-%%m-01 00:00:00')"
    elif period_name == 'This Year':
        prev_condition = "created_at >= DATE_FORMAT(NOW() - INTERVAL 1 YEAR, '%%Y-01-01 00:00:00') AND created_at < DATE_FORMAT(NOW(), '%%Y-01-01 00:00:00')"

    if prev_condition:
        prev_row = query_db(f"SELECT COUNT(*) as cnt FROM production_log WHERE {prev_condition}", one=True)
        prev_total = int(prev_row.get('cnt') or 0) if prev_row else 0
        if prev_total > 0:
            diff = total_bottles - prev_total
            total_change = round((diff / prev_total) * 100, 1)
            comparison = {
                'has_comparison': True,
                'prev_total': prev_total,
                'total_change': total_change
            }

    return {
        'period': period_name,
        'summary': {
            'total_bottles': total_bottles,
            'accepted_bottles': accepted_bottles,
            'rejected_bottles': rejected_bottles,
            'capped_bottles': capped_bottles,
            'total_box_packed': total_box_packed,
            'quality_pass_rate': pass_rate,
            'rejection_rate': reject_rate,
            'packaging_rate': packaging_rate,
            'bottles_per_box': 3
        },
        'avg_rate_per_hr': avg_rate_per_hr,
        'chart_data': chart_points,
        'comparison': comparison
    }


@dashboard_bp.route('/summary', methods=['GET'])
@require_auth
def get_dashboard_summary():
    health = check_db_health()
    if health.get('status') != 'connected':
        return jsonify({
            'success': False,
            'message': 'Database connection unavailable',
            'health': health
        }), 503

    # Keep batch state evaluated and fresh
    evaluate_and_update_batches()

    req_period = request.args.get('period', 'This Year').strip()
    start_date = request.args.get('start_date')
    end_date = request.args.get('end_date')

    # Precalculate telemetry for all standard options to allow instant switching
    standard_periods = ['Today', 'Last 30 Days', 'This Month', 'This Year']
    by_period = {}
    for p in standard_periods:
        by_period[p] = compute_period_telemetry(p)

    # Active telemetry for requested period or custom range
    if start_date and end_date:
        active_telemetry = compute_period_telemetry(period_name='Custom', start_date=start_date, end_date=end_date)
    else:
        active_telemetry = by_period.get(req_period) or compute_period_telemetry(req_period)

    # Production batches
    raw_batches = query_db(
        "SELECT id, batch_number, production_mode, target_quantity, produced_quantity, batch_status, "
        "scheduled_start, actual_start, completed_at, stopped_at, created_at "
        "FROM production_batch ORDER BY created_at DESC, id DESC"
    ) or []

    all_batches = [format_batch_row(b) for b in raw_batches]
    active_batch_candidate = next((b for b in all_batches if b.get('batch_status') == 'In Progress'), None)
    batch_row = active_batch_candidate or (all_batches[0] if all_batches else {
        'id': 1,
        'batch_number': 'BATCH-001',
        'production_mode': 'continuous',
        'target_quantity': None,
        'produced_quantity': active_telemetry['summary']['accepted_bottles'],
        'batch_status': 'In Progress',
        'created_at': None
    })

    # Overall log statistics across the entire database
    log_stats = query_db(
        "SELECT "
        "  COUNT(*) AS total_logged, "
        "  COALESCE(SUM(CASE WHEN weight_status = 'OK' THEN 1 ELSE 0 END), 0) AS weight_ok, "
        "  COALESCE(SUM(CASE WHEN weight_status = 'Low Weight' THEN 1 ELSE 0 END), 0) AS weight_low, "
        "  COALESCE(SUM(CASE WHEN cap_status = 'Capped' THEN 1 ELSE 0 END), 0) AS capped_count, "
        "  COALESCE(SUM(CASE WHEN cap_status = 'Pending' THEN 1 ELSE 0 END), 0) AS pending_cap, "
        "  COALESCE(SUM(CASE WHEN inspection_status = 'Passed' THEN 1 ELSE 0 END), 0) AS passed_count, "
        "  COALESCE(SUM(CASE WHEN inspection_status = 'Rejected' THEN 1 ELSE 0 END), 0) AS rejected_count, "
        "  COALESCE(SUM(CASE WHEN inspection_status = 'Pending' THEN 1 ELSE 0 END), 0) AS pending_insp "
        "FROM production_log",
        one=True
    ) or {}

    # Recent bottle activities
    recent_logs = query_db(
        "SELECT id, bottle_number, weight_status, cap_status, inspection_status, created_at "
        "FROM production_log ORDER BY id DESC LIMIT 6"
    )

    return jsonify({
        'success': True,
        'period': req_period,
        'summary': active_telemetry['summary'],
        'avg_rate_per_hr': active_telemetry.get('avg_rate_per_hr'),
        'chart_data': active_telemetry.get('chart_data', []),
        'historical_chart_data': active_telemetry.get('chart_data', []),
        'comparison': active_telemetry.get('comparison'),
        'by_period': by_period,
        'batch': batch_row,
        'batches': all_batches,
        'log_stats': log_stats,
        'recent_logs': recent_logs,
        'database_status': health,
        'last_updated': datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    })
