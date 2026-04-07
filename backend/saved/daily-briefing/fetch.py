import json
import httpx
import anthropic
from os import environ
from datetime import datetime, timezone


def fetch():
    config = json.loads(environ.get("FWUBBO_CONFIG", "{}"))
    state = json.loads(environ.get("FWUBBO_STATE", "{}"))
    api_key = environ.get("ANTHROPIC_API_KEY", "")

    vault_path = config.get("vault_path", "").strip()
    calendar_days = max(1, min(int(config.get("calendar_days", 3)), 14))
    notes_days = max(1, min(int(config.get("notes_days", 7)), 30))

    now = datetime.now(timezone.utc)

    # Return cached briefing if it's less than 2 hours old
    last_gen = state.get("last_generated", "")
    cached_briefing = state.get("briefing", "")
    if last_gen and cached_briefing:
        try:
            last_dt = datetime.fromisoformat(last_gen)
            if last_dt.tzinfo is None:
                last_dt = last_dt.replace(tzinfo=timezone.utc)
            if (now - last_dt).total_seconds() < 7200:
                return {
                    "status": "ok",
                    "data": {
                        "briefing": cached_briefing,
                        "generated_at": last_gen,
                        "from_cache": True,
                    },
                    "notifications": [],
                }
        except Exception:
            pass

    if not api_key:
        if cached_briefing:
            return {
                "status": "ok",
                "data": {
                    "briefing": cached_briefing,
                    "generated_at": last_gen,
                    "from_cache": True,
                    "warning": "ANTHROPIC_API_KEY not set — showing cached briefing",
                },
                "notifications": [],
            }
        return {
            "status": "error",
            "data": {},
            "error": "ANTHROPIC_API_KEY not configured in backend/.env",
        }

    # Fetch calendar events from local endpoint
    calendar_text = ""
    try:
        resp = httpx.get(
            "http://localhost:9120/api/local/calendar",
            params={"days": calendar_days},
            timeout=15.0,
        )
        events = resp.json().get("events", [])
        if events:
            calendar_text = f"Upcoming calendar events (next {calendar_days} days):\n"
            for ev in events:
                calendar_text += f"- [{ev['calendar']}] {ev['title']} — {ev['start']}\n"
        else:
            calendar_text = f"No calendar events in the next {calendar_days} days."
    except Exception as e:
        calendar_text = f"(Calendar unavailable: {e})"

    # Fetch Obsidian notes from local endpoint
    obsidian_text = ""
    if vault_path:
        try:
            resp = httpx.get(
                "http://localhost:9120/api/local/obsidian",
                params={"vault_path": vault_path, "days": notes_days},
                timeout=15.0,
            )
            notes = resp.json().get("notes", [])
            if notes:
                obsidian_text = f"Recently modified notes (last {notes_days} days):\n\n"
                for note in notes:
                    obsidian_text += f"### {note['name']} (modified {note['modified'][:10]})\n{note['content']}\n\n"
            else:
                obsidian_text = f"No notes modified in the last {notes_days} days."
        except Exception as e:
            obsidian_text = f"(Obsidian unavailable: {e})"
    else:
        obsidian_text = "(No vault path set — configure vault_path in widget settings)"

    today_str = now.strftime("%A, %B %-d, %Y at %-I:%M %p UTC")
    prompt = f"""Today is {today_str}. Generate a concise daily briefing in markdown.

{calendar_text}

{obsidian_text}

Write a clear, useful briefing with only the sections that have relevant content:
## Today's Schedule
(upcoming events with times)

## Active Projects
(what I'm working on based on recent notes)

## Key Reminders
(important items, deadlines, or follow-ups)

## Today's Focus
(one suggested priority based on schedule and notes)

Be concise and actionable. Use bullet points. No preamble or meta-commentary."""

    try:
        client = anthropic.Anthropic(api_key=api_key)
        message = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=1000,
            messages=[{"role": "user", "content": prompt}],
        )
        briefing = message.content[0].text

        return {
            "status": "ok",
            "data": {
                "briefing": briefing,
                "generated_at": now.isoformat(),
                "from_cache": False,
            },
            "notifications": [
                {"title": "Daily Briefing", "body": "Your AI briefing has been updated"}
            ],
            "state": {
                "last_generated": now.isoformat(),
                "briefing": briefing,
            },
        }
    except Exception as e:
        if cached_briefing:
            return {
                "status": "ok",
                "data": {
                    "briefing": cached_briefing,
                    "generated_at": last_gen,
                    "from_cache": True,
                    "warning": f"Generation failed, showing cached: {str(e)[:120]}",
                },
                "notifications": [],
            }
        return {
            "status": "error",
            "data": {},
            "error": f"Failed to generate briefing: {e}",
        }


print(json.dumps(fetch()))
