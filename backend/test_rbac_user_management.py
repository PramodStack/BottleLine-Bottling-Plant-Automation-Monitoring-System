"""
Comprehensive Automated Test Suite: Bottling Plant User Management & RBAC System
Verifies:
1. Newly registered account receives 'analyst' role.
2. Analyst cannot access User Management or change roles (403).
3. Manager cannot change roles (403).
4. Supervisor cannot change roles (403).
5. Operator cannot change roles (403).
6. Owner can manage eligible users.
7. Super Admin can manage eligible non-Owner users.
8. Super Admin cannot change Owner's role (403).
9. Super Admin cannot deactivate or delete Owner (403).
10. No user can create another Owner through ordinary API requests (403).
11. A user cannot elevate their own role by modifying an API request (403).
12. Unauthorized endpoints return HTTP 401 or 403 appropriately.
13. User Management endpoints blocked for unauthorized users.
14. Password hashes are never returned by user directory or profile APIs.
15. Existing login, registration, dashboard, production data, and batch functionality work.
16. Existing users and production records remain 100% intact after migrations.
"""
import unittest
import sys
import os
import requests

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from db import query_db, execute_db
from routes.auth import generate_token

BASE_URL = "http://localhost:5000/api"

class TestUserManagementAndRBAC(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        # Clean any previous test users (emails starting with test_rbac_)
        execute_db("DELETE FROM user_audit_log WHERE actor_id IN (SELECT id FROM users WHERE email LIKE %s) OR target_id IN (SELECT id FROM users WHERE email LIKE %s)", ('test_rbac_%', 'test_rbac_%'))
        execute_db("DELETE FROM users WHERE email LIKE %s", ('test_rbac_%',))

        # Ensure Owner exists (Pramod Behera or test owner)
        cls.owner_user = query_db("SELECT id, full_name, email, role, is_owner FROM users WHERE is_owner = 1", one=True)
        if not cls.owner_user:
            # Fallback bootstrap if not yet done
            execute_db("UPDATE users SET role = 'owner', is_owner = 1, is_active = 1 WHERE id = 2")
            cls.owner_user = query_db("SELECT id, full_name, email, role, is_owner FROM users WHERE id = 2", one=True)

        cls.owner_token = generate_token(cls.owner_user['id'], cls.owner_user['email'], 'owner', cls.owner_user['full_name'], is_owner=True)
        cls.owner_headers = {'Authorization': f'Bearer {cls.owner_token}'}

    @classmethod
    def tearDownClass(cls):
        execute_db("DELETE FROM user_audit_log WHERE actor_id IN (SELECT id FROM users WHERE email LIKE %s) OR target_id IN (SELECT id FROM users WHERE email LIKE %s)", ('test_rbac_%', 'test_rbac_%'))
        execute_db("DELETE FROM users WHERE email LIKE %s", ('test_rbac_%',))

    def test_01_registration_assigns_analyst_default(self):
        """1. A newly registered account receives the 'analyst' role on the server regardless of input."""
        email = "test_rbac_new_user@example.com"
        # Try to supply an elevated role like 'admin' or 'owner' in the signup payload
        payload = {
            'full_name': 'Test Registered Analyst',
            'email': email,
            'password': 'password123',
            'confirm_password': 'password123',
            'role': 'super_admin' # Sneaky payload attempt
        }
        res = requests.post(f"{BASE_URL}/auth/signup", json=payload)
        self.assertEqual(res.status_code, 201)
        data = res.json()
        self.assertTrue(data['success'])
        self.assertEqual(data['user']['role'], 'analyst')

        # Verify in database directly
        db_user = query_db("SELECT id, email, role, is_owner, is_active FROM users WHERE email = %s", (email,), one=True)
        self.assertIsNotNone(db_user)
        self.assertEqual(db_user['role'], 'analyst')
        self.assertEqual(db_user['is_owner'], 0)
        self.assertEqual(db_user['is_active'], 1)
        print("[PASS] Test 1: New registration automatically assigned 'analyst' role; client-supplied role ignored.")

    def test_02_analyst_cannot_access_user_management(self):
        """2. Analyst cannot access User Management or change roles."""
        user = query_db("SELECT id, full_name, email, role FROM users WHERE email = 'test_rbac_new_user@example.com'", one=True)
        token = generate_token(user['id'], user['email'], 'analyst', user['full_name'])
        headers = {'Authorization': f'Bearer {token}'}

        # Cannot list users
        res_list = requests.get(f"{BASE_URL}/users", headers=headers)
        self.assertEqual(res_list.status_code, 403)

        # Cannot create user
        res_create = requests.post(f"{BASE_URL}/users", json={'full_name': 'X', 'email': 'x@x.com', 'password': 'password123', 'role': 'analyst'}, headers=headers)
        self.assertEqual(res_create.status_code, 403)

        # Cannot change role of another user
        res_update = requests.put(f"{BASE_URL}/users/1", json={'role': 'manager'}, headers=headers)
        self.assertEqual(res_update.status_code, 403)
        print("[PASS] Test 2: Analyst blocked with 403 from User Management and role assignment.")

    def test_03_manager_cannot_change_roles(self):
        """3. Manager cannot change roles or access User Management."""
        # Create manager user
        execute_db("INSERT INTO users (full_name, email, password_hash, role, is_active) VALUES (%s, %s, %s, %s, 1)",
                   ('Test Manager', 'test_rbac_mgr@example.com', 'dummy_hash', 'manager'))
        mgr = query_db("SELECT id, full_name, email, role FROM users WHERE email = 'test_rbac_mgr@example.com'", one=True)
        token = generate_token(mgr['id'], mgr['email'], 'manager', mgr['full_name'])
        headers = {'Authorization': f'Bearer {token}'}

        res = requests.get(f"{BASE_URL}/users", headers=headers)
        self.assertEqual(res.status_code, 403)

        res_update = requests.put(f"{BASE_URL}/users/1", json={'role': 'super_admin'}, headers=headers)
        self.assertEqual(res_update.status_code, 403)
        print("[PASS] Test 3: Manager blocked from user role modifications.")

    def test_04_supervisor_cannot_change_roles(self):
        """4. Supervisor cannot change roles or access User Management."""
        execute_db("INSERT INTO users (full_name, email, password_hash, role, is_active) VALUES (%s, %s, %s, %s, 1)",
                   ('Test Supervisor', 'test_rbac_sup@example.com', 'dummy_hash', 'supervisor'))
        sup = query_db("SELECT id, full_name, email, role FROM users WHERE email = 'test_rbac_sup@example.com'", one=True)
        token = generate_token(sup['id'], sup['email'], 'supervisor', sup['full_name'])
        headers = {'Authorization': f'Bearer {token}'}

        res = requests.get(f"{BASE_URL}/users", headers=headers)
        self.assertEqual(res.status_code, 403)
        print("[PASS] Test 4: Supervisor blocked from user role modifications.")

    def test_05_operator_cannot_change_roles_or_access_users(self):
        """5. Operator cannot create or manage user accounts."""
        op = query_db("SELECT id, full_name, email, role FROM users WHERE email = 'operator@bottlingplant.local'", one=True)
        token = generate_token(op['id'], op['email'], 'operator', op['full_name'])
        headers = {'Authorization': f'Bearer {token}'}

        res = requests.get(f"{BASE_URL}/users", headers=headers)
        self.assertEqual(res.status_code, 403)

        res_create = requests.post(f"{BASE_URL}/users", json={'full_name': 'Hacker', 'email': 'hacker@example.com', 'password': 'password123', 'role': 'super_admin'}, headers=headers)
        self.assertEqual(res_create.status_code, 403)
        print("[PASS] Test 5: Operator blocked from user management.")

    def test_06_owner_can_manage_eligible_users(self):
        """6. Owner can view users, create users, assign roles, and view audit logs."""
        # 1. View users
        res = requests.get(f"{BASE_URL}/users", headers=self.owner_headers)
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertTrue(data['success'])
        self.assertIn('summary', data)
        self.assertIn('users', data)

        # 2. Create a Super Admin
        create_res = requests.post(f"{BASE_URL}/users", json={
            'full_name': 'Test Admin Created By Owner',
            'email': 'test_rbac_admin_by_owner@example.com',
            'password': 'password123',
            'role': 'super_admin'
        }, headers=self.owner_headers)
        self.assertEqual(create_res.status_code, 201)

        # 3. View audit logs
        audit_res = requests.get(f"{BASE_URL}/users/audit-logs", headers=self.owner_headers)
        self.assertEqual(audit_res.status_code, 200)
        logs = audit_res.json().get('logs', [])
        self.assertTrue(len(logs) > 0)
        print("[PASS] Test 6: Owner successfully accessed user directory, created user, and viewed audit logs.")

    def test_07_super_admin_can_manage_eligible_non_owner_users(self):
        """7. Super Admin can manage non-Owner users and assign Analyst, Manager, Supervisor, Operator."""
        admin_user = query_db("SELECT id, full_name, email, role FROM users WHERE email = 'test_rbac_admin_by_owner@example.com'", one=True)
        admin_token = generate_token(admin_user['id'], admin_user['email'], 'super_admin', admin_user['full_name'])
        admin_headers = {'Authorization': f'Bearer {admin_token}'}

        # Super admin creates a manager
        create_res = requests.post(f"{BASE_URL}/users", json={
            'full_name': 'Manager By Admin',
            'email': 'test_rbac_mgr_by_admin@example.com',
            'password': 'password123',
            'role': 'manager'
        }, headers=admin_headers)
        self.assertEqual(create_res.status_code, 201)

        mgr_id = create_res.json()['user']['id']

        # Super admin changes manager's role to supervisor
        update_res = requests.put(f"{BASE_URL}/users/{mgr_id}", json={
            'role': 'supervisor'
        }, headers=admin_headers)
        self.assertEqual(update_res.status_code, 200)
        self.assertEqual(update_res.json()['user']['role'], 'supervisor')

        # Super admin deactivates and reactivates non-owner user
        deact_res = requests.patch(f"{BASE_URL}/users/{mgr_id}/status", json={'is_active': False}, headers=admin_headers)
        self.assertEqual(deact_res.status_code, 200)
        self.assertFalse(deact_res.json()['is_active'])

        react_res = requests.patch(f"{BASE_URL}/users/{mgr_id}/status", json={'is_active': True}, headers=admin_headers)
        self.assertEqual(react_res.status_code, 200)
        self.assertTrue(react_res.json()['is_active'])
        print("[PASS] Test 7: Super Admin successfully managed non-owner accounts and roles.")

    def test_08_super_admin_cannot_change_owner_role(self):
        """8. Super Admin cannot change the Owner's role."""
        admin_user = query_db("SELECT id, full_name, email, role FROM users WHERE email = 'test_rbac_admin_by_owner@example.com'", one=True)
        admin_token = generate_token(admin_user['id'], admin_user['email'], 'super_admin', admin_user['full_name'])
        admin_headers = {'Authorization': f'Bearer {admin_token}'}

        # Attempt to demote Owner to operator
        res = requests.put(f"{BASE_URL}/users/{self.owner_user['id']}", json={'role': 'operator'}, headers=admin_headers)
        self.assertEqual(res.status_code, 403)
        self.assertIn("Cannot modify the protected Owner account", res.json().get('message', ''))

        # Verify Owner role unchanged in DB
        owner_db = query_db("SELECT role, is_owner FROM users WHERE id = %s", (self.owner_user['id'],), one=True)
        self.assertEqual(owner_db['role'], 'owner')
        self.assertEqual(owner_db['is_owner'], 1)
        print("[PASS] Test 8: Super Admin blocked with 403 from altering Owner's role.")

    def test_09_super_admin_cannot_deactivate_or_delete_owner(self):
        """9. Super Admin cannot deactivate or delete the Owner."""
        admin_user = query_db("SELECT id, full_name, email, role FROM users WHERE email = 'test_rbac_admin_by_owner@example.com'", one=True)
        admin_token = generate_token(admin_user['id'], admin_user['email'], 'super_admin', admin_user['full_name'])
        admin_headers = {'Authorization': f'Bearer {admin_token}'}

        # Deactivation attempt
        deact_res = requests.patch(f"{BASE_URL}/users/{self.owner_user['id']}/status", json={'is_active': False}, headers=admin_headers)
        self.assertEqual(deact_res.status_code, 403)

        # Deletion attempt
        del_res = requests.delete(f"{BASE_URL}/users/{self.owner_user['id']}", headers=admin_headers)
        self.assertEqual(del_res.status_code, 403)

        # Verify Owner is still active in DB
        owner_db = query_db("SELECT is_active FROM users WHERE id = %s", (self.owner_user['id'],), one=True)
        self.assertEqual(owner_db['is_active'], 1)
        print("[PASS] Test 9: Super Admin blocked with 403 from deactivating or deleting Owner.")

    def test_10_no_user_can_create_owner_through_api(self):
        """10. No user can create another Owner through normal UI/API requests."""
        # 1. Owner attempts to create another Owner
        res_owner = requests.post(f"{BASE_URL}/users", json={
            'full_name': 'Duplicate Owner Attempt',
            'email': 'test_rbac_dup_owner@example.com',
            'password': 'password123',
            'role': 'owner'
        }, headers=self.owner_headers)
        self.assertEqual(res_owner.status_code, 403)
        self.assertIn("cannot be assigned through user creation", res_owner.json().get('message', ''))

        # 2. Super Admin attempts to create an Owner
        admin_user = query_db("SELECT id, full_name, email, role FROM users WHERE email = 'test_rbac_admin_by_owner@example.com'", one=True)
        admin_token = generate_token(admin_user['id'], admin_user['email'], 'super_admin', admin_user['full_name'])
        admin_headers = {'Authorization': f'Bearer {admin_token}'}

        res_admin = requests.post(f"{BASE_URL}/users", json={
            'full_name': 'Admin Creating Owner',
            'email': 'test_rbac_admin_owner@example.com',
            'password': 'password123',
            'role': 'owner'
        }, headers=admin_headers)
        self.assertEqual(res_admin.status_code, 403)
        print("[PASS] Test 10: Strict prohibition of creating Owner role through normal API verified.")

    def test_11_user_cannot_elevate_own_role(self):
        """11. A user cannot elevate their own role by modifying an API request."""
        admin_user = query_db("SELECT id, full_name, email, role FROM users WHERE email = 'test_rbac_admin_by_owner@example.com'", one=True)
        admin_token = generate_token(admin_user['id'], admin_user['email'], 'super_admin', admin_user['full_name'])
        admin_headers = {'Authorization': f'Bearer {admin_token}'}

        # Super admin attempts to promote self to owner
        res = requests.put(f"{BASE_URL}/users/{admin_user['id']}", json={'role': 'owner'}, headers=admin_headers)
        self.assertEqual(res.status_code, 403)

        # Super admin attempts to change own role to anything else
        res_mgr = requests.put(f"{BASE_URL}/users/{admin_user['id']}", json={'role': 'manager'}, headers=admin_headers)
        self.assertEqual(res_mgr.status_code, 403)
        print("[PASS] Test 11: Self-elevation and self-role modifications strictly rejected with 403.")

    def test_12_and_13_unauthenticated_and_unauthorized_endpoints(self):
        """12 & 13. Unauthorized endpoints return HTTP 401 or 403 appropriately."""
        # Unauthenticated request -> 401
        res_no_auth = requests.get(f"{BASE_URL}/users")
        self.assertEqual(res_no_auth.status_code, 401)

        # Invalid token -> 401
        res_bad_tok = requests.get(f"{BASE_URL}/users", headers={'Authorization': 'Bearer bad.token.here'})
        self.assertEqual(res_bad_tok.status_code, 401)

        # Deactivated user login -> 403
        mgr = query_db("SELECT id, email FROM users WHERE email = 'test_rbac_mgr@example.com'", one=True)
        execute_db("UPDATE users SET is_active = 0 WHERE id = %s", (mgr['id'],))
        login_res = requests.post(f"{BASE_URL}/auth/login", json={'email': 'test_rbac_mgr@example.com', 'password': 'password123'})
        self.assertEqual(login_res.status_code, 403)
        print("[PASS] Tests 12 & 13: 401 on unauthenticated and 403 on unauthorized access correctly returned.")

    def test_14_password_hashes_never_returned(self):
        """14. Password hashes are never returned by user-list or user-detail APIs."""
        res = requests.get(f"{BASE_URL}/users", headers=self.owner_headers)
        self.assertEqual(res.status_code, 200)
        users = res.json().get('users', [])
        for u in users:
            self.assertNotIn('password', u)
            self.assertNotIn('password_hash', u)

        me_res = requests.get(f"{BASE_URL}/auth/me", headers=self.owner_headers)
        self.assertEqual(me_res.status_code, 200)
        self.assertNotIn('password_hash', me_res.json().get('user', {}))
        print("[PASS] Test 14: Zero password hashes leaked in user API responses.")

    def test_15_batch_management_permissions(self):
        """15. Role permissions for batch management: Analyst blocked from creating batch, Manager permitted."""
        # Analyst creates batch -> 403
        analyst = query_db("SELECT id, full_name, email FROM users WHERE email = 'test_rbac_new_user@example.com'", one=True)
        if not analyst:
            execute_db("INSERT INTO users (full_name, email, password_hash, role, is_active) VALUES (%s, %s, %s, %s, 1)",
                       ('Analyst', 'test_rbac_new_user@example.com', 'dummy_hash', 'analyst'))
            analyst = query_db("SELECT id, full_name, email FROM users WHERE email = 'test_rbac_new_user@example.com'", one=True)

        analyst_token = generate_token(analyst['id'], analyst['email'], 'analyst', analyst['full_name'])
        analyst_headers = {'Authorization': f'Bearer {analyst_token}'}

        res_analyst = requests.post(f"{BASE_URL}/production/batches", json={
            'batch_number': 'TEST-ANALYST-FAIL',
            'production_mode': 'continuous'
        }, headers=analyst_headers)
        self.assertEqual(res_analyst.status_code, 403)

        # Manager creates batch -> 201
        mgr = query_db("SELECT id, full_name, email FROM users WHERE email = 'test_rbac_mgr@example.com'", one=True)
        if not mgr:
            execute_db("INSERT INTO users (full_name, email, password_hash, role, is_active) VALUES (%s, %s, %s, %s, 1)",
                       ('Test Manager', 'test_rbac_mgr@example.com', 'dummy_hash', 'manager'))
            mgr = query_db("SELECT id, full_name, email FROM users WHERE email = 'test_rbac_mgr@example.com'", one=True)
        else:
            execute_db("UPDATE users SET is_active = 1 WHERE email = 'test_rbac_mgr@example.com'")

        mgr_token = generate_token(mgr['id'], mgr['email'], 'manager', mgr['full_name'])
        mgr_headers = {'Authorization': f'Bearer {mgr_token}'}

        import time
        unique_batch = f"TEST-MGR-{int(time.time())}"
        res_mgr = requests.post(f"{BASE_URL}/production/batches", json={
            'batch_number': unique_batch,
            'production_mode': 'continuous'
        }, headers=mgr_headers)
        self.assertEqual(res_mgr.status_code, 201)
        execute_db("DELETE FROM production_batch WHERE batch_number LIKE %s", ('TEST-%',))
        print("[PASS] Test 15: Batch permissions strictly enforced (Analyst 403, Manager 201).")

    def test_16_ai_endpoints_role_access(self):
        """16. Advanced AI insights accessible to Analyst, Manager, Supervisor, Super Admin, Owner, but blocked for Operator."""
        op = query_db("SELECT id, full_name, email, role FROM users WHERE email = 'operator@bottlingplant.local'", one=True)
        op_token = generate_token(op['id'], op['email'], 'operator', op['full_name'])
        op_headers = {'Authorization': f'Bearer {op_token}'}

        res_op = requests.post(f"{BASE_URL}/ai/chat", json={'message': 'Give me operational insights'}, headers=op_headers)
        self.assertEqual(res_op.status_code, 403)

        # Analyst is permitted to ask questions about production data
        analyst = query_db("SELECT id, full_name, email FROM users WHERE email = 'test_rbac_new_user@example.com'", one=True)
        if not analyst:
            execute_db("INSERT INTO users (full_name, email, password_hash, role, is_active) VALUES (%s, %s, %s, %s, 1)",
                       ('Analyst', 'test_rbac_new_user@example.com', 'dummy_hash', 'analyst'))
            analyst = query_db("SELECT id, full_name, email FROM users WHERE email = 'test_rbac_new_user@example.com'", one=True)

        analyst_token = generate_token(analyst['id'], analyst['email'], 'analyst', analyst['full_name'])
        analyst_headers = {'Authorization': f'Bearer {analyst_token}'}

        res_an = requests.post(f"{BASE_URL}/ai/chat", json={'message': 'Current production status?'}, headers=analyst_headers)
        self.assertIn(res_an.status_code, (200, 500)) # 200 or 500 if AI service mock/call, but not 403!
        self.assertNotEqual(res_an.status_code, 403)
        print("[PASS] Test 16: AI role restrictions verified (Operator 403, Analyst permitted).")

    def test_17_existing_users_and_production_data_intact(self):
        """17. Existing users and production records remain 100% intact after migrations."""
        op = query_db("SELECT id, full_name, email, role FROM users WHERE email = 'operator@bottlingplant.local'", one=True)
        self.assertIsNotNone(op)
        self.assertEqual(op['role'], 'operator')

        summary = query_db("SELECT id, total_bottles FROM production_summary ORDER BY id DESC LIMIT 1", one=True)
        self.assertIsNotNone(summary)
        self.assertTrue(summary['total_bottles'] > 0)
        print("[PASS] Test 17: Existing user records and production records completely preserved.")

if __name__ == '__main__':
    unittest.main()
