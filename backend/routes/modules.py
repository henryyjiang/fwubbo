"""Module CRUD and execution endpoints."""

import json
import time
from pathlib import Path
from fastapi import APIRouter, Request, HTTPException

from core.sandbox import execute_fetch

MODULES_DIR = Path(__file__).parent.parent / "modules"

router = APIRouter()


@router.get("/")
async def list_modules(request: Request):
    """List all discovered modules and their manifests."""
    registry = request.state.registry
    return {"modules": registry.list_manifests()}


@router.get("/{module_id}")
async def get_module(module_id: str, request: Request):
    """Get a single module's manifest and status."""
    registry = request.state.registry
    mod = registry.get(module_id)
    if not mod:
        raise HTTPException(404, f"Module '{module_id}' not found")
    return mod.to_dict()


@router.post("/{module_id}/fetch")
async def fetch_module(module_id: str, request: Request):
    """Execute a module's fetch script in the sandbox and return results."""
    registry = request.state.registry
    stats_db = request.state.stats_db

    mod = registry.get(module_id)
    if not mod:
        raise HTTPException(404, f"Module '{module_id}' not found")

    # Resolve secrets from environment (dev mode fallback)
    # In production, these come from keytar via Tauri commands
    import os
    secrets: dict[str, str] = {}
    for key_name in mod.manifest.requires:
        env_key = f"FWUBBO_SECRET_{key_name.upper()}"
        val = os.environ.get(env_key, "")
        if val:
            secrets[key_name] = val
        else:
            # Also check without prefix (convenience for dev)
            val = os.environ.get(key_name.upper(), "")
            if val:
                secrets[key_name] = val

    start = time.monotonic()
    result = await execute_fetch(
        fetch_path=mod.fetch_path,
        secrets=secrets,
        allowed_domains=mod.manifest.permissions.network,
        allowed_extra_imports=mod.manifest.permissions.python_imports,
        timeout=mod.manifest.fetch_timeout,
    )
    elapsed_ms = (time.monotonic() - start) * 1000
    result["fetch_ms"] = round(elapsed_ms, 1)

    # Log to stats DB
    stats_db.log_fetch(
        module_id=module_id,
        status=result["status"],
        api_calls=mod.manifest.api_stats.calls_per_refresh,
        llm_tokens=mod.manifest.api_stats.llm_tokens_per_refresh,
        fetch_ms=elapsed_ms,
        error=result.get("error"),
    )

    return result


@router.get("/{module_id}/state")
async def get_module_state(module_id: str, request: Request):
    """Get persisted widget state (e.g. game saves)."""
    registry = request.state.registry
    if not registry.get(module_id):
        raise HTTPException(404, f"Module '{module_id}' not found")
    state_path = MODULES_DIR / module_id / "state.json"
    if not state_path.exists():
        return {}
    return json.loads(state_path.read_text())


@router.post("/{module_id}/state")
async def save_module_state(module_id: str, request: Request):
    """Persist arbitrary widget state to state.json in the module directory."""
    registry = request.state.registry
    if not registry.get(module_id):
        raise HTTPException(404, f"Module '{module_id}' not found")
    body = await request.json()
    state_path = MODULES_DIR / module_id / "state.json"
    state_path.write_text(json.dumps(body, indent=2))
    return {"status": "ok"}


@router.get("/{module_id}/stats")
async def module_stats(module_id: str, request: Request):
    """Get usage statistics for a module."""
    registry = request.state.registry
    stats_db = request.state.stats_db

    mod = registry.get(module_id)
    if not mod:
        raise HTTPException(404, f"Module '{module_id}' not found")

    stats = stats_db.get_stats(module_id)
    stats["declared_domains"] = mod.manifest.permissions.network
    stats["secret_names"] = mod.manifest.requires

    return stats
