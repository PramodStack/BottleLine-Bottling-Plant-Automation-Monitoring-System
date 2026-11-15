import unittest
import json
import sys
import os
import datetime
from unittest.mock import patch, MagicMock
from argon2 import PasswordHasher

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app import create_app
from routes.auth import generate_token

ph = PasswordHasher()

class TestProfileEndpointsUnit(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.app = create_app()
        cls.client = cls.app.test_client()
        cls.user_id = 42
        cls.email = "operator.test@bottlingplant.local"
        cls.role = "analyst"
        cls.full_name = "Test Operator"
        cls.token = generate_token(cls.user_id, cls.email, cls.role, cls.full_name, is_owner=False)
        cls.headers = {'Authorization': f'Bearer {cls.token}'}
        cls.now = datetime.datetime.now(datetime.timezone.utc)

    def test_01_profile_requires_auth(self):
        """GET /api/auth/profile requires valid Bearer token."""
        res = self.client.get('/api/auth/profile')
        self.assertEqual(res.status_code, 401)
        data = res.get_json()
        self.assertFalse(data.get('success'))

    def test_02_update_profile_requires_auth(self):
        """PUT /api/auth/profile requires valid Bearer token."""
        res = self.client.put('/api/auth/profile', json={'full_name': 'Test', 'email': 'test@example.com'})
        self.assertEqual(res.status_code, 401)

    def test_03_change_password_requires_auth(self):
        """POST /api/auth/change-password requires valid Bearer token."""
        res = self.client.post('/api/auth/change-password', json={
            'current_password': 'abc',
            'new_password': 'def',
            'confirm_password': 'def'
        })
        self.assertEqual(res.status_code, 401)

    @patch('routes.auth.query_db')
    def test_04_get_profile_success(self, mock_query):
        """GET /api/auth/profile returns authenticated user profile with timestamps and no password hash."""
        mock_user = {
            'id': self.user_id,
            'full_name': self.full_name,
            'email': self.email,
            'role': self.role,
            'is_owner': 0,
            'is_active': 1,
            'created_at': self.now,
            'updated_at': self.now,
            'last_seen_at': self.now
        }
        mock_query.return_value = mock_user

        res = self.client.get('/api/auth/profile', headers=self.headers)
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertTrue(data.get('success'))
        u = data.get('user', {})
        self.assertEqual(u['id'], self.user_id)
        self.assertEqual(u['full_name'], self.full_name)
        self.assertEqual(u['email'], self.email)
        self.assertEqual(u['role'], self.role)
        self.assertIn('created_at', u)
        self.assertNotIn('password_hash', u)

    @patch('routes.auth.query_db')
    def test_05_update_profile_empty_name(self, mock_query):
        """PUT /api/auth/profile rejects empty full name."""
        mock_query.return_value = {
            'id': self.user_id, 'full_name': self.full_name, 'email': self.email,
            'role': self.role, 'is_owner': 0, 'is_active': 1
        }
        res = self.client.put('/api/auth/profile', headers=self.headers, json={
            'full_name': '   ',
            'email': self.email
        })
        self.assertEqual(res.status_code, 400)
        self.assertIn('Full name cannot be empty', res.get_json().get('message', ''))

    @patch('routes.auth.query_db')
    def test_06_update_profile_invalid_email(self, mock_query):
        """PUT /api/auth/profile rejects invalid email format."""
        mock_query.return_value = {
            'id': self.user_id, 'full_name': self.full_name, 'email': self.email,
            'role': self.role, 'is_owner': 0, 'is_active': 1
        }
        res = self.client.put('/api/auth/profile', headers=self.headers, json={
            'full_name': 'Valid Name',
            'email': 'not-an-email'
        })
        self.assertEqual(res.status_code, 400)
        self.assertIn('Valid email address is required', res.get_json().get('message', ''))

    @patch('routes.auth.query_db')
    def test_07_update_profile_duplicate_email(self, mock_query):
        """PUT /api/auth/profile returns 409 if changing to an already taken email."""
        current_user = {
            'id': self.user_id, 'full_name': self.full_name, 'email': self.email,
            'role': self.role, 'is_owner': 0, 'is_active': 1
        }
        # First query for require_auth, second query for duplicate check
        mock_query.side_effect = [current_user, {'id': 999}]
        res = self.client.put('/api/auth/profile', headers=self.headers, json={
            'full_name': 'New Name',
            'email': 'taken@example.com'
        })
        self.assertEqual(res.status_code, 409)
        self.assertIn('already in use', res.get_json().get('message', ''))

    @patch('routes.auth.log_audit')
    @patch('routes.auth.execute_db')
    @patch('routes.auth.query_db')
    def test_08_update_profile_success(self, mock_query, mock_exec, mock_audit):
        """PUT /api/auth/profile updates name and returns new token and updated user."""
        current_user = {
            'id': self.user_id, 'full_name': self.full_name, 'email': self.email,
            'role': self.role, 'is_owner': 0, 'is_active': 1,
            'created_at': self.now, 'updated_at': self.now, 'last_seen_at': self.now
        }
        updated_user = {
            'id': self.user_id, 'full_name': 'Updated Operator', 'email': self.email,
            'role': self.role, 'is_owner': 0, 'is_active': 1,
            'created_at': self.now, 'updated_at': self.now, 'last_seen_at': self.now
        }
        mock_query.side_effect = [current_user, updated_user]
        mock_exec.return_value = 1

        res = self.client.put('/api/auth/profile', headers=self.headers, json={
            'full_name': 'Updated Operator',
            'email': self.email,
            'role': 'owner'  # Attempt role tampering; must be ignored
        })
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertTrue(data.get('success'))
        self.assertEqual(data['user']['full_name'], 'Updated Operator')
        self.assertEqual(data['user']['role'], 'analyst')  # Role untouched!
        self.assertIn('token', data)

    @patch('routes.auth.query_db')
    def test_09_change_password_validations(self, mock_query):
        """POST /api/auth/change-password validates length, match, and difference."""
        mock_query.return_value = {
            'id': self.user_id, 'full_name': self.full_name, 'email': self.email,
            'role': self.role, 'is_owner': 0, 'is_active': 1
        }

        # Short password
        res = self.client.post('/api/auth/change-password', headers=self.headers, json={
            'current_password': 'OldPassword123',
            'new_password': '123',
            'confirm_password': '123'
        })
        self.assertEqual(res.status_code, 400)
        self.assertIn('at least 6 characters', res.get_json().get('message', ''))

        # Mismatch
        res = self.client.post('/api/auth/change-password', headers=self.headers, json={
            'current_password': 'OldPassword123',
            'new_password': 'NewPassword123',
            'confirm_password': 'DifferentPassword123'
        })
        self.assertEqual(res.status_code, 400)
        self.assertIn('do not match', res.get_json().get('message', ''))

        # Same as current
        res = self.client.post('/api/auth/change-password', headers=self.headers, json={
            'current_password': 'SamePassword123',
            'new_password': 'SamePassword123',
            'confirm_password': 'SamePassword123'
        })
        self.assertEqual(res.status_code, 400)
        self.assertIn('cannot be the same', res.get_json().get('message', ''))

    @patch('routes.auth.query_db')
    def test_10_change_password_invalid_current(self, mock_query):
        """POST /api/auth/change-password rejects wrong current password."""
        real_hash = ph.hash("RealPassword123")
        current_user = {
            'id': self.user_id, 'full_name': self.full_name, 'email': self.email,
            'role': self.role, 'is_owner': 0, 'is_active': 1
        }
        db_user = {'password_hash': real_hash}
        mock_query.side_effect = [current_user, db_user]

        res = self.client.post('/api/auth/change-password', headers=self.headers, json={
            'current_password': 'WrongPassword123',
            'new_password': 'NewPassword456',
            'confirm_password': 'NewPassword456'
        })
        self.assertEqual(res.status_code, 400)
        self.assertIn('Current password is incorrect', res.get_json().get('message', ''))

    @patch('routes.auth.log_audit')
    @patch('routes.auth.execute_db')
    @patch('routes.auth.query_db')
    def test_11_change_password_success(self, mock_query, mock_exec, mock_audit):
        """POST /api/auth/change-password successfully updates password hash with valid current password."""
        real_hash = ph.hash("CurrentPassword123")
        current_user = {
            'id': self.user_id, 'full_name': self.full_name, 'email': self.email,
            'role': self.role, 'is_owner': 0, 'is_active': 1
        }
        db_user = {'password_hash': real_hash}
        mock_query.side_effect = [current_user, db_user]
        mock_exec.return_value = 1

        res = self.client.post('/api/auth/change-password', headers=self.headers, json={
            'current_password': 'CurrentPassword123',
            'new_password': 'BrandNewPassword456',
            'confirm_password': 'BrandNewPassword456'
        })
        self.assertEqual(res.status_code, 200)
        self.assertTrue(res.get_json().get('success'))
        self.assertIn('updated successfully', res.get_json().get('message', ''))

    def test_12_avatar_requires_auth(self):
        """POST /api/auth/avatar requires authentication."""
        res = self.client.post('/api/auth/avatar', json={'avatar': 'data:image/png;base64,abc'})
        self.assertEqual(res.status_code, 401)

    @patch('routes.auth.log_audit')
    @patch('routes.auth.execute_db')
    @patch('routes.auth.query_db')
    def test_13_update_avatar_success(self, mock_query, mock_exec, mock_audit):
        """POST /api/auth/avatar stores avatar and returns updated user."""
        current_user = {
            'id': self.user_id, 'full_name': self.full_name, 'email': self.email,
            'role': self.role, 'is_owner': 0, 'is_active': 1
        }
        updated_user = {
            'id': self.user_id, 'full_name': self.full_name, 'email': self.email,
            'role': self.role, 'is_owner': 0, 'is_active': 1, 'avatar_url': 'data:image/png;base64,TEST'
        }
        mock_query.side_effect = [current_user, updated_user]
        mock_exec.return_value = 1

        res = self.client.post('/api/auth/avatar', headers=self.headers, json={'avatar': 'data:image/png;base64,TEST'})
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertTrue(data.get('success'))
        self.assertEqual(data.get('user', {}).get('avatar_url'), 'data:image/png;base64,TEST')

    @patch('routes.auth.log_audit')
    @patch('routes.auth.execute_db')
    @patch('routes.auth.query_db')
    def test_14_delete_avatar_success(self, mock_query, mock_exec, mock_audit):
        """DELETE /api/auth/avatar removes avatar."""
        current_user = {
            'id': self.user_id, 'full_name': self.full_name, 'email': self.email,
            'role': self.role, 'is_owner': 0, 'is_active': 1
        }
        cleared_user = {
            'id': self.user_id, 'full_name': self.full_name, 'email': self.email,
            'role': self.role, 'is_owner': 0, 'is_active': 1, 'avatar_url': None
        }
        mock_query.side_effect = [current_user, cleared_user]
        mock_exec.return_value = 1

        res = self.client.delete('/api/auth/avatar', headers=self.headers)
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertTrue(data.get('success'))
        self.assertIsNone(data.get('user', {}).get('avatar_url'))

if __name__ == '__main__':
    unittest.main()
