#!/usr/bin/env python3
"""
Standalone Mistral API key verification script.
Tests API key validity without any app logic.
"""

import os
import sys
import httpx
import json
from typing import Optional

# Configuration from environment variables
MISTRAL_API_KEY = os.getenv("MISTRAL_API_KEY", "97ZQlsV45YrDusgZRwjArWGbh3nerFPb")
MISTRAL_BASE_URL = os.getenv("MISTRAL_BASE_URL", "https://api.mistral.ai/v1")
MISTRAL_MODEL = os.getenv("MISTRAL_MODEL", "mistral-medium")
TIMEOUT_SECONDS = 20

def test_mistral_key() -> None:
    """Test Mistral API key and print result."""
    
    if not MISTRAL_API_KEY:
        print("❌ ERROR: MISTRAL_API_KEY not set and no default provided")
        sys.exit(1)
    
    endpoint = f"{MISTRAL_BASE_URL}/chat/completions"
    headers = {
        "Authorization": f"Bearer {MISTRAL_API_KEY}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": MISTRAL_MODEL,
        "messages": [
            {"role": "system", "content": "Answer briefly."},
            {"role": "user", "content": "What is 2 + 2?"},
        ],
        "temperature": 0,
        "max_tokens": 32,
    }
    
    print(f"🔍 Testing Mistral API Key")
    print(f"   Endpoint: {endpoint}")
    print(f"   Model: {MISTRAL_MODEL}")
    print(f"   Timeout: {TIMEOUT_SECONDS}s")
    print()
    
    try:
        with httpx.Client(timeout=TIMEOUT_SECONDS) as client:
            response = client.post(endpoint, headers=headers, json=payload)
        
        # Check status code
        if response.status_code == 200:
            data = response.json()
            if "choices" in data and len(data["choices"]) > 0:
                message = data["choices"][0].get("message", {}).get("content", "")
                print(f"✅ SUCCESS: API key is valid")
                print(f"   Status: {response.status_code}")
                print(f"   Response: {message[:80]}")
            else:
                print(f"✅ SUCCESS: API key is valid (unexpected response structure)")
                print(f"   Status: {response.status_code}")
                print(f"   Body: {str(data)[:120]}")
        
        elif response.status_code == 401:
            print(f"❌ INVALID KEY: Authentication failed")
            print(f"   Status: 401 Unauthorized")
            try:
                error_data = response.json()
                print(f"   Message: {error_data.get('message', 'Unknown error')}")
            except:
                print(f"   Body: {response.text[:200]}")
        
        elif response.status_code == 429:
            print(f"⏳ RATE LIMITED: Too many requests")
            print(f"   Status: 429 Too Many Requests")
            try:
                error_data = response.json()
                print(f"   Message: {error_data.get('message', 'Unknown error')}")
            except:
                print(f"   Body: {response.text[:200]}")
        
        elif response.status_code == 403:
            print(f"❌ FORBIDDEN: Access denied (possible plan/quota issue)")
            print(f"   Status: 403 Forbidden")
            try:
                error_data = response.json()
                print(f"   Message: {error_data.get('message', 'Unknown error')}")
            except:
                print(f"   Body: {response.text[:200]}")
        
        elif response.status_code == 500:
            print(f"⚠️  SERVER ERROR: Mistral API is having issues")
            print(f"   Status: 500 Internal Server Error")
            print(f"   Body: {response.text[:200]}")
        
        else:
            print(f"❓ UNEXPECTED STATUS: {response.status_code}")
            print(f"   Body: {response.text[:200]}")
    
    except httpx.ReadTimeout:
        print(f"⏱️  TIMEOUT: Read timeout after {TIMEOUT_SECONDS}s")
        print(f"   The server took too long to respond")
        print(f"   Check your network connection or Mistral API status")
    
    except httpx.ConnectTimeout:
        print(f"⏱️  TIMEOUT: Connection timeout after {TIMEOUT_SECONDS}s")
        print(f"   Could not connect to the API server")
        print(f"   Check your network connection or Mistral API status")
    
    except httpx.ConnectError as e:
        print(f"🌐 NETWORK ERROR: Connection failed")
        print(f"   {type(e).__name__}: {str(e)[:120]}")
        print(f"   Check your internet connection and endpoint URL")
    
    except Exception as e:
        print(f"❌ ERROR: Unexpected exception")
        print(f"   {type(e).__name__}: {str(e)[:200]}")


if __name__ == "__main__":
    test_mistral_key()
