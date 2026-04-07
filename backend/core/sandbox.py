"""Sandbox enforcer — validates module code and restricts execution.

Before any module fetch script runs, this enforcer:
1. Scans for forbidden imports (os, subprocess, socket, etc.)
2. Validates network calls match declared permissions
3. Wraps execution in a subprocess with timeout
4. Injects secrets as environment variables (never in code)
"""

import ast
import asyncio
import json
import sys
import logging
from pathlib import Path
from typing import Any

logger = logging.getLogger("fwubbo.sandbox")

# Imports that are NEVER allowed in module code
FORBIDDEN_IMPORTS = frozenset({
    "subprocess", "socket", "shutil", "ctypes",
    "multiprocessing", "threading", "signal", "sys",
    "importlib", "builtins", "__builtin__",
    "pickle", "shelve", "marshal",
    "tempfile", "glob", "pathlib",
    "webbrowser", "code", "codeop",
    "compileall", "py_compile",
})

# `os` is special-cased: `from os import environ` is allowed, everything else is forbidden.
# This is handled in validate_imports() below.

# Allowed stdlib imports (safe subset)
ALLOWED_STDLIB = frozenset({
    "json", "math", "re", "datetime", "collections",
    "itertools", "functools", "operator", "string",
    "decimal", "fractions", "statistics", "random",
    "hashlib", "hmac", "base64", "urllib.parse",
    "html", "textwrap", "enum", "dataclasses",
    "typing", "abc", "copy", "pprint",
    "zoneinfo", "time", "calendar", "bisect",
    "heapq", "struct", "io", "csv",
    "xml", "email", "imaplib",
})

# Always-allowed third-party imports
ALLOWED_THIRD_PARTY = frozenset({
    "httpx", "aiohttp", "requests",
    "pydantic", "numpy", "pandas",
    "anthropic",
})


class SandboxViolation(Exception):
    """Raised when module code violates sandbox rules."""
    pass


def validate_imports(source: str, allowed_extra: list[str] | None = None) -> list[str]:
    """Parse source and check all imports against the allowlist.

    Returns list of violations (empty = safe).

    Special cases:
      - `from os import environ` is allowed (needed for secret injection)
      - `import os` or `from os import <anything_else>` is forbidden
    """
    violations = []
    allowed_extra_set = frozenset(allowed_extra or [])

    ALLOWED_OS_NAMES = {"environ"}

    try:
        tree = ast.parse(source)
    except SyntaxError as e:
        return [f"Syntax error in module code: {e}"]

    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                root = alias.name.split(".")[0]
                # `import os` is forbidden (use `from os import environ`)
                if root == "os":
                    violations.append(
                        f"Forbidden: `import os` — use `from os import environ` instead"
                    )
                elif root in FORBIDDEN_IMPORTS:
                    violations.append(f"Forbidden import: {alias.name}")
                elif (
                    root not in ALLOWED_STDLIB
                    and root not in ALLOWED_THIRD_PARTY
                    and root not in allowed_extra_set
                ):
                    violations.append(
                        f"Undeclared import: {alias.name} (add to permissions.python_imports)"
                    )

        elif isinstance(node, ast.ImportFrom):
            if node.module:
                root = node.module.split(".")[0]

                # Special handling for `os`
                if root == "os":
                    # Only `from os import environ` is allowed
                    imported_names = {alias.name for alias in node.names} if node.names else set()
                    disallowed = imported_names - ALLOWED_OS_NAMES
                    if disallowed:
                        violations.append(
                            f"Forbidden: `from os import {', '.join(disallowed)}` — "
                            f"only `from os import environ` is allowed"
                        )
                    # If only environ, it's fine — skip further checks
                    continue

                if root in FORBIDDEN_IMPORTS:
                    violations.append(f"Forbidden import: from {node.module}")
                elif (
                    root not in ALLOWED_STDLIB
                    and root not in ALLOWED_THIRD_PARTY
                    and root not in allowed_extra_set
                ):
                    violations.append(
                        f"Undeclared import: from {node.module} (add to permissions.python_imports)"
                    )

    return violations


def _domain_matches(domain: str, pattern: str) -> bool:
    """Check if a domain matches a pattern, supporting *.example.com wildcards."""
    if pattern.startswith("*."):
        suffix = pattern[1:]  # e.g. ".myworkdayjobs.com"
        return domain.endswith(suffix) or domain == pattern[2:]
    return domain == pattern or domain.endswith(f".{pattern}")


