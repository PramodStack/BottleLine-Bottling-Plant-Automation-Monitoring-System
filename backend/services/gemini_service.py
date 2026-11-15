"""
Google Gemini Service Module
Integrates Google's official Gemini API using the supported google-genai Python SDK.
Operates in monitoring & advisory mode with strict read-only parameters.
"""

import os
import time
import logging
from typing import Optional, Dict, Any, Tuple
from google import genai
from google.genai import types
from google.genai.errors import APIError

from dotenv import load_dotenv
_BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
load_dotenv(os.path.join(_BASE_DIR, '.env'))

logger = logging.getLogger('bottling_plant.gemini')

_client_cache: Optional[genai.Client] = None
_cached_key: Optional[str] = None

def get_gemini_config() -> Tuple[str, str]:
    """Retrieves current API key and model name from environment."""
    api_key = os.getenv('GEMINI_API_KEY', '').strip()
    # Support backward-compatibility fallback if user set GOOGLE_API_KEY
    if not api_key:
        api_key = os.getenv('GOOGLE_API_KEY', '').strip()
    model_name = os.getenv('GEMINI_MODEL', 'gemini-flash-lite-latest').strip()
    return api_key, model_name

def is_gemini_configured() -> bool:
    """Returns True if a non-empty Gemini API key is configured."""
    api_key, _ = get_gemini_config()
    return bool(api_key and len(api_key) > 5)

def get_gemini_client() -> Optional[genai.Client]:
    """
    Returns a cached or freshly instantiated genai.Client.
    Returns None if no API key is configured.
    """
    global _client_cache, _cached_key
    api_key, _ = get_gemini_config()
    
    if not api_key:
        return None
        
    if _client_cache is not None and _cached_key == api_key:
        return _client_cache
        
    try:
        _client_cache = genai.Client(api_key=api_key)
        _cached_key = api_key
        return _client_cache
    except Exception as e:
        logger.error(f"Failed to initialize genai.Client: {e}")
        return None

def check_gemini_health() -> Dict[str, Any]:
    """
    Checks Gemini API status without exposing secrets.
    """
    api_key, model_name = get_gemini_config()
    if not api_key:
        return {
            "status": "unconfigured",
            "configured": False,
            "model": model_name,
            "message": "GEMINI_API_KEY is not set in backend/.env"
        }
        
    client = get_gemini_client()
    if not client:
        return {
            "status": "error",
            "configured": True,
            "model": model_name,
            "message": "Could not instantiate Gemini client"
        }
        
    # Quick probe
    try:
        models = list(client.models.list(config={"page_size": 5}))
        return {
            "status": "connected",
            "configured": True,
            "model": model_name,
            "models_available": len(models) > 0,
            "message": "Gemini API connection active and authenticated"
        }
    except Exception as e:
        err_msg = str(e)
        if "403" in err_msg or "PERMISSION_DENIED" in err_msg or "API_KEY_INVALID" in err_msg:
            return {
                "status": "invalid_key",
                "configured": True,
                "model": model_name,
                "message": "Configured Gemini API key is invalid or lacks necessary permissions"
            }
        elif "429" in err_msg or "RESOURCE_EXHAUSTED" in err_msg:
            return {
                "status": "quota_exceeded",
                "configured": True,
                "model": model_name,
                "message": "Gemini API quota exceeded or rate limit reached"
            }
        return {
            "status": "error",
            "configured": True,
            "model": model_name,
            "message": f"Connection check failed: {err_msg[:120]}"
        }

