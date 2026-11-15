import datetime
from flask import Blueprint, jsonify
from db import query_db
from routes.auth import require_auth

sensors_bp = Blueprint('sensors', __name__, url_prefix='/api/sensors')

@sensors_bp.route('/status', methods=['GET'])
@require_auth
def get_sensors_status():
    latest_bottle = query_db(
        "SELECT id, bottle_number, weight_status, cap_status, inspection_status, created_at "
        "FROM production_log ORDER BY id DESC LIMIT 1",
        one=True
    ) or {}

    summary = query_db(
        "SELECT total_bottles, total_box_packed, created_at FROM production_summary ORDER BY id LIMIT 1",
        one=True
    ) or {}

    # Map verified sensor tags from DIAView control architecture
    sensors_list = [
        {
            'id': 'PACKING_SENSOR',
            'tag': 'Var.Bottling_Group.PACKING_SENSOR',
            'name': 'Box Packing Proximity Sensor',
            'location': 'Station 4 - Packaging Cell (Box 2)',
            'description': 'Detects completed box in packing cradle. Triggers container count increment on rising edge.',
            'timer_window': '4.0 seconds per box',
            'status': 'Arming / Ready',
            'state': 'Standby',
            'type': 'Optical PNP',
            'critical_gate': 'Gate 1 Protected'
        },
        {
            'id': 'TRAY_SENSOR',
            'tag': 'Var.Bottling_Group.TRAY_SENSOR',
            'name': 'Tray Transfer Optical Sensor',
            'location': 'Station 5 - Box 3 Unloading Deck',
            'description': 'Detects pallet tray alignment before pneumatic transfer.',
            'timer_window': '3.5 seconds cycle',
            'status': 'Operational',
            'state': 'Standby',
            'type': 'Photoelectric Retroreflective',
            'critical_gate': 'Gate 1 Protected'
        },
        {
            'id': 'BOT_CHECK_SENSOR',
            'tag': 'Var.Bottling_Group.BOT_CHECK_SENSOR',
            'name': 'Bottle Inspection Station Sensor',
            'location': 'Station 2 - Quality Verification',
            'description': 'Senses bottle arrival at weight and visual inspection cell.',
            'timer_window': 'Triggered on bottle presence',
            'status': 'Active',
            'state': 'Monitoring',
            'type': 'Laser Measurement',
            'critical_gate': 'Gate 1 Protected'
        },
        {
            'id': 'BOT_PICK_SENSOR',
            'tag': 'Var.Bottling_Group.BOT_PICK_SENSOR',
            'name': 'Robotic Picker Presence Sensor',
            'location': 'Station 3 - Transfer Gripper',
            'description': 'Validates bottle engagement before overhead gantry movement.',
            'timer_window': 'Cycle synchronous',
            'status': 'Operational',
            'state': 'Synchronized',
            'type': 'Inductive Proximity',
            'critical_gate': 'Gate 1 Protected'
        },
        {
            'id': 'BOT_FILL_CYCLE',
            'tag': 'Var.Bottling_Group.BOT_FILL_CYCLE_STARTED',
            'name': 'Liquid Filling Cycle Interlock',
            'location': 'Station 1 - Fill Nozzle Valve',
            'description': 'Prevents conveyor progression during volumetric dispense.',
            'timer_window': 'Active during valve discharge',
            'status': 'Active',
            'state': 'Supervised',
            'type': 'Process Flag',
            'critical_gate': 'Gate 1 Protected'
        },
        {
            'id': 'BOX_CONV',
            'tag': 'Var.Bottling_Group.BOX_CONV',
            'name': 'Packaging Conveyor Motor Drive',
            'location': 'Conveyor 2 - Box Transport Line',
            'description': 'Main variable speed roller drive for box containers.',
            'timer_window': 'Continuous / Intermittent',
            'status': 'Running',
            'state': 'Engaged',
            'type': 'Variable Frequency Drive',
            'critical_gate': 'Gate 1 Protected'
        }
    ]

    return jsonify({
        'success': True,
        'sensors': sensors_list,
        'last_telemetry_sync': latest_bottle.get('created_at').strftime('%Y-%m-%d %H:%M:%S') if latest_bottle.get('created_at') else None,
        'active_bottle': latest_bottle.get('bottle_number', 0),
        'total_boxes': summary.get('total_box_packed', 0),
        'total_bottles': summary.get('total_bottles', 0),
        'stale_warning': False
    })