def validate_network_calls(source: str, allowed_domains: list[str]) -> list[str]:
    """Basic static check for URL strings against declared domains.

    Not foolproof — runtime enforcement is the real guard — but catches obvious cases.
    Supports wildcard patterns like *.myworkdayjobs.com in the allowed_domains list.
    """
    violations = []
    # Simple heuristic: look for string literals containing http
    try:
        tree = ast.parse(source)
    except SyntaxError:
        return []

    for node in ast.walk(tree):
        if isinstance(node, ast.Constant) and isinstance(node.value, str):
            val = node.value
            if val.startswith("http://") or val.startswith("https://"):
                from urllib.parse import urlparse
                parsed = urlparse(val)
                domain = parsed.hostname or ""
                if not any(_domain_matches(domain, d) for d in allowed_domains):
                    violations.append(f"Undeclared network domain: {domain} in URL '{val}'")

    return violations


async def execute_fetch(
    fetch_path: Path,
    secrets: dict[str, str],
    allowed_domains: list[str],
    allowed_extra_imports: list[str] | None = None,
    timeout: float = 30.0,
) -> dict[str, Any]:
    """Execute a module's fetch.py in a sandboxed subprocess.

    - Secrets are passed as env vars prefixed with FWUBBO_SECRET_
    - stdout must be a single JSON object matching ModuleFetchResult
    - stderr is captured for logging
    - Hard timeout kills the process
    """
    # Read and validate source first
    source = fetch_path.read_text()
    import_violations = validate_imports(source, allowed_extra_imports)
    if import_violations:
        return {
            "status": "error",
            "data": {},
            "notifications": [],
            "error": f"Sandbox violation: {'; '.join(import_violations)}",
        }

    network_violations = validate_network_calls(source, allowed_domains)
    if network_violations:
        logger.warning(f"Network violations in {fetch_path}: {network_violations}")
        # Warning only — runtime enforcement handles actual blocking

    # Build sandboxed environment
    # We need PYTHONPATH for pip-installed packages, PATH for the python binary,
    # and SSL-related env vars so that httpx/requests can verify certificates.
    import os as _os
    import site as _site

    # Compute full site-packages path so subprocess can import pip packages
    _site_packages = _site.getsitepackages() if hasattr(_site, "getsitepackages") else []
    _user_site = _site.getusersitepackages() if hasattr(_site, "getusersitepackages") else ""
    _python_paths = [
        p for p in [
            _os.environ.get("PYTHONPATH", ""),
            *_site_packages,
            _user_site if isinstance(_user_site, str) else "",
        ] if p
    ]

    env = {
        # Full Python import path so pip packages (httpx, etc.) are importable
        "PYTHONPATH": _os.pathsep.join(_python_paths),
        # PATH needs python binary dir; also include /usr/bin for SSL tools
        "PATH": _os.pathsep.join(filter(None, [
            _os.path.dirname(sys.executable),
            "/usr/bin",
            "/usr/local/bin",
        ])),
        "HOME": "/tmp",
        # Python needs this to function properly
        "PYTHONHASHSEED": "random",
    }

    # Propagate SSL/TLS certificate environment variables — without these,
    # httpx/requests fail with SSL_CERTIFICATE_VERIFY_FAILED on macOS/Linux
    for key in (
        "SSL_CERT_FILE", "SSL_CERT_DIR",
        "REQUESTS_CA_BUNDLE", "CURL_CA_BUNDLE",
        "CERTIFI_PATH",
        # macOS-specific: Python.org installers set this
        "PYTHONHTTPSVERIFY",
    ):
        if key in _os.environ:
            env[key] = _os.environ[key]

    # If no SSL cert env vars are set, try to find certifi's bundle and set it
    if not any(k in env for k in ("SSL_CERT_FILE", "REQUESTS_CA_BUNDLE")):
        try:
            import certifi
            cert_path = certifi.where()
            env["SSL_CERT_FILE"] = cert_path
            env["REQUESTS_CA_BUNDLE"] = cert_path
        except ImportError:
            pass  # certifi not available — OS certs should still work

    # Propagate any VIRTUAL_ENV or site-packages paths
    for key in ("VIRTUAL_ENV", "CONDA_PREFIX", "PYTHONUSERBASE"):
        if key in _os.environ:
            env[key] = _os.environ[key]

    # Inject secrets
    for key, value in secrets.items():
        env[f"FWUBBO_SECRET_{key.upper()}"] = value

    # Expose ANTHROPIC_API_KEY so fetch scripts can use the Anthropic SDK
    # (e.g. for LLM-powered search/summarization via the anthropic package)
    if "ANTHROPIC_API_KEY" in _os.environ:
        env["ANTHROPIC_API_KEY"] = _os.environ["ANTHROPIC_API_KEY"]

    # Inject per-module config from config.json
    config_path = fetch_path.parent / "config.json"
    if config_path.exists():
        try:
            config_data = json.loads(config_path.read_text())
            env["FWUBBO_CONFIG"] = json.dumps(config_data)
        except Exception:
            env["FWUBBO_CONFIG"] = "{}"
    else:
        env["FWUBBO_CONFIG"] = "{}"

    # Also inject password-type config values as secrets
    manifest_path = fetch_path.parent / "manifest.json"
    if manifest_path.exists():
        try:
            manifest_raw = json.loads(manifest_path.read_text())
            settings = manifest_raw.get("settings", [])
            config_vals = json.loads(env.get("FWUBBO_CONFIG", "{}"))
            for setting in settings:
                if setting.get("type") == "password" and setting["key"] in config_vals:
                    env_key = f"FWUBBO_SECRET_{setting['key'].upper()}"
                    if env_key not in env or not env[env_key]:
                        env[env_key] = str(config_vals[setting["key"]])
        except Exception:
            pass

    # Inject global app settings (FWUBBO_SETTINGS) so fetch scripts can read
    # the user's profile (name, location, timezone, interests) without needing
    # per-widget duplicates. Read via json.loads(environ.get("FWUBBO_SETTINGS", "{}")).
    settings_path = fetch_path.parent.parent.parent / "data" / "settings.json"
    if settings_path.exists():
        try:
            env["FWUBBO_SETTINGS"] = settings_path.read_text()
        except Exception:
            env["FWUBBO_SETTINGS"] = "{}"
    else:
        env["FWUBBO_SETTINGS"] = "{}"

    # Inject persisted module state (FWUBBO_STATE) so fetch scripts can cache
    # expensive results (e.g. LLM searches) across refreshes. Fetch scripts
    # read state via environ.get("FWUBBO_STATE", "{}") and return updated state
    # by including a "state" key in their output JSON — it's automatically saved.
    state_path = fetch_path.parent / "state.json"
    if state_path.exists():
        try:
            env["FWUBBO_STATE"] = state_path.read_text()
        except Exception:
            env["FWUBBO_STATE"] = "{}"
    else:
        env["FWUBBO_STATE"] = "{}"

    # Execute in subprocess
    try:
        proc = await asyncio.create_subprocess_exec(
            sys.executable, str(fetch_path),
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            env=env,
            cwd="/tmp",
        )

        stdout, stderr = await asyncio.wait_for(
            proc.communicate(),
            timeout=timeout,
        )

        if stderr:
            logger.warning(f"[{fetch_path.stem}] stderr: {stderr.decode()[:500]}")

        if proc.returncode != 0:
            return {
                "status": "error",
                "data": {},
                "notifications": [],
                "error": f"Process exited with code {proc.returncode}",
            }

        # Parse JSON output
        try:
            result = json.loads(stdout.decode())
            # Validate shape
            if "status" not in result or "data" not in result:
                return {
                    "status": "error",
                    "data": {},
                    "notifications": [],
                    "error": "Invalid fetch output: missing 'status' or 'data' fields",
                }
            result.setdefault("notifications", [])

            # Persist any state the fetch script returned — pop it so it's
            # never forwarded to the frontend (it's internal caching only).
            if "state" in result and isinstance(result["state"], dict):
                try:
                    state_path = fetch_path.parent / "state.json"
                    state_path.write_text(json.dumps(result.pop("state"), indent=2))
                except Exception as _se:
                    logger.warning(f"Failed to save state for {fetch_path.stem}: {_se}")
                    result.pop("state", None)

            return result

        except json.JSONDecodeError as e:
            return {
                "status": "error",
                "data": {},
                "notifications": [],
                "error": f"Fetch output is not valid JSON: {e}",
            }

    except asyncio.TimeoutError:
        proc.kill()  # type: ignore
        return {
            "status": "error",
            "data": {},
            "notifications": [],
            "error": f"Fetch timed out after {timeout}s",
        }

    except Exception as e:
        return {
            "status": "error",
            "data": {},
            "notifications": [],
            "error": f"Execution error: {e}",
        }
