import json
import re
import anthropic
from os import environ
from datetime import datetime, timedelta, timezone


def days_until(deadline_str: str, now: datetime) -> int | None:
    """Parse a YYYY-MM-DD deadline string and return days remaining from now."""
    try:
        dl = datetime.strptime(deadline_str, "%Y-%m-%d").replace(tzinfo=timezone.utc)
        return (dl - now).days
    except Exception:
        return None


def filter_and_enrich(deadlines: list, now: datetime, max_days: int) -> list:
    """Filter to upcoming deadlines and add days_left field."""
    result = []
    for d in deadlines:
        days_left = days_until(d.get("deadline", ""), now)
        if days_left is None:
            continue
        if days_left < 0 or days_left > max_days:
            continue
        result.append({**d, "days_left": days_left})
    return sorted(result, key=lambda x: x["days_left"])


def run_llm_search(api_key: str, topics: str, types: str, max_days: int, now: datetime) -> list:
    """Call Claude with web search to find upcoming deadlines."""
    client = anthropic.Anthropic(api_key=api_key)
    today_str = now.strftime("%Y-%m-%d")
    cutoff_str = (now + timedelta(days=max_days)).strftime("%Y-%m-%d")

    prompt = f"""Today is {today_str}. Search the web for upcoming deadlines related to: {topics}

Types to find: {types}

Find SPECIFIC, REAL opportunities with registration/submission/application deadlines between {today_str} and {cutoff_str}. Include:
- Hackathons (MLH events, Devpost competitions, university hackathons)
- Academic conferences (NeurIPS, ICML, CVPR, ICLR, ACL, EMNLP, ICCV, ECCV, etc.)
- Fellowship and internship programs (NSF, Google, Microsoft, Meta, etc.)
- Coding competitions (ICPC, Google Code Jam, Meta Hacker Cup, Codeforces, etc.)
- Research grants and programs
- Open source bounties and challenges

IMPORTANT: Only include items where you found a specific deadline date. Do not guess or estimate dates.

Return ONLY a valid JSON array with no other text, markdown, or explanation. Each object must have exactly these keys:
[{{"name": "string", "type": "hackathon|conference|fellowship|competition|program|grant", "deadline": "YYYY-MM-DD", "url": "https://...", "description": "1-2 sentence summary"}}]

If you cannot find any items, return an empty array: []"""

    response = client.messages.create(
        model="claude-opus-4-5-20251101",
        max_tokens=4096,
        tools=[{"type": "web_search_20250305", "name": "web_search", "max_uses": 6}],
        messages=[{"role": "user", "content": prompt}],
    )

    # Extract text from response content blocks
    result_text = ""
    for block in response.content:
        if hasattr(block, "text"):
            result_text += block.text

    # Parse JSON array from response (may be wrapped in prose)
    json_match = re.search(r'\[\s*\{[\s\S]*?\}\s*\]|\[\s*\]', result_text)
    if not json_match:
        raise ValueError(f"No JSON array found in LLM response. Got: {result_text[:300]}")

    return json.loads(json_match.group())


def fetch():
    config = json.loads(environ.get("FWUBBO_CONFIG", "{}"))
    state = json.loads(environ.get("FWUBBO_STATE", "{}"))
    api_key = environ.get("ANTHROPIC_API_KEY", "")

    topics = config.get("topics", "software engineering hackathons, computer science conferences, coding competitions, CS research fellowships").strip()
    types = config.get("types", "hackathon,conference,fellowship,competition,program,grant").strip()
    max_days = max(1, int(config.get("max_days_ahead", 90)))
    refresh_hours = max(1, int(config.get("refresh_hours", 24)))

    now = datetime.now(timezone.utc)

    # Check cache freshness
    last_search_str = state.get("last_search", "")
    cached_deadlines = state.get("deadlines", [])
    cache_valid = False

    if last_search_str and cached_deadlines:
        try:
            last_dt = datetime.fromisoformat(last_search_str)
            if last_dt.tzinfo is None:
                last_dt = last_dt.replace(tzinfo=timezone.utc)
            elapsed_hours = (now - last_dt).total_seconds() / 3600
            cache_valid = elapsed_hours < refresh_hours
        except Exception:
            pass

    if cache_valid:
        # Serve from cache — fast path, no API call
        upcoming = filter_and_enrich(cached_deadlines, now, max_days)
        return {
            "status": "ok",
            "data": {
                "deadlines": upcoming,
                "total": len(upcoming),
                "last_search": last_search_str,
                "from_cache": True,
                "topics": topics,
            },
            "notifications": [],
        }

    # Cache stale — run LLM web search
    if not api_key:
        if cached_deadlines:
            # Serve stale cache rather than hard error
            upcoming = filter_and_enrich(cached_deadlines, now, max_days)
            return {
                "status": "ok",
                "data": {
                    "deadlines": upcoming,
                    "total": len(upcoming),
                    "last_search": last_search_str,
                    "from_cache": True,
                    "topics": topics,
                    "warning": "ANTHROPIC_API_KEY not set — showing cached results",
                },
                "notifications": [],
            }
        return {
            "status": "error",
            "data": {"deadlines": [], "total": 0, "topics": topics},
            "notifications": [],
            "error_message": "ANTHROPIC_API_KEY not configured. Set it in the Fwubbo backend .env file.",
        }

    try:
        raw_deadlines = run_llm_search(api_key, topics, types, max_days, now)
        new_state = {
            "last_search": now.isoformat(),
            "deadlines": raw_deadlines,
            "topics": topics,
        }
        upcoming = filter_and_enrich(raw_deadlines, now, max_days)

        # Build notifications for deadlines within 7 days
        urgent = [d for d in upcoming if d["days_left"] <= 7]
        notifications = []
        for d in urgent[:3]:
            days_label = "today" if d["days_left"] == 0 else f"in {d['days_left']} day{'s' if d['days_left'] != 1 else ''}"
            notifications.append({
                "title": f"Deadline {days_label}: {d['name']}",
                "body": d.get("description", "")[:100],
            })

        return {
            "status": "ok",
            "data": {
                "deadlines": upcoming,
                "total": len(upcoming),
                "last_search": now.isoformat(),
                "from_cache": False,
                "topics": topics,
            },
            "notifications": notifications,
            "state": new_state,
        }

    except Exception as e:
        if cached_deadlines:
            upcoming = filter_and_enrich(cached_deadlines, now, max_days)
            return {
                "status": "ok",
                "data": {
                    "deadlines": upcoming,
                    "total": len(upcoming),
                    "last_search": last_search_str,
                    "from_cache": True,
                    "topics": topics,
                    "warning": f"Search failed, showing cached: {str(e)[:80]}",
                },
                "notifications": [],
            }
        return {
            "status": "error",
            "data": {"deadlines": [], "total": 0, "topics": topics},
            "notifications": [],
            "error_message": f"LLM search failed: {str(e)}",
        }


print(json.dumps(fetch()))
