"""
Automated validation of Online Status, Heartbeat, and RBAC User Management.
"""
import urllib.request
import urllib.error
import json
import time
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from db import query_db, execute_db
from routes.auth import generate_token

BASE_URL = 'http://127.0.0.1:5000/api'

def request_json(url, data=None, headers=None, method=None):
    hdrs = {'Content-Type': 'application/json'}
    if headers:
        hdrs.update(headers)
    body = json.dumps(data).encode('utf-8') if data is not None else None
    req = urllib.request.Request(url, data=body, headers=hdrs, method=method)
    try:
        with urllib.request.urlopen(req) as resp:
            return resp.status, json.loads(resp.read().decode('utf-8'))
    except urllib.error.HTTPError as e:
        raw = e.read().decode('utf-8')
        try:
            return e.code, json.loads(raw)
        except Exception:
            return e.code, {'raw': raw}

def test():
    print("=== Testing User Management & Online Presence ===")

    owner = query_db("SELECT id, full_name, email, role, is_owner FROM users WHERE is_owner = 1", one=True)
    assert owner is not None, "Owner user not found in MySQL"
    print(f"[PASS] 1. Owner identified: {owner['full_name']} ({owner['email']})")

    token = generate_token(owner['id'], owner['email'], 'owner', owner['full_name'], is_owner=True)
    auth_headers = {'Authorization': f'Bearer {token}'}

    # 2. Trigger Heartbeat
    status, res = request_json(f'{BASE_URL}/auth/heartbeat', {}, headers=auth_headers, method='POST')
    assert status == 200, f"Heartbeat failed: {res}"
    assert res.get('success') is True
    print(f"[PASS] 2. Authenticated heartbeat recorded: {res}")

    # 3. Fetch User Directory and verify Online Status
    status, res = request_json(f'{BASE_URL}/users', headers=auth_headers)
    assert status == 200, f"Fetching users failed: {res}"
    users = res.get('users', [])
    summary = res.get('summary', {})
    
    owner_in_list = next((u for u in users if u['id'] == owner['id']), None)
    assert owner_in_list is not None, "Owner not found in user list"
    assert owner_in_list.get('is_online') is True, f"Owner is_online should be True, got {owner_in_list.get('is_online')}"
    assert owner_in_list.get('online_status') == 'online', f"Owner status should be 'online', got {owner_in_list.get('online_status')}"
    assert owner_in_list.get('last_seen_at') is not None, "Owner last_seen_at should not be null"
    assert owner_in_list.get('seconds_ago') is not None and owner_in_list.get('seconds_ago') < 60, f"Owner seconds_ago: {owner_in_list.get('seconds_ago')}"
    
    print(f"[PASS] 3. Owner presence verified: is_online={owner_in_list['is_online']}, status='{owner_in_list['online_status']}', last_seen_at='{owner_in_list['last_seen_at']}', seconds_ago={owner_in_list['seconds_ago']}")
    print(f"[PASS] Real-time summary metrics: total={summary.get('total_users')}, active={summary.get('active_users')}, online={summary.get('online_users')}")

    # 4. Check Test Operator
    operator = next((u for u in users if u['email'] == 'operator@bottlingplant.local'), None)
    if operator:
        print(f"[PASS] 4. Operator presence: is_online={operator.get('is_online')}, status='{operator.get('online_status')}', last_seen_at={operator.get('last_seen_at')}")

    # 5. Verify default role for new signup is 'analyst'
    unique_email = f"presence_test_{int(time.time())}@test.com"
    status, res = request_json(f'{BASE_URL}/auth/signup', {
        'full_name': 'Presence Role Test',
        'email': unique_email,
        'password': 'Password123!',
        'confirm_password': 'Password123!',
        'role': 'super_admin' # Client-supplied role injection attempt
    })
    assert status == 201, f"Signup failed: {res}"
    assert res['user']['role'] == 'analyst', f"Role should be analyst, got {res['user']['role']}"
    print(f"[PASS] 5. New account created with default role '{res['user']['role']}'.")

    # Clean up test user
    test_user_id = res['user']['id']
    status, res = request_json(f'{BASE_URL}/users/{test_user_id}', headers=auth_headers, method='DELETE')
    assert status == 200
    print(f"[PASS] 6. Cleaned up temporary test user {test_user_id}.")

    print("\n=======================================================")
    print("ALL ONLINE STATUS & PRESENCE VERIFICATIONS PASSED 100%!")
    print("=======================================================")

if __name__ == '__main__':
    test()
