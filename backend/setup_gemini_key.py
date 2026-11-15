#!/usr/bin/env python3
"""
Secure Local Setup Mechanism for Google Gemini API Key
Allows operator/developer to configure Gemini API key using hidden terminal input.
The key is never printed, logged, or exposed.
"""

import os
import sys
import getpass
from pathlib import Path

# Fix terminal encoding on Windows
if sys.stdout.encoding != 'utf-8':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

BASE_DIR = Path(__file__).resolve().parent
ENV_PATH = BASE_DIR / '.env'

def read_env_file(path: Path) -> list:
    """Reads .env lines preserving order and comments."""
    if not path.exists():
        return []
    with open(path, 'r', encoding='utf-8') as f:
        return f.readlines()

def write_env_file(path: Path, lines: list):
    """Writes updated lines back to .env."""
    with open(path, 'w', encoding='utf-8') as f:
        f.writelines(lines)

def update_env_variable(lines: list, key: str, value: str) -> list:
    """Updates an existing key or appends a new one, preserving other lines."""
    key_prefix = f"{key}="
    found = False
    new_lines = []
    
    for line in lines:
        stripped = line.strip()
        if stripped.startswith(key_prefix):
            new_lines.append(f"{key}={value}\n")
            found = True
        else:
            new_lines.append(line)
            
    if not found:
        if new_lines and not new_lines[-1].endswith('\n'):
            new_lines[-1] += '\n'
        new_lines.append(f"{key}={value}\n")
        
    return new_lines

def get_existing_value(lines: list, key: str) -> str:
    """Gets value for a key from .env lines if present."""
    prefix = f"{key}="
    for line in lines:
        stripped = line.strip()
        if stripped.startswith(prefix) and not stripped.startswith('#'):
            return stripped[len(prefix):].strip().strip('"').strip("'")
    return ""

def main():
    print("=" * 64)
    print("  BOTTLING PLANT MANAGEMENT SYSTEM — GEMINI API CONFIGURATION  ")
    print("=" * 64)
    print("This utility securely stores your Google Gemini API key into")
    print("backend/.env using masked password-style input.")
    print("Your key is never logged, printed, or sent over unencrypted channels.\n")

    lines = read_env_file(ENV_PATH)
    existing_key = get_existing_value(lines, 'GEMINI_API_KEY')
    
    if existing_key:
        masked = existing_key[:4] + "..." + existing_key[-4:] if len(existing_key) > 8 else "****"
        print(f"[*] An existing GEMINI_API_KEY is already configured ({masked}).")
        overwrite = input("Do you want to replace it with a new key? [y/N]: ").strip().lower()
        if overwrite not in ['y', 'yes']:
            print("[✓] Keeping current API key. Setup complete.")
            return

    # Secure masked input
    api_key = getpass.getpass("Enter your Google Gemini API key (input is hidden): ").strip()
    
    if not api_key:
        print("[!] No key entered. Operation cancelled.")
        sys.exit(1)

    if len(api_key) < 15:
        print("[!] Warning: The entered key appears unusually short for a Google Gemini API key.")
        confirm = input("Are you sure you want to proceed? [y/N]: ").strip().lower()
        if confirm not in ['y', 'yes']:
            print("Operation cancelled.")
            sys.exit(1)

    # Model selection
    existing_model = get_existing_value(lines, 'GEMINI_MODEL') or 'gemini-2.5-flash'
    print(f"\nCurrent configured model: [{existing_model}]")
    custom_model = input(f"Press Enter to keep '{existing_model}' or type alternative model name: ").strip()
    selected_model = custom_model if custom_model else existing_model

    # Connectivity verification using official google-genai SDK
    print("\nVerifying key connectivity with Google Gemini API...")
    try:
        from google import genai
        client = genai.Client(api_key=api_key)
        
        # Test generation with minimal prompt
        response = client.models.generate_content(
            model=selected_model,
            contents="Say 'OK' if you receive this industrial telemetry test."
        )
        if response and response.text:
            print("[✓] Gemini API connection and model access verified successfully!")
        else:
            print("[!] Warning: Received empty response from model, but authentication succeeded.")
    except Exception as e:
        err_str = str(e)
        if "403" in err_str or "PERMISSION_DENIED" in err_str or "API_KEY_INVALID" in err_str:
            print(f"[!] Authentication Error: Google Gemini API rejected this key (Invalid or unauthorized).")
            retry = input("Do you still want to save it to .env anyway? [y/N]: ").strip().lower()
            if retry not in ['y', 'yes']:
                print("Key was not saved.")
                sys.exit(1)
        elif "404" in err_str or "NOT_FOUND" in err_str:
            print(f"[!] Model Warning: '{selected_model}' was not found. Consider using 'gemini-2.5-flash' or 'gemini-1.5-flash'.")
        elif "429" in err_str or "RESOURCE_EXHAUSTED" in err_str:
            print("[!] Notice: Quota limit or rate limit encountered. Key is authenticated.")
        else:
            print(f"[!] Notice during probe: {err_str[:120]}")

    # Save to backend/.env
    updated_lines = update_env_variable(lines, 'GEMINI_API_KEY', api_key)
    updated_lines = update_env_variable(updated_lines, 'GEMINI_MODEL', selected_model)
    write_env_file(ENV_PATH, updated_lines)

    print(f"\n[✓] Successfully saved configuration to backend/.env!")
    print(f"    • GEMINI_API_KEY: Configured (securely masked)")
    print(f"    • GEMINI_MODEL: {selected_model}")
    print("\nRestart your Flask server or make a chat request to begin using live Gemini intelligence.\n")

if __name__ == '__main__':
    main()
