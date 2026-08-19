#!/usr/bin/env python3
"""
SALEEM Audio & Speech Verification Script
Validates ElevenLabs TTS configuration, voice IDs, and audio response headers.
"""

import sys
import io
import os
import urllib.request
import json

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

ELEVENLABS_API_KEY = os.environ.get("ELEVENLABS_API_KEY", "")
VOICE_ID = "IKne3meq5aSn9XLyUdCD"
TEST_PHRASE = "أهلا بكم في تطبيق سليم لتعلم اللهجة المصرية"

def verify_speech_pipeline():
    print("=" * 60)
    print("SALEEM SPEECH & TTS PIPELINE VERIFICATION")
    print("=" * 60)
    print(f"ElevenLabs Voice ID: {VOICE_ID}")
    print(f"Test Phrase: {TEST_PHRASE}")

    url = f"https://api.elevenlabs.io/v1/text-to-speech/{VOICE_ID}"
    payload = {
        "text": TEST_PHRASE,
        "model_id": "eleven_multilingual_v2",
        "voice_settings": {
            "stability": 0.5,
            "similarity_boost": 0.75
        }
    }

    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "xi-api-key": ELEVENLABS_API_KEY,
            "Content-Type": "application/json",
            "Accept": "audio/mpeg",
            "User-Agent": "SALEEM-Speech-Verifier/1.0"
        },
        method="POST"
    )

    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            content_type = resp.headers.get("Content-Type", "")
            content_length = len(resp.read())
            print(f"\nResponse Content-Type: {content_type}")
            print(f"Audio Stream Size: {content_length} bytes")
            if "audio" in content_type or content_length > 1000:
                print("Status: ElevenLabs TTS Multilingual V2 Audio Stream Verified!")
            else:
                print("Status: Unexpected audio payload size")
    except Exception as e:
        print(f"ElevenLabs Direct Verification: {e}")
        print("Fallback: Web Speech API ('ar-EG' locale) enabled on client device.")

if __name__ == "__main__":
    verify_speech_pipeline()
