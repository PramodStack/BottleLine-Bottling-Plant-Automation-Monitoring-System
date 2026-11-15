from flask import Blueprint, jsonify
from db import query_db
from routes.auth import require_auth

inspection_bp = Blueprint('inspection', __name__, url_prefix='/api/inspection')

@inspection_bp.route('/summary', methods=['GET'])
@require_auth
def get_inspection_summary():
    summary = query_db(
        "SELECT total_bottles, accepted_bottles, rejected_bottles FROM production_summary ORDER BY created_at DESC, id DESC LIMIT 1",
        one=True
    ) or {'total_bottles': 0, 'accepted_bottles': 0, 'rejected_bottles': 0}

    total_bottles = int(summary.get('total_bottles') or 0)
    accepted = int(summary.get('accepted_bottles') or 0)
    rejected = int(summary.get('rejected_bottles') or 0)
    total_inspected = total_bottles if total_bottles > 0 else (accepted + rejected)
    pass_rate = round((accepted / total_inspected * 100), 1) if total_inspected > 0 else 0.0
    reject_rate = round((rejected / total_inspected * 100), 1) if total_inspected > 0 else 0.0

    # Defect category breakdown from production_log
    weight_stats = query_db(
        "SELECT "
        "  COALESCE(SUM(CASE WHEN weight_status = 'OK' THEN 1 ELSE 0 END), 0) AS weight_ok, "
        "  COALESCE(SUM(CASE WHEN weight_status = 'Low Weight' THEN 1 ELSE 0 END), 0) AS weight_low, "
        "  COALESCE(SUM(CASE WHEN weight_status = 'Pending' THEN 1 ELSE 0 END), 0) AS weight_pending "
        "FROM production_log",
        one=True
    ) or {'weight_ok': 0, 'weight_low': 0, 'weight_pending': 0}

    # Defect list (rejected bottles)
    recent_defects = query_db(
        "SELECT id, bottle_number, weight_status, cap_status, inspection_status, created_at "
        "FROM production_log WHERE inspection_status = 'Rejected' ORDER BY id DESC LIMIT 10"
    )

    return jsonify({
        'success': True,
        'metrics': {
            'total_inspected': total_inspected,
            'passed_bottles': accepted,
            'rejected_bottles': rejected,
            'pass_rate': pass_rate,
            'reject_rate': reject_rate
        },
        'defects': {
            'weight_ok': int(weight_stats.get('weight_ok', 0)),
            'weight_low': int(weight_stats.get('weight_low', 0)),
            'weight_pending': int(weight_stats.get('weight_pending', 0)),
            'recent_rejected_records': recent_defects
        }
    })

@inspection_bp.route('/trends', methods=['GET'])
@require_auth
def get_inspection_trends():
    logs = query_db(
        "SELECT bottle_number, inspection_status, weight_status, created_at "
        "FROM production_log ORDER BY id ASC"
    )
    
    # Generate sequential pass/fail history points
    history = []
    passed_so_far = 0
    rejected_so_far = 0
    for l in logs:
        if l['inspection_status'] == 'Passed':
            passed_so_far += 1
        elif l['inspection_status'] == 'Rejected':
            rejected_so_far += 1
        
        history.append({
            'bottleNumber': l['bottle_number'],
            'status': l['inspection_status'],
            'weightStatus': l['weight_status'],
            'cumPassed': passed_so_far,
            'cumRejected': rejected_so_far,
            'qualityRate': round((passed_so_far / max(1, passed_so_far + rejected_so_far)) * 100, 1),
            'time': l['created_at'].strftime('%H:%M:%S') if l['created_at'] else ''
        })

    return jsonify({'success': True, 'history': history})
