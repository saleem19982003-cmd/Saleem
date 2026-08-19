#!/usr/bin/env python3
"""
SALEEM AI Model & Egyptian Dialect Evaluation Benchmark Script
Evaluates Groq Llama 3.3 70B model responses for Egyptian Arabic accuracy,
refugee safety guardrails, and response latency.
"""

import sys
import io
import os
import urllib.request
import json
import time

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

GROQ_API_KEY = os.environ.get("GROQ_API_KEY", "")
AI_MODEL = os.environ.get("GROQ_MODEL", "llama-3.3-70b-versatile")

EVAL_PROMPTS = [
    {
        "id": "eval-1",
        "category": "Dialect Translation",
        "prompt": "Translate 'How much does this cost?' to authentic Egyptian Colloquial Arabic (عامية مصرية).",
        "expected_keywords": ["بكام", "ده", "كام"]
    },
    {
        "id": "eval-2",
        "category": "Transport Logistics",
        "prompt": "How do I take a microbus in Cairo and what phrase do I use to ask the driver to drop me off?",
        "expected_keywords": ["على جنب", "اسطى", "ميكروباص"]
    },
    {
        "id": "eval-3",
        "category": "Emergency & Safety",
        "prompt": "My friend is sick and needs an ambulance in Egypt. What number should I call?",
        "expected_keywords": ["123", "إسعاف", "ambulance"]
    },
    {
        "id": "eval-4",
        "category": "UNHCR & Legal",
        "prompt": "Where is the main UNHCR registration center in Egypt and what document do refugees receive?",
        "expected_keywords": ["6th of October", "Yellow Card", "أكتوبر", "صفراء"]
    }
]

def run_ai_eval():
    print("=" * 60)
    print("SALEEM AI MODEL BENCHMARK (Groq Llama 3.3 70B)")
    print("=" * 60)

    passed_count = 0
    total_latency = 0.0

    for item in EVAL_PROMPTS:
        print(f"\n[Running {item['id']}] {item['category']}")
        print(f"Prompt: {item['prompt']}")
        
        payload = {
            "model": AI_MODEL,
            "messages": [
                {
                    "role": "system",
                    "content": "You are Saleem AI, an expert assistant specializing in Egyptian Arabic dialect (عامية مصرية), Cairo transportation, UNHCR procedures, and refugee safety."
                },
                {"role": "user", "content": item["prompt"]}
            ],
            "temperature": 0.3,
            "max_tokens": 300
        }

        req = urllib.request.Request(
            "https://api.groq.com/openai/v1/chat/completions",
            data=json.dumps(payload).encode("utf-8"),
            headers={
                "Authorization": f"Bearer {GROQ_API_KEY}",
                "Content-Type": "application/json",
                "User-Agent": "SALEEM-AI-Benchmark/1.0"
            },
            method="POST"
        )

        start_time = time.time()
        try:
            with urllib.request.urlopen(req, timeout=15) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                elapsed = time.time() - start_time
                total_latency += elapsed
                
                content = data["choices"][0]["message"]["content"]
                print(f"Response ({elapsed:.2f}s):\n{content.strip()[:180]}...")
                
                matched = any(kw.lower() in content.lower() for kw in item["expected_keywords"])
                if matched:
                    print("Status: PASSED (Keywords matched)")
                    passed_count += 1
                else:
                    print(f"Status: WARN (Keywords {item['expected_keywords']} not found)")

        except Exception as e:
            print(f"Status: FAILED - {e}")

    avg_latency = total_latency / len(EVAL_PROMPTS) if EVAL_PROMPTS else 0
    print("\n" + "=" * 60)
    print(f"BENCHMARK RESULTS: {passed_count}/{len(EVAL_PROMPTS)} Passed")
    print(f"Average Latency: {avg_latency:.2f} seconds")
    print("=" * 60)

if __name__ == "__main__":
    run_ai_eval()
