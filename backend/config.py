import os
import secrets
from dotenv import load_dotenv

# Path to backend directory and .env
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
ENV_PATH = os.path.join(BASE_DIR, '.env')

# Load environment variables
load_dotenv(ENV_PATH)

def _get_or_create_secret_key():
    key = os.getenv('SECRET_KEY', '').strip()
    if not key:
        key = secrets.token_hex(32)
        # Preserve into .env without overwriting other keys
        try:
            if os.path.exists(ENV_PATH):
                with open(ENV_PATH, 'r') as f:
                    content = f.read()
                if 'SECRET_KEY=' in content:
                    lines = content.splitlines()
                    new_lines = []
                    for line in lines:
                        if line.startswith('SECRET_KEY='):
                            new_lines.append(f'SECRET_KEY={key}')
                        else:
                            new_lines.append(line)
                    with open(ENV_PATH, 'w') as f:
                        f.write('\n'.join(new_lines) + '\n')
                else:
                    with open(ENV_PATH, 'a') as f:
                        f.write(f'\nSECRET_KEY={key}\n')
            else:
                with open(ENV_PATH, 'w') as f:
                    f.write(f'SECRET_KEY={key}\n')
        except Exception:
            pass
    return key

class Config:
    DB_HOST = os.getenv('DB_HOST', 'localhost')
    DB_PORT = int(os.getenv('DB_PORT', 3306))
    DB_NAME = os.getenv('DB_NAME', 'bottling_plant_db')
    DB_USER = os.getenv('DB_USER', 'root')
    DB_PASSWORD = os.getenv('DB_PASSWORD', '')
    SECRET_KEY = _get_or_create_secret_key()
    JWT_EXPIRATION_HOURS = 24
    FLASK_ENV = os.getenv('FLASK_ENV', 'development')
    PORT = int(os.getenv('PORT', 5000))
    GEMINI_API_KEY = os.getenv('GEMINI_API_KEY', '').strip()
    GEMINI_MODEL = os.getenv('GEMINI_MODEL', 'gemini-flash-lite-latest').strip()
    ONLINE_THRESHOLD_SECONDS = int(os.getenv('ONLINE_THRESHOLD_SECONDS', 90))
