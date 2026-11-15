import os
import sys
import json
import time
import shutil
import tempfile
import threading
import subprocess
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from urllib.parse import urlparse, parse_qs

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIST_DIR = os.path.join(BASE_DIR, 'frontend', 'dist')
DOCS_IMG_DIR = os.path.join(BASE_DIR, 'docs', 'screenshots')
os.makedirs(DOCS_IMG_DIR, exist_ok=True)

CHROME_PATH = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
PORT = 8089

# Mock Data
MOCK_USER = {
    "id": 1,
    "full_name": "Pramod B (Owner)",
    "email": "owner@bottlingplant.io",
    "role": "owner",
    "is_owner": True,
    "is_active": True,
    "is_online": True,
    "online_status": "online",
    "seconds_ago": 0,
    "avatar_url": None,
    "avatar": None,
    "created_at": "2026-10-22T08:00:00Z",
    "updated_at": "2026-11-14T10:00:00Z"
}

MOCK_USERS_LIST = [
    MOCK_USER,
    {
        "id": 2,
        "full_name": "Sarah Connor",
        "email": "s.connor@bottlingplant.io",
        "role": "super_admin",
        "is_owner": False,
        "is_active": True,
        "is_online": True,
        "online_status": "online",
        "seconds_ago": 12,
        "created_at": "2026-10-23T09:15:00Z"
    },
    {
        "id": 3,
        "full_name": "Marcus Vance",
        "email": "m.vance@bottlingplant.io",
        "role": "supervisor",
        "is_owner": False,
        "is_active": True,
        "is_online": True,
        "online_status": "online",
        "seconds_ago": 45,
        "created_at": "2026-10-24T11:00:00Z"
    },
    {
        "id": 4,
        "full_name": "Elena Rostova",
        "email": "e.rostova@bottlingplant.io",
        "role": "operator",
        "is_owner": False,
        "is_active": True,
        "is_online": True,
        "online_status": "online",
        "seconds_ago": 120,
        "created_at": "2026-10-25T07:30:00Z"
    },
    {
        "id": 5,
        "full_name": "David Chen",
        "email": "d.chen@bottlingplant.io",
        "role": "analyst",
        "is_owner": False,
        "is_active": True,
        "is_online": False,
        "online_status": "offline",
        "seconds_ago": 7200,
        "created_at": "2026-10-26T14:20:00Z"
    }
]

