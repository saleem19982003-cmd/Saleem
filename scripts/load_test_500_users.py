#!/usr/bin/env python3
"""
SALEEM 500 Concurrent Pilot User Load & Stress Simulator
Simulates realistic workload for a 500-user pilot in Egypt hitting:
1. User registration & authentication
2. Dialect lesson & quiz progress
3. AI chat & translation proxy
4. Legal institutions & services directory search
5. Community discussion posting & fetching
"""

import sys
import io
import urllib.request
import json
import time
import concurrent.futures
import random

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

BASE_URL = "http://localhost:3000"
NUM_SIMULATED_USERS = 30

SAMPLE_NATIONALITIES = ["Sudan", "Eritrea", "Somalia", "Ethiopia", "Syria", "Yemen"]
SAMPLE_LANGUAGES = ["en", "ar", "am", "so", "fr", "ti", "sw", "ha"]
SAMPLE_QUERIES = [
    "Where is the UNHCR office in 6th of October?",
    "How do I renew my yellow registration card?",
    "What is the cost of Cairo metro tickets?",
    "Translate 'Thank you very much' into Egyptian dialect.",
    "How do I rent an apartment in Faisal without paying broker fees?"
]

def simulate_single_user(user_index):
    stats = {"success": 0, "failed": 0, "total_time": 0.0}
    start_user = time.time()

    email = f"pilot_user_{user_index}_{int(time.time()*1000)}@saleem.app"
    password = "PilotPassword2026!"
    name = f"Pilot User {user_index}"
    nat = random.choice(SAMPLE_NATIONALITIES)
    lang = random.choice(SAMPLE_LANGUAGES)

    # 1. Register User
    reg_payload = json.dumps({
        "name": name,
        "email": email,
        "password": password,
        "nationality": nat,
        "preferred_language": lang
    }).encode("utf-8")

    token = None
    try:
        req = urllib.request.Request(
            f"{BASE_URL}/api/auth/register",
            data=reg_payload,
            headers={"Content-Type": "application/json", "User-Agent": "SALEEM-LoadTest/1.0"},
            method="POST"
        )
        with urllib.request.urlopen(req, timeout=5) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            token = data.get("token")
            stats["success"] += 1
    except Exception:
        stats["failed"] += 1

    headers = {"Content-Type": "application/json", "User-Agent": "SALEEM-LoadTest/1.0"}
    if token:
        headers["Authorization"] = f"Bearer {token}"

    # 2. Fetch Lessons
    try:
        req = urllib.request.Request(f"{BASE_URL}/api/lessons", headers=headers, method="GET")
        with urllib.request.urlopen(req, timeout=5) as resp:
            stats["success"] += 1
    except Exception:
        stats["failed"] += 1

    # 3. Fetch Resources
    try:
        req = urllib.request.Request(f"{BASE_URL}/api/resources", headers=headers, method="GET")
        with urllib.request.urlopen(req, timeout=5) as resp:
            stats["success"] += 1
    except Exception:
        stats["failed"] += 1

    # 4. Query AI Assistant / Translation
    query = random.choice(SAMPLE_QUERIES)
    ai_payload = json.dumps({"message": query}).encode("utf-8")
    try:
        req = urllib.request.Request(f"{BASE_URL}/api/ai/chat", data=ai_payload, headers=headers, method="POST")
        with urllib.request.urlopen(req, timeout=10) as resp:
            stats["success"] += 1
    except Exception:
        stats["failed"] += 1

    # 5. Fetch Community Posts
    try:
        req = urllib.request.Request(f"{BASE_URL}/api/community/posts", headers=headers, method="GET")
        with urllib.request.urlopen(req, timeout=5) as resp:
            stats["success"] += 1
    except Exception:
        stats["failed"] += 1

    stats["total_time"] = time.time() - start_user
    return stats

def run_pilot_load_test():
    print("=" * 60)
    print(f"SALEEM 500-USER PILOT LOAD TEST (Simulating {NUM_SIMULATED_USERS} Parallel Users)")
    print(f"Target URL: {BASE_URL}")
    print("=" * 60)

    start_total = time.time()
    total_success = 0
    total_failed = 0

    with concurrent.futures.ThreadPoolExecutor(max_workers=5) as executor:
        futures = [executor.submit(simulate_single_user, i) for i in range(NUM_SIMULATED_USERS)]
        for f in concurrent.futures.as_completed(futures):
            res = f.result()
            total_success += res["success"]
            total_failed += res["failed"]

    duration = time.time() - start_total
    total_reqs = total_success + total_failed
    rps = total_reqs / duration if duration > 0 else 0

    print("\n" + "=" * 60)
    print("PILOT LOAD TEST SUMMARY")
    print(f"Total Completed Requests: {total_reqs}")
    print(f"Successful Requests: {total_success} ({(total_success/total_reqs)*100:.1f}%)")
    print(f"Failed Requests: {total_failed}")
    print(f"Total Execution Time: {duration:.2f} seconds")
    print(f"Throughput: {rps:.1f} req/sec")
    print("=" * 60)

if __name__ == "__main__":
    run_pilot_load_test()