def generate_content_with_gemini(
    system_instruction: str,
    user_prompt: str,
    model_override: Optional[str] = None,
    temperature: float = 0.2,
    max_output_tokens: int = 1024
) -> Tuple[Optional[str], Optional[str]]:
    """
    Generates content using the official google-genai SDK.
    Returns: (generated_text, error_message_if_any)
    """
    api_key, default_model = get_gemini_config()
    if not api_key:
        return None, "GEMINI_API_KEY not configured"

    model = model_override or default_model
    client = get_gemini_client()
    if not client:
        return None, "Failed to initialize Gemini client"

    # Build model trial list: requested model first, then compatible fallback candidates
    candidate_models = [model]
    for fallback in ['gemini-flash-lite-latest', 'gemini-flash-latest', 'gemini-3.1-flash-lite']:
        if fallback not in candidate_models:
            candidate_models.append(fallback)

    last_error = "Unknown error"
    for current_model in candidate_models:
        try:
            config = types.GenerateContentConfig(
                system_instruction=system_instruction,
                temperature=temperature,
                max_output_tokens=max_output_tokens,
            )
            response = client.models.generate_content(
                model=current_model,
                contents=user_prompt,
                config=config,
            )
            
            if response and response.text:
                return response.text.strip(), None
            else:
                last_error = "Empty response received from Gemini model"

        except APIError as api_err:
            status_code = getattr(api_err, 'code', None)
            err_message = str(api_err)
            
            if status_code in (401, 403) or "PERMISSION_DENIED" in err_message or "API_KEY_INVALID" in err_message:
                logger.error("Gemini API key is invalid or unauthorized.")
                return None, "INVALID_KEY"
            elif status_code == 429 or "RESOURCE_EXHAUSTED" in err_message:
                logger.warning(f"Gemini model {current_model} quota exceeded (HTTP 429). Checking next candidate...")
                last_error = "QUOTA_EXCEEDED"
                continue
            elif status_code == 404 or "NOT_FOUND" in err_message:
                logger.info(f"Gemini model {current_model} not found (HTTP 404). Checking next candidate...")
                last_error = "NOT_FOUND"
                continue
            else:
                last_error = f"Gemini API Error ({current_model}): {err_message[:120]}"

    return None, last_error


def generate_content_stream_with_gemini(
    system_instruction: str,
    user_prompt: str,
    model_override: Optional[str] = None,
    temperature: float = 0.7,
    max_output_tokens: int = 1024
):
    """
    Generates content progressively using generate_content_stream from official google-genai SDK.
    Yields: (chunk_text, error_message_if_any)
    """
    api_key, default_model = get_gemini_config()
    if not api_key:
        yield None, "GEMINI_API_KEY not configured"
        return

    model = model_override or default_model
    client = get_gemini_client()
    if not client:
        yield None, "Failed to initialize Gemini client"
        return

    candidate_models = [model]
    for fallback in ['gemini-flash-lite-latest', 'gemini-3.5-flash-lite', 'gemini-flash-latest']:
        if fallback not in candidate_models:
            candidate_models.append(fallback)

    config = types.GenerateContentConfig(
        system_instruction=system_instruction,
        temperature=temperature,
        max_output_tokens=max_output_tokens,
    )

    last_error = "Unknown error"
    for current_model in candidate_models:
        try:
            stream = client.models.generate_content_stream(
                model=current_model,
                contents=user_prompt,
                config=config,
            )
            yielded_any = False
            for chunk in stream:
                if chunk and chunk.text:
                    yielded_any = True
                    yield chunk.text, None

            if yielded_any:
                return
            else:
                last_error = "Empty stream received"

        except APIError as api_err:
            status_code = getattr(api_err, 'code', None)
            err_message = str(api_err)
            if status_code in (401, 403) or "PERMISSION_DENIED" in err_message or "API_KEY_INVALID" in err_message:
                logger.error("Gemini API key is invalid or unauthorized.")
                yield None, "INVALID_KEY"
                return
            elif status_code == 429 or "RESOURCE_EXHAUSTED" in err_message:
                logger.warning(f"Gemini model {current_model} quota exceeded. Checking next candidate...")
                last_error = "QUOTA_EXCEEDED"
                continue
            elif status_code == 404 or "NOT_FOUND" in err_message:
                last_error = "NOT_FOUND"
                continue
            else:
                last_error = f"Gemini API Error ({current_model}): {err_message[:120]}"

        except Exception as ex:
            last_error = f"Gemini Exception ({current_model}): {str(ex)[:120]}"

    yield None, last_error