MOCK_CHART_DATA = [
    {"label": "08:00", "timeLabel": "08:00", "bottlesProduced": 180, "passRate": 99.1, "rejectionRate": 0.9, "boxesPacked": 60, "produced": 180, "accepted": 178, "rejected": 2, "packaged": 60, "cumProduced": 180, "cumAccepted": 178, "cumRejected": 2, "cumPackaged": 60},
    {"label": "09:00", "timeLabel": "09:00", "bottlesProduced": 210, "passRate": 98.6, "rejectionRate": 1.4, "boxesPacked": 70, "produced": 210, "accepted": 207, "rejected": 3, "packaged": 70, "cumProduced": 390, "cumAccepted": 385, "cumRejected": 5, "cumPackaged": 130},
    {"label": "10:00", "timeLabel": "10:00", "bottlesProduced": 240, "passRate": 99.5, "rejectionRate": 0.5, "boxesPacked": 80, "produced": 240, "accepted": 239, "rejected": 1, "packaged": 80, "cumProduced": 630, "cumAccepted": 624, "cumRejected": 6, "cumPackaged": 210},
    {"label": "11:00", "timeLabel": "11:00", "bottlesProduced": 225, "passRate": 97.8, "rejectionRate": 2.2, "boxesPacked": 75, "produced": 225, "accepted": 220, "rejected": 5, "packaged": 75, "cumProduced": 855, "cumAccepted": 844, "cumRejected": 11, "cumPackaged": 285},
    {"label": "12:00", "timeLabel": "12:00", "bottlesProduced": 230, "passRate": 99.1, "rejectionRate": 0.9, "boxesPacked": 76, "produced": 230, "accepted": 228, "rejected": 2, "packaged": 76, "cumProduced": 1085, "cumAccepted": 1072, "cumRejected": 13, "cumPackaged": 361},
    {"label": "13:00", "timeLabel": "13:00", "bottlesProduced": 250, "passRate": 98.8, "rejectionRate": 1.2, "boxesPacked": 83, "produced": 250, "accepted": 247, "rejected": 3, "packaged": 83, "cumProduced": 1335, "cumAccepted": 1319, "cumRejected": 16, "cumPackaged": 444},
    {"label": "14:00", "timeLabel": "14:00", "bottlesProduced": 260, "passRate": 99.2, "rejectionRate": 0.8, "boxesPacked": 86, "produced": 260, "accepted": 258, "rejected": 2, "packaged": 86, "cumProduced": 1595, "cumAccepted": 1577, "cumRejected": 18, "cumPackaged": 530},
    {"label": "15:00", "timeLabel": "15:00", "bottlesProduced": 245, "passRate": 98.4, "rejectionRate": 1.6, "boxesPacked": 81, "produced": 245, "accepted": 241, "rejected": 4, "packaged": 81, "cumProduced": 1840, "cumAccepted": 1818, "cumRejected": 22, "cumPackaged": 611},
    {"label": "16:00", "timeLabel": "16:00", "bottlesProduced": 270, "passRate": 99.6, "rejectionRate": 0.4, "boxesPacked": 90, "produced": 270, "accepted": 269, "rejected": 1, "packaged": 90, "cumProduced": 2110, "cumAccepted": 2087, "cumRejected": 23, "cumPackaged": 701},
    {"label": "17:00", "timeLabel": "17:00", "bottlesProduced": 255, "passRate": 98.9, "rejectionRate": 1.1, "boxesPacked": 85, "produced": 255, "accepted": 252, "rejected": 3, "packaged": 85, "cumProduced": 2365, "cumAccepted": 2339, "cumRejected": 26, "cumPackaged": 786}
]

MOCK_RECENT_LOGS = [
    {"id": 2365, "bottle_number": 2365, "weight_status": "Normal", "cap_status": "Capped", "inspection_status": "Passed", "created_at": "2026-11-14 17:04:12"},
    {"id": 2364, "bottle_number": 2364, "weight_status": "Normal", "cap_status": "Capped", "inspection_status": "Passed", "created_at": "2026-11-14 17:04:08"},
    {"id": 2363, "bottle_number": 2363, "weight_status": "Low Weight", "cap_status": "Capped", "inspection_status": "Rejected", "created_at": "2026-11-14 17:04:04"},
    {"id": 2362, "bottle_number": 2362, "weight_status": "Normal", "cap_status": "Capped", "inspection_status": "Passed", "created_at": "2026-11-14 17:04:00"},
    {"id": 2361, "bottle_number": 2361, "weight_status": "Normal", "cap_status": "Capped", "inspection_status": "Passed", "created_at": "2026-11-14 17:03:56"},
    {"id": 2360, "bottle_number": 2360, "weight_status": "Normal", "cap_status": "Capped", "inspection_status": "Passed", "created_at": "2026-11-14 17:03:52"},
    {"id": 2359, "bottle_number": 2359, "weight_status": "Normal", "cap_status": "Capped", "inspection_status": "Passed", "created_at": "2026-11-14 17:03:48"},
    {"id": 2358, "bottle_number": 2358, "weight_status": "Normal", "cap_status": "Capped", "inspection_status": "Passed", "created_at": "2026-11-14 17:03:44"},
    {"id": 2357, "bottle_number": 2357, "weight_status": "Normal", "cap_status": "Capped", "inspection_status": "Passed", "created_at": "2026-11-14 17:03:40"},
    {"id": 2356, "bottle_number": 2356, "weight_status": "Defective Cap", "cap_status": "Loose", "inspection_status": "Rejected", "created_at": "2026-11-14 17:03:36"},
    {"id": 2355, "bottle_number": 2355, "weight_status": "Normal", "cap_status": "Capped", "inspection_status": "Passed", "created_at": "2026-11-14 17:03:32"},
    {"id": 2354, "bottle_number": 2354, "weight_status": "Normal", "cap_status": "Capped", "inspection_status": "Passed", "created_at": "2026-11-14 17:03:28"},
    {"id": 2353, "bottle_number": 2353, "weight_status": "Normal", "cap_status": "Capped", "inspection_status": "Passed", "created_at": "2026-11-14 17:03:24"},
    {"id": 2352, "bottle_number": 2352, "weight_status": "Normal", "cap_status": "Capped", "inspection_status": "Passed", "created_at": "2026-11-14 17:03:20"},
    {"id": 2351, "bottle_number": 2351, "weight_status": "Normal", "cap_status": "Capped", "inspection_status": "Passed", "created_at": "2026-11-14 17:03:16"},
]

