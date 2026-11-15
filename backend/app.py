import os
from flask import Flask, jsonify
from flask_cors import CORS
from config import Config
from db import check_db_health

from routes.auth import auth_bp
from routes.dashboard import dashboard_bp
from routes.production import production_bp
from routes.packaging import packaging_bp
from routes.inspection import inspection_bp
from routes.capping import capping_bp
from routes.sensors import sensors_bp
from routes.reports import reports_bp
from routes.ai import ai_bp
from routes.users import users_bp

from services.batch_service import start_batch_scheduler

def create_app():
    app = Flask(__name__)
    app.config.from_object(Config)

    # Start persistent batch scheduler
    try:
        start_batch_scheduler(poll_interval=3.0)
    except Exception as e:
        print(f"Warning: Could not start batch scheduler: {e}")

    # Enable CORS for frontend clients
    CORS(app, resources={r"/api/*": {"origins": "*"}}, supports_credentials=True)

    # Register blueprints
    app.register_blueprint(auth_bp)
    app.register_blueprint(dashboard_bp)
    app.register_blueprint(production_bp)
    app.register_blueprint(packaging_bp)
    app.register_blueprint(inspection_bp)
    app.register_blueprint(capping_bp)
    app.register_blueprint(sensors_bp)
    app.register_blueprint(reports_bp)
    app.register_blueprint(ai_bp)
    app.register_blueprint(users_bp)

    @app.route('/api/health', methods=['GET'])
    def health_check():
        db_health = check_db_health()
        is_connected = db_health.get('status') == 'connected'
        return jsonify({
            'status': 'healthy' if is_connected else 'degraded',
            'production_data': 'connected' if is_connected else 'unavailable'
        })

    @app.errorhandler(404)
    def not_found(error):
        return jsonify({'success': False, 'message': 'Resource not found'}), 404

    @app.errorhandler(405)
    def method_not_allowed(error):
        return jsonify({'success': False, 'message': 'Method not allowed for this route'}), 405

    @app.errorhandler(500)
    def internal_error(error):
        return jsonify({'success': False, 'message': 'Internal server error'}), 500

    return app

if __name__ == '__main__':
    app = create_app()
    port = int(os.environ.get('PORT', 5000))
    print(f"Starting Bottling Plant Analytics API on port {port}...")
    app.run(host='0.0.0.0', port=port, debug=True)
