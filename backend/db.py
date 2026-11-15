import pymysql
import pymysql.cursors
from contextlib import contextmanager
from config import Config

def create_connection():
    return pymysql.connect(
        host=Config.DB_HOST,
        port=Config.DB_PORT,
        user=Config.DB_USER,
        password=Config.DB_PASSWORD,
        database=Config.DB_NAME,
        charset='utf8mb4',
        cursorclass=pymysql.cursors.DictCursor,
        autocommit=True,
        connect_timeout=5
    )

@contextmanager
def get_db_connection():
    conn = create_connection()
    try:
        yield conn
    finally:
        conn.close()

def query_db(query, args=(), one=False):
    """Executes a parameterized query and returns results as dict(s)."""
    with get_db_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute(query, args)
            result = cursor.fetchall()
            return (result[0] if result else None) if one else result

def execute_db(query, args=(), return_id=False):
    """Executes an INSERT, UPDATE, or DELETE parameterized query."""
    with get_db_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute(query, args)
            if return_id:
                return cursor.lastrowid
            return cursor.rowcount

def check_db_health():
    """Checks database availability and returns status object without exposing internal connection details."""
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cursor:
                cursor.execute("SELECT 1 AS alive")
                res = cursor.fetchone()
                if res and res.get('alive') == 1:
                    return {'status': 'connected'}
    except Exception as e:
        return {'status': 'disconnected'}
    return {'status': 'disconnected'}
