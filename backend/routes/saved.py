"""Saved widgets library — store widgets for later reuse.

Widgets are saved as copies in backend/saved/<module-id>/ with the same
file structure as modules (manifest.json, fetch.py, widget.tsx, config.json).
Users can add saved widgets back to the dashboard, duplicate them, or delete them.
"""

import json
import logging
import shutil
import re
from pathlib import Path

from fastapi import APIRouter, Request, HTTPException
from pydantic import BaseModel

router = APIRouter()
logger = logging.getLogger("fwubbo.saved")

SAVED_DIR = Path(__file__).parent.parent / "saved"

_ID_RE = re.compile(r'^[a-z0-9][a-z0-9\-]*[a-z0-9]$')


def _validate_id(value: str, label: str = "ID"):
    if not _ID_RE.match(value):
        raise HTTPException(400, f"Invalid {label}: '{value}'")
MODULES_DIR = Path(__file__).parent.parent / "modules"


def _ensure_saved_dir():
    SAVED_DIR.mkdir(parents=True, exist_ok=True)


class SaveWidgetRequest(BaseModel):
    module_id: str


class AddWidgetRequest(BaseModel):
    saved_id: str


class DuplicateWidgetRequest(BaseModel):
    saved_id: str


class RenameWidgetRequest(BaseModel):
    saved_id: str
    new_name: str


@router.get("/")
async def list_saved():
    """List all saved widgets with their manifests."""
    _ensure_saved_dir()
    saved = []
    for d in sorted(SAVED_DIR.iterdir()):
        if not d.is_dir():
            continue
        manifest_path = d / "manifest.json"
        if not manifest_path.exists():
            continue
        try:
            manifest = json.loads(manifest_path.read_text())
            saved.append(manifest)
        except Exception as e:
            logger.warning(f"Failed to read saved widget {d.name}: {e}")
    return {"saved": saved}


@router.post("/save")
async def save_widget(req: SaveWidgetRequest, request: Request):
    """Save a widget from the active modules to the saved library."""
    _validate_id(req.module_id, "module_id")
    _ensure_saved_dir()
    registry = request.state.registry

    module_dir = MODULES_DIR / req.module_id
    if not module_dir.is_dir():
        raise HTTPException(404, f"Module '{req.module_id}' not found")

    dest = SAVED_DIR / req.module_id
    if dest.exists():
        # Already saved — overwrite with latest
        shutil.rmtree(dest)

    shutil.copytree(module_dir, dest)
    logger.info(f"Saved widget: {req.module_id}")

    manifest = json.loads((dest / "manifest.json").read_text())
    return {"status": "ok", "module_id": req.module_id, "manifest": manifest}


@router.post("/add")
async def add_saved_to_dashboard(req: AddWidgetRequest, request: Request):
    """Copy a saved widget back to the active modules directory."""
    _validate_id(req.saved_id, "saved_id")
    _ensure_saved_dir()
    registry = request.state.registry

    saved_dir = SAVED_DIR / req.saved_id
    if not saved_dir.is_dir():
        raise HTTPException(404, f"Saved widget '{req.saved_id}' not found")

    dest = MODULES_DIR / req.saved_id
    if dest.exists():
        # Module already exists on dashboard — overwrite with saved copy
        shutil.rmtree(dest)

    shutil.copytree(saved_dir, dest)

    # Refresh registry so the module is discoverable
    await registry.discover_modules()
    logger.info(f"Added saved widget to dashboard: {req.saved_id}")

    manifest = json.loads((dest / "manifest.json").read_text())
    return {"status": "ok", "module_id": req.saved_id, "manifest": manifest}


@router.post("/duplicate")
async def duplicate_saved(req: DuplicateWidgetRequest, request: Request):
    """Duplicate a saved widget with a new unique ID."""
    _validate_id(req.saved_id, "saved_id")
    _ensure_saved_dir()

    saved_dir = SAVED_DIR / req.saved_id
    if not saved_dir.is_dir():
        raise HTTPException(404, f"Saved widget '{req.saved_id}' not found")

    # Generate a unique ID by appending -copy, -copy-2, etc.
    base_id = re.sub(r'-copy(-\d+)?$', '', req.saved_id)
    new_id = f"{base_id}-copy"
    counter = 2
    while (SAVED_DIR / new_id).exists():
        new_id = f"{base_id}-copy-{counter}"
        counter += 1

    dest = SAVED_DIR / new_id
    shutil.copytree(saved_dir, dest)

    # Update the manifest with the new ID and name
    manifest_path = dest / "manifest.json"
    manifest = json.loads(manifest_path.read_text())
    manifest["id"] = new_id
    manifest["name"] = manifest.get("name", new_id) + " (Copy)"
    manifest_path.write_text(json.dumps(manifest, indent=2))

    logger.info(f"Duplicated saved widget: {req.saved_id} -> {new_id}")
    return {"status": "ok", "saved_id": new_id, "manifest": manifest}


@router.post("/rename")
async def rename_saved(req: RenameWidgetRequest):
    """Rename a saved widget."""
    _validate_id(req.saved_id, "saved_id")
    _ensure_saved_dir()

    saved_dir = SAVED_DIR / req.saved_id
    if not saved_dir.is_dir():
        raise HTTPException(404, f"Saved widget '{req.saved_id}' not found")

    new_name = req.new_name.strip()
    if not new_name:
        raise HTTPException(400, "Name cannot be empty")

    manifest_path = saved_dir / "manifest.json"
    manifest = json.loads(manifest_path.read_text())
    manifest["name"] = new_name
    manifest_path.write_text(json.dumps(manifest, indent=2))

    logger.info(f"Renamed saved widget {req.saved_id} to '{new_name}'")
    return {"status": "ok", "saved_id": req.saved_id, "manifest": manifest}


@router.delete("/{saved_id}")
async def delete_saved(saved_id: str):
    """Permanently delete a saved widget."""
    _validate_id(saved_id, "saved_id")
    _ensure_saved_dir()

    saved_dir = SAVED_DIR / saved_id
    if not saved_dir.is_dir():
        raise HTTPException(404, f"Saved widget '{saved_id}' not found")

    shutil.rmtree(saved_dir)
    logger.info(f"Deleted saved widget: {saved_id}")
    return {"status": "ok", "saved_id": saved_id}