MOCK_REJECTED_RECORDS = [
    {"id": 2363, "bottle_number": 2363, "weight_status": "Low Weight", "created_at": "2026-11-14 17:04:04"},
    {"id": 2356, "bottle_number": 2356, "weight_status": "Defective Cap", "created_at": "2026-11-14 17:03:36"},
    {"id": 2340, "bottle_number": 2340, "weight_status": "Low Weight", "created_at": "2026-11-14 16:58:12"},
    {"id": 2315, "bottle_number": 2315, "weight_status": "Optical Defect", "created_at": "2026-11-14 16:42:09"},
    {"id": 2288, "bottle_number": 2288, "weight_status": "Low Weight", "created_at": "2026-11-14 16:21:40"}
]

MOCK_BATCH = {
    "id": 42,
    "batch_number": "BATCH-2026-1114-A",
    "production_mode": "set_quantity",
    "target_quantity": 3000,
    "produced_quantity": 2365,
    "batch_status": "In Progress",
    "progress_percentage": 78.8,
    "scheduled_start": "2026-11-14 08:00:00",
    "actual_start": "2026-11-14 08:05:22",
    "completed_at": None,
    "stopped_at": None,
    "created_at": "2026-11-14 07:50:00"
}

MOCK_BATCHES_LIST = [
    MOCK_BATCH,
    {
        "id": 41,
        "batch_number": "BATCH-2026-1113-C",
        "production_mode": "set_quantity",
        "target_quantity": 5000,
        "produced_quantity": 5000,
        "batch_status": "Completed",
        "progress_percentage": 100.0,
        "scheduled_start": "2026-11-13 14:00:00",
        "actual_start": "2026-11-13 14:02:10",
        "completed_at": "2026-11-13 22:30:00",
        "created_at": "2026-11-13 13:45:00"
    },
    {
        "id": 40,
        "batch_number": "BATCH-2026-1113-B",
        "production_mode": "continuous",
        "target_quantity": None,
        "produced_quantity": 4200,
        "batch_status": "Completed",
        "progress_percentage": 100.0,
        "scheduled_start": "2026-11-13 06:00:00",
        "actual_start": "2026-11-13 06:01:00",
        "completed_at": "2026-11-13 13:50:00",
        "created_at": "2026-11-13 05:30:00"
    }
]

class MockPlantHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIST_DIR, **kwargs)

    def do_POST(self):
        self.handle_api_or_auth()

    def do_PUT(self):
        self.handle_api_or_auth()

    def do_PATCH(self):
        self.handle_api_or_auth()

    def do_DELETE(self):
        self.handle_api_or_auth()

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path

        # Helper page to set localStorage and redirect
        if path == '/auth-helper':
            query = parse_qs(parsed.query)
            target = query.get('to', ['/dashboard'])[0]
            html = f"""<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body>
<script>
    localStorage.setItem('plant_auth_token', 'mock_jwt_token_2026');
    localStorage.setItem('plant_user', JSON.stringify({json.dumps(MOCK_USER)}));
    window.location.replace('{target}');
</script>
</body>
</html>"""
            self.send_response(200)
            self.send_header('Content-Type', 'text/html; charset=utf-8')
            self.send_header('Content-Length', str(len(html.encode('utf-8'))))
            self.end_headers()
            self.wfile.write(html.encode('utf-8'))
            return

        if path.startswith('/api/'):
            self.handle_api_or_auth()
            return

        # Check if static file exists in DIST_DIR
        local_path = os.path.join(DIST_DIR, path.lstrip('/'))
        if os.path.isfile(local_path):
            super().do_GET()
            return

        # Otherwise SPA fallback to index.html
        index_file = os.path.join(DIST_DIR, 'index.html')
        with open(index_file, 'rb') as f:
            content = f.read()
        self.send_response(200)
        self.send_header('Content-Type', 'text/html; charset=utf-8')
        self.send_header('Content-Length', str(len(content)))
        self.end_headers()
        self.wfile.write(content)

    def handle_api_or_auth(self):
        parsed = urlparse(self.path)
        path = parsed.path
        response_data = {"success": True}

        if path == '/api/auth/me' or path == '/api/auth/profile':
            response_data = {"success": True, "user": MOCK_USER}
        elif path == '/api/auth/login' or path == '/api/auth/signup':
            response_data = {"success": True, "token": "mock_jwt_token_2026", "user": MOCK_USER}
        elif path == '/api/auth/heartbeat':
            response_data = {"success": True, "user_id": 1, "timestamp": "2026-11-14T17:05:00Z"}
        elif path == '/api/dashboard/summary':
            response_data = {
                "success": True,
                "period": "today",
                "summary": {
                    "total_bottles": 2365,
                    "accepted_bottles": 2339,
                    "rejected_bottles": 26,
                    "capped_bottles": 2355,
                    "total_box_packed": 786,
                    "quality_pass_rate": 98.9,
                    "rejection_rate": 1.1,
                    "packaging_rate": 99.4,
                    "bottles_per_box": 3
                },
                "avg_rate_per_hr": 262.7,
                "comparison": {
                    "has_comparison": True,
                    "prev_total": 2180,
                    "total_change": 8.5
                },
                "batch": MOCK_BATCH,
                "batches": MOCK_BATCHES_LIST,
                "log_stats": {
                    "total_logged": 2365,
                    "weight_ok": 2345,
                    "weight_low": 20,
                    "capped_count": 2355,
                    "pending_cap": 4,
                    "passed_count": 2339,
                    "rejected_count": 26,
                    "pending_insp": 6
                },
                "recent_logs": MOCK_RECENT_LOGS,
                "chart_data": MOCK_CHART_DATA,
                "historical_chart_data": MOCK_CHART_DATA,
                "database_status": {
                    "status": "connected",
                    "database": "bottling_plant_db",
                    "host": "localhost"
                },
                "last_updated": "Just now"
            }
        elif path == '/api/production/summary':
            response_data = {
                "success": True,
                "kpis": {
                    "total_bottles": 2365,
                    "accepted_bottles": 2339,
                    "rejected_bottles": 26,
                    "total_box_packed": 786,
                    "acceptance_rate": 98.9,
                    "pass_rate": 98.9,
                    "rejection_rate": 1.1,
                    "total_batches": 3
                },
                "batches": MOCK_BATCHES_LIST,
                "active_batch": MOCK_BATCH,
                "total_bottles": 2365,
                "accepted_bottles": 2339,
                "rejected_bottles": 26,
                "total_box_packed": 786,
                "quality_pass_rate": 98.9
            }
        elif path.startswith('/api/production/batches'):
            response_data = {
                "success": True,
                "batches": MOCK_BATCHES_LIST,
                "active_batch": MOCK_BATCH,
                "next_batch_number": "BATCH-2026-1115-A"
            }
        elif path.startswith('/api/production/logs') or path.startswith('/api/production/history'):
            response_data = {
                "success": True,
                "records": MOCK_RECENT_LOGS,
                "logs": MOCK_RECENT_LOGS,
                "pagination": {
                    "page": 1,
                    "limit": 20,
                    "total": 2365,
                    "pages": 119
                },
                "total": 2365,
                "page": 1,
                "limit": 20,
                "total_pages": 119
            }
        elif path.startswith('/api/production/analytics') or path.startswith('/api/production/trends'):
            response_data = {
                "success": True,
                "trends": MOCK_CHART_DATA,
                "hourly_rate": 265,
                "peak_rate": 310,
                "uptime_percentage": 98.4
            }
        elif path.startswith('/api/inspection/summary'):
            response_data = {
                "success": True,
                "metrics": {
                    "total_inspected": 2365,
                    "passed_bottles": 2339,
                    "rejected_bottles": 26,
                    "pass_rate": 98.9,
                    "reject_rate": 1.1,
                    "quality_standard": "ISO 9001"
                },
                "defects": {
                    "weight_ok": 2345,
                    "weight_low": 20,
                    "weight_pending": 0,
                    "recent_rejected_records": MOCK_REJECTED_RECORDS
                }
            }
        elif path.startswith('/api/inspection/trends'):
            history_points = []
            for i in range(25):
                b_num = 2300 + (i * 2)
                is_pass = 0 if i in [5, 17] else 1
                history_points.append({
                    "bottleNumber": b_num,
                    "passRate": 98.9,
                    "passRateSmoothed": 98.8 + (i % 3) * 0.1,
                    "passStatus": is_pass
                })
            response_data = {
                "success": True,
                "history": history_points
            }
        elif path.startswith('/api/capping/summary'):
            response_data = {
                "success": True,
                "metrics": {
                    "capped_count": 2355,
                    "pending_count": 4,
                    "capping_efficiency": 99.8
                },
                "station_info": {
                    "station_name": "Station 4 Capping Unit",
                    "activation_tag": "CAPPING_CYCLE_ACTIVE",
                    "sequencer_step_tag": "STEP_4_CAPPING",
                    "torque_validation": "Automated Seal Verified"
                },
                "recent_cappings": [
                    {"id": 2365, "bottle_number": 2365, "cap_status": "Capped", "created_at": "2026-11-14 17:04:12"},
                    {"id": 2364, "bottle_number": 2364, "cap_status": "Capped", "created_at": "2026-11-14 17:04:08"},
                    {"id": 2363, "bottle_number": 2363, "cap_status": "Capped", "created_at": "2026-11-14 17:04:04"},
                    {"id": 2362, "bottle_number": 2362, "cap_status": "Capped", "created_at": "2026-11-14 17:04:00"},
                    {"id": 2361, "bottle_number": 2361, "cap_status": "Capped", "created_at": "2026-11-14 17:03:56"}
                ]
            }
        elif path.startswith('/api/packaging/summary'):
            response_data = {
                "success": True,
                "total_box_packed": 786,
                "bottles_per_box": 3,
                "total_bottles": 2365,
                "bottles_in_packed_boxes": 2358,
                "packaging_efficiency": 99.7
            }
        elif path.startswith('/api/packaging/trends'):
            response_data = {
                "success": True,
                "trends": [
                    {"boxNumber": 786, "completedBottle": 2358, "timestamp": "2026-11-14 17:04:10"},
                    {"boxNumber": 785, "completedBottle": 2355, "timestamp": "2026-11-14 17:03:40"},
                    {"boxNumber": 784, "completedBottle": 2352, "timestamp": "2026-11-14 17:03:10"},
                    {"boxNumber": 783, "completedBottle": 2349, "timestamp": "2026-11-14 17:02:40"},
                    {"boxNumber": 782, "completedBottle": 2346, "timestamp": "2026-11-14 17:02:10"},
                    {"boxNumber": 781, "completedBottle": 2343, "timestamp": "2026-11-14 17:01:40"},
                    {"boxNumber": 780, "completedBottle": 2340, "timestamp": "2026-11-14 17:01:10"}
                ]
            }
        elif path.startswith('/api/sensors/status'):
            response_data = {
                "success": True,
                "sensors": [
                    {"name": "PHOTO_EYE_CONVEYOR_1", "status": "ON", "value": 1, "station": "Infeed"},
                    {"name": "LOAD_CELL_WEIGHER", "status": "ON", "value": "502.4g", "station": "Filling/Weighing"},
                    {"name": "CAP_SENSOR", "status": "ON", "value": 1, "station": "Capping"},
                    {"name": "VISION_CAMERA_QC", "status": "ON", "value": "PASS", "station": "Inspection"},
                    {"name": "PACKING_SENSOR_BOX_2", "status": "ON", "value": 1, "station": "Case Packer"},
                    {"name": "TRAY_SENSOR_BOX_3", "status": "IDLE", "value": 0, "station": "Palletizer"}
                ]
            }
        elif path.startswith('/api/reports/production') or path.startswith('/api/reports'):
            response_data = {
                "success": True,
                "summary": {
                    "total_bottles": 2365,
                    "accepted_bottles": 2339,
                    "rejected_bottles": 26,
                    "total_box_packed": 786,
                    "pass_rate": 98.9,
                    "reject_rate": 1.1
                },
                "batch_details": {
                    "batch_number": "BATCH-2026-1114-A",
                    "target_quantity": 3000,
                    "produced_quantity": 2365,
                    "batch_status": "In Progress"
                }
            }
        elif path.startswith('/api/users/audit-logs'):
            response_data = {
                "success": True,
                "logs": [
                    {"id": 1, "actor_id": 1, "actor_email": "owner@bottlingplant.io", "actor_name": "Pramod B", "target_id": 2, "target_email": "s.connor@bottlingplant.io", "target_name": "Sarah Connor", "action": "ROLE_UPDATE", "previous_role": "supervisor", "new_role": "super_admin", "status": "SUCCESS", "details": "Promoted to Super Admin", "created_at": "2026-11-14 15:30:00"},
                    {"id": 2, "actor_id": 1, "actor_email": "owner@bottlingplant.io", "actor_name": "Pramod B", "target_id": 4, "target_email": "e.rostova@bottlingplant.io", "target_name": "Elena Rostova", "action": "USER_CREATE", "previous_role": None, "new_role": "operator", "status": "SUCCESS", "details": "Operator provisioned for line 2", "created_at": "2026-11-14 11:20:00"},
                    {"id": 3, "actor_id": 2, "actor_email": "s.connor@bottlingplant.io", "actor_name": "Sarah Connor", "target_id": 5, "target_email": "d.chen@bottlingplant.io", "target_name": "David Chen", "action": "PASSWORD_RESET", "previous_role": "analyst", "new_role": "analyst", "status": "SUCCESS", "details": "Security credentials updated", "created_at": "2026-11-14 09:10:00"}
                ]
            }
        elif path.startswith('/api/users'):
            response_data = {
                "success": True,
                "users": MOCK_USERS_LIST,
                "summary": {
                    "total_users": 5,
                    "active_users": 5,
                    "inactive_users": 0,
                    "online_users": 4,
                    "by_role": {
                        "owner": 1,
                        "super_admin": 1,
                        "supervisor": 1,
                        "operator": 1,
                        "analyst": 1
                    }
                }
            }
        elif path.startswith('/api/ai/health'):
            response_data = {"success": True, "status": "operational", "model": "gemini-2.5-flash", "latency_ms": 142}
        elif path.startswith('/api/ai/forecast'):
            response_data = {
                "success": True,
                "forecast": {
                    "projected_bottles": 4850,
                    "projected_boxes": 1616,
                    "confidence": 96.4,
                    "estimated_completion": "21:45"
                }
            }
        elif path.startswith('/api/ai/recommendations'):
            response_data = {
                "success": True,
                "data": [
                    {"priority": "INFO", "title": "Optimal Line Speed", "detail": "Conveyor 1 is operating within prime velocity envelope (0.85 m/s)."},
                    {"priority": "TIP", "title": "Station 2 Load Cell Tare", "detail": "Scheduled calibration recommended in 4 hours to preserve 99%+ accuracy."}
                ]
            }

        body = json.dumps(response_data).encode('utf-8')
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
        self.end_headers()

    def log_message(self, format, *args):
        pass

