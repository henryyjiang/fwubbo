"""Global API key management.

Keys are stored in backend/.env as FWUBBO_SECRET_<NAME>=<value>.
The frontend only ever sees key names, never values.
Keys are also loaded into os.environ so modules can access them.
"""

import os
import re
import logging
from pathlib import Path

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter()
logger = logging.getLogger("fwubbo.secrets")

ENV_FILE = Path(__file__).parent.parent / ".env"
SECRET_PREFIX = "FWUBBO_SECRET_"


def _read_env_file() -> list[tuple[str, str]]:
    """Read all key=value pairs from .env, preserving order."""
    pairs = []
    if not ENV_FILE.exists():
        return pairs
    for line in ENV_FILE.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            pairs.append(("__comment__", line))
            continue
        if "=" in line:
            key, _, value = line.partition("=")
            pairs.append((key.strip(), value.strip()))
    return pairs


def _write_env_file(pairs: list[tuple[str, str]]):
    """Write key=value pairs back to .env."""
    lines = []
    for key, value in pairs:
        if key == "__comment__":
            lines.append(value)
        else:
            lines.append(f"{key}={value}")
    ENV_FILE.write_text("\n".join(lines) + "\n")


def _get_secret_names() -> list[dict[str, str]]:
    """Get all FWUBBO_SECRET_* key names (not values) from .env and environ."""
    names = set()

    # From .env file
    for key, _ in _read_env_file():
        if key.startswith(SECRET_PREFIX) and key != "__comment__":
            names.add(key)

    # From environ (may have been set at runtime)
    for key in os.environ:
        if key.startswith(SECRET_PREFIX):
            names.add(key)

    result = []
    for key in sorted(names):
        # Strip prefix to get friendly name
        friendly = key[len(SECRET_PREFIX):]
        # Check if it has a value
        has_value = bool(os.environ.get(key, ""))
        result.append({"env_key": key, "name": friendly, "has_value": has_value})

    return result


class AddKeyRequest(BaseModel):
    name: str  # e.g. "OPENWEATHERMAP_KEY" — will be stored as FWUBBO_SECRET_OPENWEATHERMAP_KEY
    value: str


class UpdateKeyRequest(BaseModel):
    value: str


# ── Claude / Anthropic API key (stored as ANTHROPIC_API_KEY, no prefix) ──────
# IMPORTANT: these specific routes must be registered BEFORE the /{name}
# wildcard routes below, or FastAPI will match the wildcard first.

ANTHROPIC_KEY = "ANTHROPIC_API_KEY"


@router.get("/claude-key")
async def get_claude_key_status():
    """Check whether ANTHROPIC_API_KEY is set (never returns the value)."""
    has_key = bool(os.environ.get(ANTHROPIC_KEY, ""))
    if not has_key:
        for k, v in _read_env_file():
            if k == ANTHROPIC_KEY and v:
                has_key = True
                break
    return {"has_key": has_key}


class SetClaudeKeyRequest(BaseModel):
    value: str


@router.put("/claude-key")
async def set_claude_key(req: SetClaudeKeyRequest):
    """Store ANTHROPIC_API_KEY in .env and load it into the running process."""
    if not req.value.strip():
        raise HTTPException(400, "API key value cannot be empty")

    os.environ[ANTHROPIC_KEY] = req.value.strip()

    pairs = _read_env_file()
    found = False
    for i, (k, v) in enumerate(pairs):
        if k == ANTHROPIC_KEY:
            pairs[i] = (ANTHROPIC_KEY, req.value.strip())
            found = True
            break
    if not found:
        pairs.append((ANTHROPIC_KEY, req.value.strip()))

    _write_env_file(pairs)
    logger.info("Stored Anthropic API key")
    return {"status": "ok"}


@router.delete("/claude-key")
async def delete_claude_key():
    """Remove ANTHROPIC_API_KEY from .env and the running process."""
    os.environ.pop(ANTHROPIC_KEY, None)
    pairs = _read_env_file()
    pairs = [(k, v) for k, v in pairs if k != ANTHROPIC_KEY]
    _write_env_file(pairs)
    logger.info("Deleted Anthropic API key")
    return {"status": "ok"}


# ── General FWUBBO_SECRET_* keys ──────────────────────────────────────────────

@router.get("/")
async def list_secrets():
    """List all global API key names (never values)."""
    return {"secrets": _get_secret_names()}


@router.post("/")
async def add_secret(req: AddKeyRequest):
    """Add or update a global API key."""
    clean_name = re.sub(r'[^A-Z0-9_]', '_', req.name.upper())
    if not clean_name:
        raise HTTPException(400, "Invalid key name")

    env_key = f"{SECRET_PREFIX}{clean_name}"

    os.environ[env_key] = req.value

    pairs = _read_env_file()
    found = False
    for i, (k, v) in enumerate(pairs):
        if k == env_key:
            pairs[i] = (env_key, req.value)
            found = True
            break
    if not found:
        pairs.append((env_key, req.value))

    _write_env_file(pairs)
    logger.info(f"Stored global API key: {env_key}")

    return {"status": "ok", "env_key": env_key, "name": clean_name}


@router.put("/{name}")
async def update_secret(name: str, req: UpdateKeyRequest):
    """Update an existing global API key value."""
    clean_name = re.sub(r'[^A-Z0-9_]', '_', name.upper())
    env_key = f"{SECRET_PREFIX}{clean_name}"

    os.environ[env_key] = req.value

    pairs = _read_env_file()
    found = False
    for i, (k, v) in enumerate(pairs):
        if k == env_key:
            pairs[i] = (env_key, req.value)
            found = True
            break
    if not found:
        pairs.append((env_key, req.value))

    _write_env_file(pairs)
    logger.info(f"Updated global API key: {env_key}")

    return {"status": "ok", "env_key": env_key, "name": clean_name}


@router.delete("/{name}")
async def delete_secret(name: str):
    """Remove a global API key."""
    clean_name = re.sub(r'[^A-Z0-9_]', '_', name.upper())
    env_key = f"{SECRET_PREFIX}{clean_name}"

    os.environ.pop(env_key, None)

    pairs = _read_env_file()
    pairs = [(k, v) for k, v in pairs if k != env_key]
    _write_env_file(pairs)

    logger.info(f"Deleted global API key: {env_key}")
    return {"status": "ok", "name": clean_name}
