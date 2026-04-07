"""App-wide settings management.

Settings are stored in backend/data/settings.json.
Covers: notifications, startup behavior, user profile.
"""

import json
import logging
from pathlib import Path

from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter()
logger = logging.getLogger("fwubbo.settings")

SETTINGS_FILE = Path(__file__).parent.parent / "data" / "settings.json"

DEFAULT_SETTINGS = {
    "notifications": {
        "enabled": True,
        "when_minimized": True,
        "sound": False,
    },
    "profile": {
        "name": "",
        "location": "Atlanta",
        "timezone": "",
        "interests": [],
    },
}


def _read_settings() -> dict:
    """Read settings from disk, merging with defaults."""
    SETTINGS_FILE.parent.mkdir(parents=True, exist_ok=True)
    if SETTINGS_FILE.exists():
        try:
            saved = json.loads(SETTINGS_FILE.read_text())
            # Deep merge with defaults so new keys get defaults
            merged = {}
            for section, defaults in DEFAULT_SETTINGS.items():
                if isinstance(defaults, dict):
                    merged[section] = {**defaults, **saved.get(section, {})}
                else:
                    merged[section] = saved.get(section, defaults)
            return merged
        except Exception:
            return DEFAULT_SETTINGS.copy()
    return DEFAULT_SETTINGS.copy()


def _write_settings(settings: dict):
    """Write settings to disk."""
    SETTINGS_FILE.parent.mkdir(parents=True, exist_ok=True)
    SETTINGS_FILE.write_text(json.dumps(settings, indent=2))


class UpdateSettingsRequest(BaseModel):
    settings: dict


@router.get("/")
async def get_settings():
    """Get all app settings."""
    return {"settings": _read_settings()}


@router.put("/")
async def update_settings(req: UpdateSettingsRequest):
    """Update app settings (partial merge)."""
    current = _read_settings()

    # Merge incoming with current (one level deep)
    for section, values in req.settings.items():
        if section in current and isinstance(current[section], dict) and isinstance(values, dict):
            current[section] = {**current[section], **values}
        else:
            current[section] = values

    _write_settings(current)
    logger.info("Settings updated")
    return {"status": "ok", "settings": current}


@router.post("/reset")
async def reset_settings():
    """Reset all settings to defaults."""
    _write_settings(DEFAULT_SETTINGS)
    logger.info("Settings reset to defaults")
    return {"status": "ok", "settings": DEFAULT_SETTINGS}
