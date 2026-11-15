from flask import Blueprint, jsonify
from db import query_db
from routes.auth import require_auth

packaging_bp = Blueprint('packaging', __name__, url_prefix='/api/packaging')

@packaging_bp.route('/summary', methods=['GET'])
@require_auth
def get_packaging_summary():
    # Retrieve the single cumulative total_box_packed count from production_summary
    summary = query_db(
        "SELECT id, total_bottles, accepted_bottles, total_box_packed, created_at "
        "FROM production_summary ORDER BY created_at DESC, id DESC LIMIT 1",
        one=True
    ) or {'total_bottles': 0, 'accepted_bottles': 0, 'total_box_packed': 0}

    total_boxes = int(summary.get('total_box_packed') or 0)
    total_bottles = int(summary.get('total_bottles') or 0)
    accepted_bottles = int(summary.get('accepted_bottles') or 0)
    
    # 3 bottles per box standard in packaging cell
    bottles_per_box = 3
    bottles_in_packed_boxes = total_boxes * bottles_per_box
    current_box_filling = total_bottles % bottles_per_box
    
    return jsonify({
        'success': True,
        'total_box_packed': total_boxes,
        'bottles_per_box': bottles_per_box,
        'bottles_in_packed_boxes': bottles_in_packed_boxes,
        'current_box_filling': current_box_filling,
        'total_bottles': total_bottles,
        'accepted_bottles': accepted_bottles,
        'packaging_efficiency': round((bottles_in_packed_boxes / max(1, total_bottles)) * 100, 1),
        'sensor_source': 'Packaging Line Optical Counter'
    })

@packaging_bp.route('/trends', methods=['GET'])
@require_auth
def get_packaging_trends():
    summary = query_db(
        "SELECT total_box_packed, total_bottles FROM production_summary ORDER BY created_at DESC, id DESC LIMIT 1",
        one=True
    ) or {'total_box_packed': 0, 'total_bottles': 0}
    
    total_boxes = int(summary.get('total_box_packed') or 0)
    
    # Reconstruct progressive packaging milestones from production_log bottles
    logs = query_db(
        "SELECT bottle_number, created_at FROM production_log WHERE MOD(bottle_number, 3) = 0 ORDER BY bottle_number ASC"
    )
    
    milestones = []
    box_num = 1
    for log in logs:
        if box_num > total_boxes:
            break
        milestones.append({
            'boxNumber': box_num,
            'completedBottle': log['bottle_number'],
            'timestamp': log['created_at'].strftime('%H:%M:%S') if log['created_at'] else f"Box #{box_num}",
            'cumulativeBoxes': box_num
        })
        box_num += 1

    return jsonify({
        'success': True,
        'total_box_packed': total_boxes,
        'trends': milestones,
        'note': 'Packaging milestone progression computed at every 3rd completed bottle interval matching the physical packaging cycle.'
    })
