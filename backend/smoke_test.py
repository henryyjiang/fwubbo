#!/usr/bin/env python3
"""
Fwubbo Backend Smoke Test

Run from the backend/ directory:
    python smoke_test.py

Tests the full pipeline without needing the frontend or an LLM call:
  1. Module discovery (finds the countdown-timer example)
  2. Sandbox validation (AST import scanning)
  3. Fetch execution (subprocess sandbox)
  4. Widget source serving
  5. Stats DB logging
"""

import asyncio
import json
import sys
from pathlib import Path

# Add backend to path
sys.path.insert(0, str(Path(__file__).parent))

from core.module_registry import ModuleRegistry
from core.sandbox import validate_imports, validate_network_calls, execute_fetch
from core.stats_db import StatsDB

PASS = "\033[92m✓\033[0m"
FAIL = "\033[91m✗\033[0m"
failures = 0


def check(label: str, condition: bool, detail: str = ""):
    global failures
    if condition:
        print(f"  {PASS} {label}")
    else:
        print(f"  {FAIL} {label}" + (f" — {detail}" if detail else ""))
        failures += 1


async def main():
    global failures

    print("\n━━━ Fwubbo Backend Smoke Test ━━━\n")

    # ── 1. Module Discovery ───────────────────────────────────────
    print("1. Module Discovery")
    registry = ModuleRegistry()
    await registry.discover_modules()

    check("Registry found modules", len(registry.modules) > 0, f"found {len(registry.modules)}")
    check("countdown-timer discovered", "countdown-timer" in registry.modules)

    mod = registry.get("countdown-timer")
    if mod:
        check("Manifest id correct", mod.manifest.id == "countdown-timer")
        check("Manifest name correct", mod.manifest.name == "Countdown Timer")
        check("fetch.py exists", mod.fetch_path.exists())
        check("widget.tsx exists", mod.widget_path.exists())
        check("No secrets required", len(mod.manifest.requires) == 0)
        check("No network permissions", len(mod.manifest.permissions.network) == 0)
    else:
        print(f"  {FAIL} Cannot proceed — countdown-timer not found")
        return

    # ── 2. Sandbox Validation ─────────────────────────────────────
    print("\n2. Sandbox Validation")

    fetch_source = mod.fetch_path.read_text()
    widget_source = mod.widget_path.read_text()

    # fetch.py should pass validation
    import_violations = validate_imports(fetch_source)
    check("fetch.py passes import scan", len(import_violations) == 0,
          f"violations: {import_violations}")

    network_violations = validate_network_calls(fetch_source, [])
    check("fetch.py passes network scan", len(network_violations) == 0,
          f"violations: {network_violations}")

    # Test that forbidden imports are caught
    bad_code_1 = "import subprocess"
    bad_v1 = validate_imports(bad_code_1)
    check("Catches `import subprocess`",
          any("subprocess" in v for v in bad_v1))

    bad_code_2 = "import os"
    bad_v2 = validate_imports(bad_code_2)
    check("Catches `import os`",
          any("import os" in v.lower() for v in bad_v2))

    good_code = "from os import environ"
    good_v = validate_imports(good_code)
    check("Allows `from os import environ`",
          len(good_v) == 0,
          f"violations: {good_v}")

    # Test partial os imports
    partial_os = "from os import path, environ"
    partial_v = validate_imports(partial_os)
    check("Catches `from os import path`",
          any("path" in v for v in partial_v))

    # ── 3. Fetch Execution ────────────────────────────────────────
    print("\n3. Fetch Execution (Subprocess Sandbox)")

    result = await execute_fetch(
        fetch_path=mod.fetch_path,
        secrets={},
        allowed_domains=[],
        allowed_extra_imports=[],
        timeout=10.0,
    )

    check("Fetch returned result", result is not None)
    check("Status is 'ok'", result.get("status") == "ok", f"got: {result.get('status')}")
    check("Data is not empty", bool(result.get("data")))

    data = result.get("data", {})
    check("Has 'label' field", "label" in data)
    check("Has 'days' field", "days" in data)
    check("Has 'message' field", "message" in data)
    check("Label is 'Graduation Day'", data.get("label") == "Graduation Day")

    days = data.get("days", -1)
    check("Days is non-negative int", isinstance(days, int) and days >= 0, f"got: {days}")

    notifications = result.get("notifications", [])
    check("Notifications is a list", isinstance(notifications, list))

    # ── 4. Widget Source ──────────────────────────────────────────
    print("\n4. Widget Source Validation")

    check("widget.tsx is non-empty", len(widget_source) > 100)
    check("Has export default", "export default" in widget_source)
    check("Has WidgetProps interface", "WidgetProps" in widget_source)
    check("Uses theme color classes", "text-text-primary" in widget_source)
    check("Uses text-accent-primary", "text-accent-primary" in widget_source)
    check("No hardcoded hex colors",
          "#" not in widget_source.replace("w-5 h-5", "").replace("w-10 h-10", "")
          or all(c not in widget_source for c in ['#fff', '#000', '#333', 'rgb(']))

    # Check imports are only from allowed packages
    import re
    tsx_imports = re.findall(r'from\s+["\']([^"\']+)["\']', widget_source)
    allowed_tsx_imports = {"react", "lucide-react", "recharts"}
    for imp in tsx_imports:
        check(f"TSX import '{imp}' is allowed", imp in allowed_tsx_imports)

    # ── 5. Stats DB ───────────────────────────────────────────────
    print("\n5. Stats DB")

    stats_db = StatsDB()
    stats_db.initialize()

    stats_db.log_fetch(
        module_id="countdown-timer",
        status="ok",
        api_calls=0,
        llm_tokens=0,
        fetch_ms=15.3,
    )

    stats = stats_db.get_stats("countdown-timer")
    check("Stats returned", bool(stats))
    check("api_calls_hour tracked", "api_calls_hour" in stats)
    check("fetch_count_hour >= 1", stats.get("fetch_count_hour", 0) >= 1)
    check("last_status is ok", stats.get("last_status") == "ok")

    stats_db.close()

    # ── Summary ───────────────────────────────────────────────────
    print(f"\n━━━ {'ALL TESTS PASSED' if failures == 0 else f'{failures} FAILURE(S)'} ━━━\n")
    return failures


if __name__ == "__main__":
    exit_code = asyncio.run(main())
    sys.exit(exit_code)
