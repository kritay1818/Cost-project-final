"""
Simple integration tests for the Cost Project.

Run with all four services started:
  npm run start:logs
  npm run start:users
  npm run start:costs
  npm run start:about

Install dependency:
  pip install requests
"""

import sys

import requests

LOGS_URL = "http://localhost:3001"
USERS_URL = "http://localhost:3002"
COSTS_URL = "http://localhost:3003"
ABOUT_URL = "http://localhost:3004"

DEMO_USER_ID = 123123
REPORT_YEAR = 2026
REPORT_MONTH = 1


def check(name, condition, detail=""):
    if condition:
        print(f"  PASS: {name}")
        return True
    msg = f"  FAIL: {name}"
    if detail:
        msg += f" — {detail}"
    print(msg)
    return False


def assert_error_json(response):
    data = response.json()
    ok = (
        response.status_code >= 400
        and isinstance(data.get("id"), str)
        and len(data.get("id", "")) > 0
        and isinstance(data.get("message"), str)
        and len(data.get("message", "")) > 0
    )
    return ok, data


def test_health_all_services():
    print("\n1. Health checks")
    all_ok = True
    for label, base in [
        ("logs", LOGS_URL),
        ("users", USERS_URL),
        ("costs", COSTS_URL),
        ("about", ABOUT_URL),
    ]:
        r = requests.get(f"{base}/health", timeout=5)
        ok = r.status_code == 200 and r.json().get("status") == "ok"
        all_ok = check(f"GET /health ({label})", ok, f"status={r.status_code}") and all_ok
    return all_ok


def test_about():
    print("\n2. GET /api/about")
    r = requests.get(f"{ABOUT_URL}/api/about", timeout=5)
    data = r.json()
    ok = r.status_code == 200 and isinstance(data, list) and len(data) > 0
    if ok:
        ok = "first_name" in data[0] and "last_name" in data[0]
    return check("GET /api/about", ok, str(data)[:80])


def test_create_user():
    print("\n3. POST /api/add (users)")
    payload = {
        "id": DEMO_USER_ID,
        "first_name": "mosh",
        "last_name": "israeli",
    }
    r = requests.post(f"{USERS_URL}/api/add", json=payload, timeout=5)
    # 201 created, or 409 if user already exists from a previous run
    ok = r.status_code in (201, 409)
    if r.status_code == 409:
        err_ok, err = assert_error_json(r)
        ok = ok and err_ok
    return check("POST /api/add user", ok, f"status={r.status_code}")


def test_get_user():
    print("\n4. GET /api/users/123123")
    r = requests.get(f"{USERS_URL}/api/users/{DEMO_USER_ID}", timeout=5)
    data = r.json()
    ok = r.status_code == 200
    for field in ("first_name", "last_name", "id", "total"):
        ok = check(f"  field '{field}' present", field in data) and ok
    ok = check("  id is 123123", data.get("id") == DEMO_USER_ID, str(data.get("id"))) and ok
    ok = check("  total is a number", isinstance(data.get("total"), (int, float)), str(data.get("total"))) and ok
    return ok


def test_add_cost():
    print("\n5. POST /api/add (costs — food)")
    payload = {
        "description": "milk",
        "category": "food",
        "userid": DEMO_USER_ID,
        "sum": 20,
        "created_at": "2026-01-10",
    }
    r = requests.post(f"{COSTS_URL}/api/add", json=payload, timeout=5)
    ok = r.status_code == 201
    return check("POST /api/add cost", ok, f"status={r.status_code} body={r.text[:80]}")


def test_report():
    print("\n6. GET /api/report")
    r = requests.get(
        f"{COSTS_URL}/api/report",
        params={"id": DEMO_USER_ID, "year": REPORT_YEAR, "month": REPORT_MONTH},
        timeout=5,
    )
    data = r.json()
    ok = r.status_code == 200
    ok = check("  costs is an array", isinstance(data.get("costs"), list), type(data.get("costs")).__name__) and ok

    costs = data.get("costs", [])
    has_food = any(isinstance(item, dict) and "food" in item for item in costs)
    ok = check("  report contains food category", has_food) and ok

    food_items = []
    for item in costs:
        if isinstance(item, dict) and "food" in item:
            food_items = item["food"]
            break

    if food_items:
        first = food_items[0]
        for field in ("sum", "description", "day"):
            ok = check(f"  food item has '{field}'", field in first) and ok
        ok = check("  no created_at in food item", "created_at" not in first) and ok
    else:
        ok = check("  food category has at least one item", False, "food list is empty") and ok

    return ok


def test_logs():
    print("\n7. GET /api/logs")
    r = requests.get(f"{LOGS_URL}/api/logs", timeout=5)
    data = r.json()
    ok = r.status_code == 200 and isinstance(data, list)
    return check("GET /api/logs", ok, f"status={r.status_code} count={len(data) if ok else 0}")


def test_invalid_category():
    print("\n8. Invalid cost category")
    payload = {
        "description": "bad",
        "category": "not-a-category",
        "userid": DEMO_USER_ID,
        "sum": 10,
    }
    r = requests.post(f"{COSTS_URL}/api/add", json=payload, timeout=5)
    err_ok, data = assert_error_json(r)
    ok = check("  status is error", r.status_code == 400) and err_ok
    return check("  JSON has id and message", ok, str(data)[:80])


def test_invalid_month():
    print("\n9. Invalid report month")
    r = requests.get(
        f"{COSTS_URL}/api/report",
        params={"id": DEMO_USER_ID, "year": REPORT_YEAR, "month": 13},
        timeout=5,
    )
    err_ok, data = assert_error_json(r)
    ok = check("  status is error", r.status_code == 400) and err_ok
    return check("  JSON has id and message", ok, str(data)[:80])


def main():
    print("Cost Project — simple tests")
    print("Make sure all four services are running.\n")

    tests = [
        test_health_all_services,
        test_about,
        test_create_user,
        test_get_user,
        test_add_cost,
        test_report,
        test_logs,
        test_invalid_category,
        test_invalid_month,
    ]

    passed = 0
    failed = 0
    for test_fn in tests:
        try:
            if test_fn():
                passed += 1
            else:
                failed += 1
        except requests.exceptions.ConnectionError:
            print(f"  FAIL: Could not connect — is the service running? ({test_fn.__name__})")
            failed += 1
        except Exception as e:
            print(f"  FAIL: {test_fn.__name__} raised {e}")
            failed += 1

    print(f"\nDone: {passed} passed, {failed} failed")
    sys.exit(0 if failed == 0 else 1)


if __name__ == "__main__":
    main()