def start_server():
    server = ThreadingHTTPServer(('127.0.0.1', PORT), MockPlantHandler)
    server_thread = threading.Thread(target=server.serve_forever, daemon=True)
    server_thread.start()
    print(f"Mock HTTP & Plant Telemetry Server started at http://127.0.0.1:{PORT}")
    return server

PAGES_TO_CAPTURE = [
    ("01_landing_hero.png", f"http://127.0.0.1:{PORT}/"),
    ("02_kage_3d_hero.png", f"http://127.0.0.1:{PORT}/kage"),
    ("03_login_interface.png", f"http://127.0.0.1:{PORT}/login"),
    ("04_signup_interface.png", f"http://127.0.0.1:{PORT}/signup"),
    ("05_dashboard_overview.png", f"http://127.0.0.1:{PORT}/auth-helper?to=/dashboard"),
    ("06_production_line.png", f"http://127.0.0.1:{PORT}/auth-helper?to=/dashboard/production"),
    ("07_bottle_tracking.png", f"http://127.0.0.1:{PORT}/auth-helper?to=/dashboard/bottle-tracking"),
    ("08_inspection_station.png", f"http://127.0.0.1:{PORT}/auth-helper?to=/dashboard/inspection"),
    ("09_capping_station.png", f"http://127.0.0.1:{PORT}/auth-helper?to=/dashboard/capping"),
    ("10_packaging_station.png", f"http://127.0.0.1:{PORT}/auth-helper?to=/dashboard/packaging"),
    ("11_production_history.png", f"http://127.0.0.1:{PORT}/auth-helper?to=/dashboard/history"),
    ("12_analytics_reports.png", f"http://127.0.0.1:{PORT}/auth-helper?to=/dashboard/reports"),
    ("13_user_management.png", f"http://127.0.0.1:{PORT}/auth-helper?to=/dashboard/users"),
    ("14_operator_profile.png", f"http://127.0.0.1:{PORT}/auth-helper?to=/dashboard/profile")
]

