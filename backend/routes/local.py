"""Local system data routes — Apple Calendar and Obsidian vault access.

These run in the main FastAPI process (not sandboxed), so they can access
the filesystem and run osascript. Modules call these via httpx on localhost.
"""

import subprocess
from pathlib import Path
from datetime import datetime
from fastapi import APIRouter, Query

router = APIRouter()


@router.get("/calendar")
async def get_calendar(days: int = Query(default=3, ge=1, le=14)):
    """Return upcoming Apple Calendar events via osascript."""
    script = f"""
tell application "Calendar"
    set output to ""
    set startDate to current date
    set endDate to startDate + ({days} * days)
    repeat with aCal in calendars
        try
            set calEvents to every event of aCal whose start date >= startDate and start date <= endDate
            repeat with anEvent in calEvents
                set output to output & (name of aCal) & "|||" & (summary of anEvent) & "|||" & ((start date of anEvent) as string) & linefeed
            end repeat
        end try
    end repeat
end tell
return output
"""
    try:
        result = subprocess.run(
            ["osascript", "-e", script],
            capture_output=True, text=True, timeout=15,
        )
        events = []
        for line in result.stdout.strip().splitlines():
            parts = line.split("|||")
            if len(parts) >= 3:
                events.append({
                    "calendar": parts[0].strip(),
                    "title": parts[1].strip(),
                    "start": parts[2].strip(),
                })
        return {"status": "ok", "events": events}
    except subprocess.TimeoutExpired:
        return {"status": "error", "error": "Calendar query timed out", "events": []}
    except Exception as e:
        return {"status": "error", "error": str(e), "events": []}


@router.get("/obsidian")
async def get_obsidian(
    vault_path: str = Query(...),
    days: int = Query(default=7, ge=1, le=30),
    max_notes: int = Query(default=20, ge=1, le=50),
    max_chars_per_note: int = Query(default=2000, ge=200, le=5000),
):
    """Return recently modified notes from an Obsidian vault."""
    try:
        vault = Path(vault_path).expanduser().resolve()
        if not vault.exists() or not vault.is_dir():
            return {"status": "error", "error": f"Vault not found: {vault_path}", "notes": []}

        cutoff = datetime.now().timestamp() - (days * 86400)
        notes = []
        for md_file in vault.rglob("*.md"):
            try:
                if md_file.stat().st_mtime >= cutoff:
                    content = md_file.read_text(encoding="utf-8", errors="ignore")
                    notes.append({
                        "name": md_file.stem,
                        "path": str(md_file.relative_to(vault)),
                        "content": content[:max_chars_per_note],
                        "modified": datetime.fromtimestamp(md_file.stat().st_mtime).isoformat(),
                    })
            except Exception:
                pass

        notes.sort(key=lambda n: n["modified"], reverse=True)
        return {"status": "ok", "notes": notes[:max_notes]}
    except Exception as e:
        return {"status": "error", "error": str(e), "notes": []}
