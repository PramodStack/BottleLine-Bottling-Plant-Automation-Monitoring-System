import csv
import io
from flask import Blueprint, request, jsonify, Response
from db import query_db
from routes.auth import require_auth

reports_bp = Blueprint('reports', __name__, url_prefix='/api/reports')

@reports_bp.route('/production', methods=['GET'])
@require_auth
def get_production_report():
    export_format = request.args.get('format', 'json').lower()
    
    summary = query_db(
        "SELECT id, total_bottles, accepted_bottles, rejected_bottles, total_box_packed, created_at "
        "FROM production_summary ORDER BY created_at DESC, id DESC LIMIT 1",
        one=True
    ) or {}

    batch = query_db(
        "SELECT id, batch_number, production_mode, target_quantity, produced_quantity, batch_status, scheduled_start, created_at "
        "FROM production_batch ORDER BY created_at DESC, id DESC LIMIT 1",
        one=True
    ) or {}

    logs = query_db(
        "SELECT id, bottle_number, weight_status, cap_status, inspection_status, created_at "
        "FROM production_log ORDER BY id ASC"
    )

    if export_format == 'csv':
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(['Record ID', 'Bottle Number', 'Weight Status', 'Cap Status', 'Inspection Status', 'Timestamp'])
        for l in logs:
            writer.writerow([
                l['id'],
                l['bottle_number'],
                l['weight_status'],
                l['cap_status'],
                l['inspection_status'],
                l['created_at'].strftime('%Y-%m-%d %H:%M:%S') if l['created_at'] else ''
            ])
        output.seek(0)
        return Response(
            output.getvalue(),
            mimetype='text/csv',
            headers={'Content-Disposition': 'attachment; filename=production_report.csv'}
        )

    # Calculate overall KPIs
    total_bottles = int(summary.get('total_bottles') or 0)
    accepted = int(summary.get('accepted_bottles') or 0)
    rejected = int(summary.get('rejected_bottles') or 0)
    boxes = int(summary.get('total_box_packed') or 0)
    pass_rate = round((accepted / max(1, accepted + rejected)) * 100, 1)

    return jsonify({
        'success': True,
        'summary': {
            'total_bottles': total_bottles,
            'accepted_bottles': accepted,
            'rejected_bottles': rejected,
            'total_box_packed': boxes,
            'pass_rate': pass_rate,
            'active_batch': batch.get('batch_number', 'N/A'),
            'produced_in_batch': batch.get('produced_quantity', 0)
        },
        'batch_details': batch,
        'sample_records': logs[-20:] if len(logs) > 20 else logs,
        'total_records': len(logs)
    })