def capture_all():
    server = start_server()
    time.sleep(1)

    temp_profile_dir = tempfile.mkdtemp(prefix="chrome_shot_")
    print(f"Using isolated browser profile: {temp_profile_dir}")

    try:
        for filename, url in PAGES_TO_CAPTURE:
            out_file = os.path.join(DOCS_IMG_DIR, filename)
            print(f"Capturing: {filename} from {url}...")
            
            cmd = [
                CHROME_PATH,
                "--headless=new",
                "--no-sandbox",
                "--disable-gpu",
                "--disable-dev-shm-usage",
                "--disable-background-timer-throttling",
                "--disable-renderer-backgrounding",
                "--disable-backgrounding-occluded-windows",
                f"--user-data-dir={temp_profile_dir}",
                "--window-size=1920,1080",
                "--hide-scrollbars",
                "--run-all-compositor-stages-before-draw",
                "--virtual-time-budget=4000",
                f"--screenshot={out_file}",
                url
            ]
            
            p = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=25)
            if os.path.exists(out_file) and os.path.getsize(out_file) > 10000:
                print(f" -> SUCCESS: {filename} ({os.path.getsize(out_file)} bytes)")
            else:
                print(f" -> WARNING: {filename} file missing or small ({os.path.getsize(out_file) if os.path.exists(out_file) else 0} bytes)")

    finally:
        shutil.rmtree(temp_profile_dir, ignore_errors=True)
        server.shutdown()
        print("Done generating screenshots.")

if __name__ == "__main__":
    capture_all()
