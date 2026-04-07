import json
import re
import anthropic
from os import environ
from datetime import datetime, timedelta, timezone


def run_search(api_key, interests, source_types, max_results, now):
    client = anthropic.Anthropic(api_key=api_key)
    today_str = now.strftime("%Y-%m-%d")
    week_ago = (now - timedelta(days=7)).strftime("%Y-%m-%d")
    interests_str = ", ".join(interests)
    types_str = ", ".join(source_types)

    prompt = f"""Today is {today_str}. Search for the most trending and relevant content from the past 7 days (since {week_ago}) for someone interested in: {interests_str}

Content types to find: {types_str}

Cast a wide net across these sources based on the requested types:
- "paper": ArXiv (cs.AI, cs.LG, cs.CL, cs.CV, stat.ML), Papers With Code, Semantic Scholar
- "news": TechCrunch, The Verge, Wired, Ars Technica, VentureBeat, MIT Technology Review, Bloomberg Tech
- "blog": OpenAI blog, Anthropic blog, Google DeepMind blog, Meta AI blog, Mistral blog, Hugging Face blog, personal researcher blogs
- "tool": GitHub trending, Product Hunt, new open-source model/library releases
- "discussion": Hacker News (news.ycombinator.com), Reddit r/MachineLearning r/LocalLLaMA r/artificial r/technology

Prioritize by: (1) direct relevance to stated interests, (2) recency (last 3 days beats last 7), (3) community engagement/impact.

Return ONLY a valid JSON array — no prose, no markdown fences, nothing else before or after the array:
[{{"title": "string", "url": "https://...", "type": "paper|news|blog|tool|discussion", "date": "YYYY-MM-DD", "source": "short source name e.g. arxiv/openai/hackernews/reddit/techcrunch", "summary": "2-3 sentences explaining what this is and why it matters", "relevance": "one sentence: why this matches the user's interests"}}]

Return up to {max_results} items, sorted by relevance + recency. Omit items older than 7 days or with no clear relevance."""

    response = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=5000,
        tools=[{"type": "web_search_20250305", "name": "web_search", "max_uses": 8}],
        messages=[{"role": "user", "content": prompt}],
    )

    result_text = ""
    for block in response.content:
        if hasattr(block, "text"):
            result_text += block.text

    # Extract first JSON array from the response
    json_match = re.search(r'\[\s*(?:\{[\s\S]*?\}\s*,?\s*)*\]', result_text)
    if not json_match:
        raise ValueError(f"No JSON array found in response: {result_text[:400]}")

    items = json.loads(json_match.group())

    # Add a numeric rank field for the widget to display
    for i, item in enumerate(items):
        item["rank"] = i + 1

    return items


def fetch():
    config = json.loads(environ.get("FWUBBO_CONFIG", "{}"))
    state = json.loads(environ.get("FWUBBO_STATE", "{}"))
    fwubbo_settings = json.loads(environ.get("FWUBBO_SETTINGS", "{}"))
    api_key = environ.get("ANTHROPIC_API_KEY", "")

    # Merge interests: Fwubbo profile interests + widget extra interests
    profile_interests = fwubbo_settings.get("profile", {}).get("interests", [])
    extra_str = config.get("extra_interests", "").strip()
    extra_interests = [i.strip() for i in extra_str.split(",") if i.strip()]
    # Deduplicate while preserving order
    seen = set()
    all_interests = []
    for i in (profile_interests + extra_interests):
        key = i.lower()
        if key not in seen:
            seen.add(key)
            all_interests.append(i)

    if not all_interests:
        all_interests = ["machine learning", "artificial intelligence", "large language models"]

    source_types_str = config.get("source_types", "paper,news,blog,tool,discussion")
    source_types = [s.strip() for s in source_types_str.split(",") if s.strip()] or ["paper", "news", "blog"]
    max_results = max(3, min(int(config.get("max_results", 12)), 20))
    refresh_hours = max(1, int(config.get("refresh_hours", 6)))

    now = datetime.now(timezone.utc)

    # Check cache freshness
    last_search_str = state.get("last_search", "")
    cached_items = state.get("items", [])
    cache_valid = False

    if last_search_str and cached_items:
        try:
            last_dt = datetime.fromisoformat(last_search_str)
            if last_dt.tzinfo is None:
                last_dt = last_dt.replace(tzinfo=timezone.utc)
            cache_valid = (now - last_dt).total_seconds() / 3600 < refresh_hours
        except Exception:
            pass

    if cache_valid:
        return {
            "status": "ok",
            "data": {
                "items": cached_items,
                "total": len(cached_items),
                "interests": all_interests,
                "last_search": last_search_str,
                "from_cache": True,
            },
            "notifications": [],
        }

    if not api_key:
        if cached_items:
            return {
                "status": "ok",
                "data": {
                    "items": cached_items,
                    "total": len(cached_items),
                    "interests": all_interests,
                    "last_search": last_search_str,
                    "from_cache": True,
                    "warning": "ANTHROPIC_API_KEY not set — showing cached results",
                },
                "notifications": [],
            }
        return {
            "status": "error",
            "data": {"items": [], "total": 0, "interests": all_interests},
            "notifications": [],
            "error_message": "ANTHROPIC_API_KEY not configured. Set it in backend/.env.",
        }

    try:
        items = run_search(api_key, all_interests, source_types, max_results, now)
        new_state = {
            "last_search": now.isoformat(),
            "items": items,
            "interests": all_interests,
        }
        return {
            "status": "ok",
            "data": {
                "items": items,
                "total": len(items),
                "interests": all_interests,
                "last_search": now.isoformat(),
                "from_cache": False,
            },
            "notifications": [],
            "state": new_state,
        }

    except Exception as e:
        if cached_items:
            return {
                "status": "ok",
                "data": {
                    "items": cached_items,
                    "total": len(cached_items),
                    "interests": all_interests,
                    "last_search": last_search_str,
                    "from_cache": True,
                    "warning": f"Search failed, showing cached: {str(e)[:100]}",
                },
                "notifications": [],
            }
        return {
            "status": "error",
            "data": {"items": [], "total": 0, "interests": all_interests},
            "notifications": [],
            "error_message": f"Search failed: {str(e)}",
        }


print(json.dumps(fetch()))
