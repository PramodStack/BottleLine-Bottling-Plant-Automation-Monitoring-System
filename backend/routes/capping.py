from flask import Blueprint, jsonify
from db import query_db
from routes.auth import require_auth

capping_bp = Blueprint('capping', __name__, url_prefix='/api/capping')

@capping_bp.route('/summary', methods=['GET'])
@require_auth
def get_capping_summary():
    stats = query_db(
        "SELECT "
        "  COUNT(*) AS total_bottles, "
        "  COALESCE(SUM(CASE WHEN cap_status = 'Capped' THEN 1 ELSE 0 END), 0) AS capped_count, "
        "  COALESCE(SUM(CASE WHEN cap_status = 'Pending' THEN 1 ELSE 0 END), 0) AS pending_count "
        "FROM production_log",
        one=True
    ) or {'total_bottles': 0, 'capped_count': 0, 'pending_count': 0}

    total = int(stats.get('total_bottles') or 0)
    capped = int(stats.get('capped_count') or 0)
    pending = int(stats.get('pending_count') or 0)
    efficiency = round((capped / max(1, total)) * 100, 1)

    recent = query_db(
        "SELECT id, bottle_number, cap_status, created_at "
        "FROM production_log ORDER BY id DESC LIMIT 10"
    )

    return jsonify({
        'success': True,
        'metrics': {
            'total_bottles': total,
            'capped_count': capped,
            'pending_count': pending,
            'capping_efficiency': efficiency
        },
        'station_info': {
            'station_name': 'Automated Pneumatic Capping Press',
            'activation_tag': 'Var.Bottling_Group.CAPPING_CYCLE_ACTIVE',
            'capping_step_tag': 'Var.Bottling_Group.CAPPING_STEP',
            'status': 'Online / Ready'
        },
        'recent_cappings': recent
    })
