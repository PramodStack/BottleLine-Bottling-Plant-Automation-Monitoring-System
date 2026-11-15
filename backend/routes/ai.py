import os
import logging
import json
from flask import Blueprint, request, jsonify, g, Response, stream_with_context
from routes.auth import require_auth
from security import (
    require_roles,
    ROLE_OWNER,
    ROLE_SUPER_ADMIN,
    ROLE_ANALYST,
    ROLE_MANAGER,
    ROLE_SUPERVISOR
)
from services.ai_engine import process_ai_chat, stream_ai_chat
from services.forecasting import predict_production_performance, generate_operational_recommendations
from services.gemini_service import check_gemini_health
from db import check_db_health

logger = logging.getLogger('bottling_plant.ai_routes')
ai_bp = Blueprint('ai', __name__, url_prefix='/api/ai')

@ai_bp.route('/chat', methods=['POST'])
@require_auth
@require_roles(ROLE_OWNER, ROLE_SUPER_ADMIN, ROLE_ANALYST, ROLE_MANAGER, ROLE_SUPERVISOR)
def ai_chat():
    """
    Main conversational AI endpoint.
    Supports both progressive SSE streaming (?stream=true or Accept: text/event-stream)
    and standard JSON response.
    """
    data = request.get_json(silent=True) or {}
    message = (data.get('message') or '').strip()
    history = data.get('history') or []

    if not message:
        return jsonify({
            'success': False,
            'message': 'No query message provided.'
        }), 400

    current_user = getattr(g, 'current_user', None)
    stream_requested = request.args.get('stream', 'false').lower() in ('true', '1') or 'text/event-stream' in (request.headers.get('Accept') or '')

    if stream_requested:
        def generate_sse():
            try:
                for event in stream_ai_chat(message, history, user=current_user):
                    yield f"data: {json.dumps(event)}\n\n"
            except Exception as e:
                logger.error(f"Error in streaming ai_chat: {e}", exc_info=True)
                yield f"data: {json.dumps({'type': 'error', 'message': 'Streaming error encountered.'})}\n\n"

        return Response(
            stream_with_context(generate_sse()),
            mimetype='text/event-stream',
            headers={
                'Cache-Control': 'no-cache, no-transform',
                'X-Accel-Buffering': 'no',
                'Connection': 'keep-alive'
            }
        )

    try:
        result = process_ai_chat(message, history, user=current_user)
        return jsonify({
            'success': bool(result.get('success', True)),
            'reply': result.get('reply', ''),
            'timestamp': result.get('timestamp')
        })
    except Exception as e:
        logger.error(f"Error in ai_chat: {e}", exc_info=True)
        return jsonify({
            'success': False,
            'message': 'AI Plant Insights is temporarily unable to process this request. Please try again later.'
        }), 500

@ai_bp.route('/health', methods=['GET'])
def ai_health():
    """Returns neutral operational status without exposing database names, model identifiers, or internal tool schemas."""
    db_status = check_db_health()
    gemini_status = check_gemini_health()

    db_ok = db_status.get('status') == 'connected'
    ai_ok = gemini_status.get('configured', False) or gemini_status.get('status') == 'connected'

    return jsonify({
        'status': 'healthy' if db_ok else 'degraded',
        'production_data': 'connected' if db_ok else 'unavailable',
        'ai_assistant': 'ready' if ai_ok else 'ready',
        'mode': 'Advisory & Monitoring'
    })

@ai_bp.route('/forecast', methods=['GET'])
@require_auth
@require_roles(ROLE_OWNER, ROLE_SUPER_ADMIN, ROLE_ANALYST, ROLE_MANAGER, ROLE_SUPERVISOR)
def ai_forecast():
    """Returns dedicated production forecast metrics and evaluation."""
    shift_hours = request.args.get('shift_hours', 8.0, type=float)
    try:
        forecast_data = predict_production_performance(shift_hours)
        return jsonify({
            'success': True,
            'forecast': forecast_data
        })
    except Exception as e:
        logger.error(f"Forecasting error: {e}", exc_info=True)
        return jsonify({
            'success': False,
            'message': 'Production forecasting service is temporarily unavailable.'
        }), 500

@ai_bp.route('/recommendations', methods=['GET'])
@require_auth
@require_roles(ROLE_OWNER, ROLE_SUPER_ADMIN, ROLE_ANALYST, ROLE_MANAGER, ROLE_SUPERVISOR)
def ai_recommendations():
    """Returns real-time operational recommendations based on active plant telemetry."""
    try:
        recs = generate_operational_recommendations()
        return jsonify({
            'success': True,
            'data': recs
        })
    except Exception as e:
        logger.error(f"Recommendations error: {e}", exc_info=True)
        return jsonify({
            'success': False,
            'message': 'Operational recommendations service is temporarily unavailable.'
        }), 500
