"""Streaming chat endpoint for conversational module generation.

Replaces the single-shot generate endpoint with a streaming conversation:
- User describes a widget in natural language
- Claude streams responses via SSE
- Claude can ask clarifying questions
- User can iterate on generated widgets
- Final module is saved when Claude produces the JSON payload
- Sessions track which module they're editing for seamless iteration
"""

import json
import logging
import re
import subprocess
import sys
import os
from pathlib import Path
from typing import AsyncGenerator

from fastapi import APIRouter, Request, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from core.sandbox import validate_imports, validate_network_calls
from core.module_registry import ModuleManifest

router = APIRouter()
logger = logging.getLogger("fwubbo.chat")

MODULES_DIR = Path(__file__).parent.parent / "modules"

# ─── In-memory conversation store ────────────────────────────────
# In production this would be persisted, but for a local desktop app
# in-memory is fine. Keyed by session_id.
_conversations: dict[str, list[dict]] = {}

# ─── Session-to-module binding ────────────────────────────────────
# Tracks which module_id a chat session is currently associated with.
# Set when: a module is created during chat, or when "Edit with Fwubbo"
# opens the chat pre-bound to an existing module.
_session_modules: dict[str, str] = {}


def _get_global_api_key_names() -> list[str]:
    """Get names of all globally stored API keys (FWUBBO_SECRET_* env vars).
    
    Returns just the key names without the prefix, e.g. ["OPENWEATHERMAP_KEY", "NEWSAPI_KEY"].
    Excludes the ANTHROPIC_API_KEY (internal, not for modules).
    """
    prefix = "FWUBBO_SECRET_"
    names = []
    for key in sorted(os.environ.keys()):
        if key.startswith(prefix):
            name = key[len(prefix):]
            names.append(name)
    return names


# ─── System prompt for chat mode ────────────────────────────────

CHAT_SYSTEM_PROMPT = r"""You are Fwubbo, a friendly AI assistant that helps build dashboard widgets. You're conversational and helpful.

## YOUR ROLE
You help users create and iterate on dashboard widget modules. You can:
1. Generate a complete widget module from a description
2. Modify an existing widget's code when the user asks for changes
3. Help troubleshoot or explain how widgets work

CRITICAL RULE: When a [CURRENT MODULE SOURCE] block is present in the user's message, you already have the complete, current source code. NEVER ask the user to share, paste, or provide code. Just use what you have to answer questions, diagnose problems, or generate fixes.

## CONVERSATION FLOW — BE ACTION-ORIENTED
- For clear requests, just generate the widget immediately. Don't ask unnecessary questions.
- Make reasonable assumptions: location = Atlanta, units = imperial, common patterns.
- Only ask questions when truly ambiguous (e.g. which API to use, or critical design choices).
- If the widget needs an API key, generate it anyway and mention they'll need to add the key in Settings (right-click → Settings).
- After generating, offer to help iterate: "Want me to change anything?"

## GLOBAL API KEYS
The user may have global API keys already stored in Fwubbo. When a [AVAILABLE GLOBAL API KEYS] block is present in the user's message, it lists the key names already available system-wide. If a widget needs an API key:
1. Check if a matching global key already exists (e.g. OPENWEATHERMAP_KEY, NEWSAPI_KEY).
2. If a matching key exists, tell the user you'll use their existing global key. In fetch.py, reference it with `environ.get("FWUBBO_SECRET_<KEYNAME>")`. Do NOT add a password-type setting for it — it's already available globally.
3. If no matching key exists, ask the user: "I didn't find a global API key for this service. Would you like me to: (a) have you add it as a global key in Settings so all widgets can use it, or (b) add a per-widget API key field in this widget's settings?" Default to option (a) for common API keys.
4. If the user wants a per-widget key, add a "password" type setting in the manifest as usual.
5. You can also support BOTH: use a global key as fallback, with an optional per-widget override. Example in fetch.py:
   ```
   config = json.loads(environ.get("FWUBBO_CONFIG", "{}"))
   api_key = config.get("api_key_override", "") or environ.get("FWUBBO_SECRET_SERVICENAME_KEY", "")
   ```

## EDITING AN EXISTING MODULE
When the user's message includes existing module source code (marked with [CURRENT MODULE SOURCE]):
- You HAVE the complete, current source code. NEVER ask the user to share or paste code — you already have it.
- **CRITICAL: The [CURRENT MODULE SOURCE] header contains the module id (e.g. "id: countdown-timer"). You MUST use this EXACT id in your <FWUBBO_MODULE> output manifest. NEVER change the id, NEVER use a different id, NEVER generate a new id. If the user asks for a "Christmas countdown" while editing a module with id "countdown-timer", the output MUST still use id "countdown-timer". The id identifies WHICH widget slot to update — changing it would overwrite a different widget.**
- For modification requests ("change the color", "add a chart", etc.): keep the SAME module "id" and output a full <FWUBBO_MODULE> block with the updated code.
- For troubleshooting ("it's crashing", "getting an error", "not working"): diagnose the issue using the source you have, explain what's wrong, and output a fixed <FWUBBO_MODULE> block.
- For questions about the widget: answer using the source code you can see.
- Apply only the changes needed. Don't rewrite everything from scratch unless asked.
- Always output the full updated <FWUBBO_MODULE> block — partial updates aren't supported.

## GENERATING A MODULE
When you're ready to generate (or update), output a special JSON block wrapped in <FWUBBO_MODULE> tags.
Everything between these tags must be valid JSON and nothing else.

<FWUBBO_MODULE>
{
  "manifest": { ... },
  "fetch_py": "...full python source...",
  "widget_tsx": "...full tsx source...",
  "pip_packages": []
}
</FWUBBO_MODULE>

IMPORTANT: Only output the <FWUBBO_MODULE> block when you're actually generating/updating.
Outside of that block, just chat normally with the user.

## MODULE SPEC

A module has THREE files:

### manifest.json
```json
{
  "id": "kebab-case-id",
  "name": "Human Readable Name",
  "description": "One sentence",
  "icon": "lucide-icon-name",
  "refresh_interval": 300,
  "requires": ["secret_key_name"],
  "permissions": {
    "network": ["api.example.com"],
    "python_imports": []
  },
  "settings": [
    {
      "key": "city",
      "type": "text",
      "label": "City",
      "default": "Atlanta, US",
      "description": "City for weather data"
    },
    {
      "key": "units",
      "type": "select",
      "label": "Units",
      "default": "imperial",
      "options": ["imperial", "metric"],
      "description": "Temperature units"
    }
  ],
  "api_stats": { "calls_per_refresh": 1, "llm_tokens_per_refresh": 0 },
  "notifications": { "supported": false, "default_enabled": false },
  "widget": { "min_w": 3, "min_h": 2, "default_w": 4, "default_h": 3, "resizable": true },
  "theme_hints": { "supports_transparency": true, "animation_density": "subtle" }
}
```

Rules:
- "id" must be unique kebab-case, 2+ chars
- "requires" lists secret key names. These become env vars: FWUBBO_SECRET_KEYNAME (uppercased)
- "permissions.network" lists every domain the fetch script contacts
- "permissions.python_imports" lists pip packages beyond: httpx, requests, pydantic, numpy, pandas, anthropic
- "settings" is an array of user-configurable fields. Types: "text", "number", "select", "toggle", "password"
  - "password" type is for API keys — values are masked in the UI
  - Settings are passed to fetch.py via FWUBBO_CONFIG env var (JSON string)
  - Always include a setting for any value the user might want to customize (city, units, thresholds, etc.)
  - IMPORTANT: widget.tsx does NOT have direct access to config/settings. It only receives `data` from fetch.py.
    For display-toggle settings (e.g. "show feels like", "show sunrise/sunset"), fetch.py MUST pass the
    toggle values through in its `data` output, and widget.tsx reads them from `data` to conditionally render.
    Example: `data["show_feels_like"] = config.get("show_feels_like", True)` in fetch.py,
    then `{data.show_feels_like && <span>...</span>}` in widget.tsx.

### fetch.py — Python data script (subprocess sandbox)
1. Print EXACTLY ONE JSON object to stdout
2. Return: {"status": "ok"|"error", "data": {...}, "notifications": [...]}
3. Secrets: `from os import environ` → `environ.get("FWUBBO_SECRET_KEYNAME")`
4. Settings: `json.loads(environ.get("FWUBBO_CONFIG", "{}"))` for user config
5. Use httpx with timeout for HTTP
6. Catch ALL exceptions — always return valid JSON
7. FORBIDDEN: import os, subprocess, socket, shutil, ctypes, threading, etc.
   Allowed stdlib additions beyond the basics: `xml` (use `xml.etree.ElementTree` for RSS/XML parsing)
8. **Anthropic SDK**: `environ.get("ANTHROPIC_API_KEY")` is automatically available — use the `anthropic` package for LLM-powered fetch scripts (web search, summarization, classification).
9. **State caching** (for expensive operations like LLM calls): Read previous state via `json.loads(environ.get("FWUBBO_STATE", "{}"))`. Return updated state as a `"state"` key in your output JSON — it's auto-saved to `state.json` and injected next refresh. Use this for hour/day-rate caching (e.g. check `state.get("last_search")` timestamp before making expensive calls). The `"state"` key is stripped before sending data to the widget.
10. **Global app settings** (FWUBBO_SETTINGS): `json.loads(environ.get("FWUBBO_SETTINGS", "{}"))` gives the user's Fwubbo profile: `settings["profile"]["name"]`, `settings["profile"]["location"]`, `settings["profile"]["timezone"]`, `settings["profile"]["interests"]` (list of strings). Use this to personalize widgets without duplicating settings — always fall back to widget-level config if profile values are empty.
11. **Wildcard network domains**: Use `*.example.com` in `permissions.network` to allow all subdomains (e.g. `*.myworkdayjobs.com` for multi-company Workday APIs).
12. **fetch_timeout**: Set `"fetch_timeout": 90` in the manifest for LLM-powered scripts that may take longer than 30s. Cached-state paths should still return instantly.

Example:
```python
import json
import httpx
from os import environ

def fetch():
    config = json.loads(environ.get("FWUBBO_CONFIG", "{}"))
    api_key = environ.get("FWUBBO_SECRET_OPENWEATHERMAP_KEY", "")
    city = config.get("city", "Atlanta, US")
    units = config.get("units", "imperial")
    if not api_key:
        return {"status": "error", "data": {}, "notifications": [], "error_message": "Missing API key — set it in widget settings (right-click → Settings)"}
    try:
        r = httpx.get(
            "https://api.openweathermap.org/data/2.5/weather",
            params={"q": city, "appid": api_key, "units": units},
            timeout=10.0,
        )
        r.raise_for_status()
        w = r.json()
        return {
            "status": "ok",
            "data": {"temp": w["main"]["temp"], "description": w["weather"][0]["description"], "city": w["name"]},
            "notifications": [],
        }
    except Exception as e:
        return {"status": "error", "data": {}, "notifications": [], "error_message": str(e)}

print(json.dumps(fetch()))
```

### widget.tsx — React component
1. `export default function Widget({ data, loading, error, lastUpdated }: WidgetProps)`
   **CRITICAL: The root element of every widget MUST have the `no-drag` class** (e.g. `<div className="no-drag h-full ...">`) so that react-grid-layout's drag handler does not consume click/pointer events inside the widget. Without this, buttons, inputs, and clickable elements will be silently broken.
2. Define WidgetProps at top: `interface WidgetProps { data: Record<string, any> | null; loading: boolean; error: string | null; lastUpdated: string | null; }`
3. Handle loading (animate-pulse skeleton), error, and data states
4. Color classes ONLY (never hardcoded): text-text-primary, text-text-secondary, text-text-muted, bg-surface-base, bg-surface-raised, bg-surface-overlay, text-accent-primary, border-border-subtle, text-status-ok, text-status-warn, text-status-error
5. Font classes: font-display, font-body, font-mono
6. Allowed imports: "react", "lucide-react", "recharts"
7. No title bar (WidgetCard provides it)

**FONT SIZING — USE VARIABLE SIZES, NOT UNIFORM:**
Widgets should use a visual hierarchy with DIFFERENT font sizes for different elements. All standard Tailwind text size classes are available:
- text-xs, text-sm, text-base, text-lg, text-xl, text-2xl, text-3xl, text-4xl, text-5xl, text-6xl, text-7xl, text-8xl, text-9xl
- Arbitrary sizes via brackets: text-[48px], text-[10px], text-[2.5rem], text-[clamp(1rem,5vw,3rem)]
- For countdown widgets or numeric displays: make the PRIMARY number LARGE (text-5xl to text-7xl) and labels/descriptions SMALL (text-xs to text-sm). Example: days remaining in text-6xl, "days" label in text-xs.
- NEVER make all text the same size. Create visual contrast: hero numbers big, supporting text small.

CRITICAL:
- fetch.py: use `from os import environ`, never `import os`
- fetch.py: print EXACTLY ONE json line
- widget.tsx: ALL colors use theme classes. ZERO hardcoded colors.
- widget.tsx: must have `export default function ...`
- Always include appropriate settings in the manifest for user-configurable values
- For widgets needing API keys, add a "password" type setting AND list the key in "requires"
"""


def _load_module_source(module_id: str) -> str | None:
    """Load a module's source files as a context string for Claude.
    
    Returns a formatted string with manifest.json, fetch.py, and widget.tsx
    contents, or None if the module doesn't exist.
    """
    module_dir = MODULES_DIR / module_id
    if not module_dir.is_dir():
        return None

    parts = [f"[CURRENT MODULE SOURCE — id: {module_id}]\n⚠️ MANDATORY: When outputting <FWUBBO_MODULE>, you MUST set manifest.id to \"{module_id}\". Do NOT use any other id.\nYou have the complete current source code for this module below. Use it to answer questions, diagnose issues, or make modifications. Do NOT ask the user to share code."]
    
    for filename in ("manifest.json", "fetch.py", "widget.tsx"):
        filepath = module_dir / filename
        if filepath.exists():
            content = filepath.read_text()
            parts.append(f"\n### {filename}\n```\n{content}\n```")
        else:
            parts.append(f"\n### {filename}\n(file not found)")

    # Also include config.json if it exists — useful for debugging settings issues
    config_path = module_dir / "config.json"
    if config_path.exists():
        try:
            config_content = config_path.read_text()
            parts.append(f"\n### config.json (current user settings)\n```\n{config_content}\n```")
        except OSError:
            pass

    parts.append("\n[END MODULE SOURCE]")
    parts.append("\nYou have the full source above. To fix issues or make changes, output a complete <FWUBBO_MODULE> block. Keep the same module id.")
    return "\n".join(parts)


class ChatMessage(BaseModel):
    role: str  # "user" or "assistant"
    content: str


class ChatRequest(BaseModel):
    session_id: str
    message: str
    # Optional: bind this session to a specific module for editing
    module_id: str | None = None


class ModuleConfig(BaseModel):
    """Per-module config values, stored in config.json."""
    values: dict[str, str | int | float | bool] = {}


def _extract_module_json(text: str) -> dict | None:
    """Extract module JSON from <FWUBBO_MODULE> tags in assistant response."""
    match = re.search(r'<FWUBBO_MODULE>\s*(.*?)\s*</FWUBBO_MODULE>', text, re.DOTALL)
    if not match:
        return None
    try:
        return json.loads(match.group(1))
    except json.JSONDecodeError:
        return None


def _validate_widget_tsx(source: str) -> list[str]:
    warnings = []
    if "export default" not in source:
        warnings.append("widget.tsx missing 'export default'")
    hex_colors = re.findall(r'["\']#[0-9a-fA-F]{3,8}["\']', source)
    if hex_colors:
        warnings.append(f"Hardcoded hex colors: {hex_colors[:3]}")
    return warnings


def _validate_fetch_py(source: str, manifest: dict) -> list[str]:
    warnings = []
    allowed_extra = manifest.get("permissions", {}).get("python_imports", [])
    warnings.extend(validate_imports(source, allowed_extra))
    allowed_domains = manifest.get("permissions", {}).get("network", [])
    warnings.extend(validate_network_calls(source, allowed_domains))
    print_count = len(re.findall(r'\bprint\s*\(', source))
    if print_count == 0:
        warnings.append("fetch.py has no print() call")
    elif print_count > 1:
        warnings.append(f"fetch.py has {print_count} print() calls (should be 1)")
    return warnings


def _install_pip_packages(packages: list[str]) -> tuple[bool, str]:
    if not packages:
        return True, ""
    try:
        result = subprocess.run(
            [sys.executable, "-m", "pip", "install", "--break-system-packages", *packages],
            capture_output=True, text=True, timeout=120,
        )
        if result.returncode != 0:
            return False, f"pip install failed: {result.stderr[:500]}"
        return True, ""
    except Exception as e:
        return False, str(e)


def _save_module(generated: dict, registry) -> dict:
    """Validate and save a generated module. Returns result dict.
    
    Handles both creation and update:
    - If the module directory already exists, this is an update — preserve config.json
    - If new, write default config from settings
    """
    for key in ("manifest", "fetch_py", "widget_tsx"):
        if key not in generated:
            return {"type": "error", "error": f"Missing '{key}' in generated output"}

    manifest_raw = generated["manifest"]
    try:
        manifest = ModuleManifest(**manifest_raw)
    except Exception as e:
        return {"type": "error", "error": f"Invalid manifest: {e}"}

    module_id = manifest.id
    if not module_id or not re.match(r'^[a-z0-9][a-z0-9\-]*[a-z0-9]$', module_id):
        return {"type": "error", "error": f"Invalid module id '{module_id}'"}

    warnings = []
    warnings.extend(_validate_fetch_py(generated["fetch_py"], manifest_raw))
    warnings.extend(_validate_widget_tsx(generated["widget_tsx"]))

    hard_fails = [w for w in warnings if "Forbidden import" in w]
    if hard_fails:
        return {"type": "error", "error": f"Sandbox violations: {hard_fails}"}

    # Install pip packages — only what's declared in the manifest.
    # pip_packages from Claude's output is informational only; the manifest
    # permissions.python_imports is the authoritative list. This prevents
    # LLM-hallucinated or typosquatted package names from being installed.
    declared_imports = manifest.permissions.python_imports
    undeclared = [p for p in generated.get("pip_packages", []) if p not in declared_imports]
    if undeclared:
        warnings.append(f"Ignored undeclared pip_packages (not in permissions.python_imports): {undeclared}")
    if declared_imports:
        ok, msg = _install_pip_packages(declared_imports)
        if not ok:
            warnings.append(f"Failed to install packages: {msg}")

    # Detect update vs create
    module_dir = MODULES_DIR / module_id
    is_update = module_dir.is_dir() and (module_dir / "manifest.json").exists()
    module_dir.mkdir(parents=True, exist_ok=True)

    # Write code files (always overwrite)
    (module_dir / "manifest.json").write_text(json.dumps(manifest_raw, indent=2))
    (module_dir / "fetch.py").write_text(generated["fetch_py"])
    (module_dir / "widget.tsx").write_text(generated["widget_tsx"])

    # Config handling: preserve existing config on update, write defaults on create
    settings = manifest_raw.get("settings", [])
    config_path = module_dir / "config.json"
    if is_update and config_path.exists():
        # Preserve existing user config, but add defaults for any new settings keys
        try:
            existing_config = json.loads(config_path.read_text())
        except (json.JSONDecodeError, OSError):
            existing_config = {}
        for s in settings:
            if s["key"] not in existing_config and "default" in s:
                existing_config[s["key"]] = s["default"]
        config_path.write_text(json.dumps(existing_config, indent=2))
    elif settings:
        default_config = {}
        for s in settings:
            if "default" in s:
                default_config[s["key"]] = s["default"]
        config_path.write_text(json.dumps(default_config, indent=2))

    if declared_imports:
        (module_dir / "requirements.txt").write_text("\n".join(declared_imports) + "\n")

    event_type = "module_updated" if is_update else "module_created"
    return {
        "type": event_type,
        "module_id": module_id,
        "manifest": manifest_raw,
        "warnings": warnings,
    }


async def _stream_chat(
    session_id: str,
    user_message: str,
    registry,
    module_id: str | None = None,
) -> AsyncGenerator[str, None]:
    """Stream a chat response via SSE.
    
    Context injection logic:
    - If module_id is explicitly passed (e.g. "Edit with Fwubbo"), bind session
    - If session already has a bound module (from prior creation), use that
    - On EVERY message for a bound module, re-inject the current source from disk
      so Claude always sees the latest code (especially after its own updates)
    """
    # Get or create conversation
    if session_id not in _conversations:
        _conversations[session_id] = []

    history = _conversations[session_id]

    # Resolve which module this session is working on
    # Explicit module_id (from "Edit with Fwubbo") takes priority
    if module_id:
        _session_modules[session_id] = module_id
    
    bound_module_id = _session_modules.get(session_id)

    # Build user message content
    content = user_message

    # Inject global API key names so Claude knows what's available
    global_keys = _get_global_api_key_names()
    if global_keys:
        keys_list = ", ".join(global_keys)
        content = f"[AVAILABLE GLOBAL API KEYS]\n{keys_list}\n[END GLOBAL API KEYS]\n\n{content}"

    # Always inject fresh source from disk when we have a bound module.
    # This ensures Claude sees the CURRENT code — not stale code from
    # earlier in the conversation. Critical after Claude's own updates,
    # since the <FWUBBO_MODULE> JSON in the response isn't easy to parse
    # back out of conversation history.
    if bound_module_id:
        source_context = _load_module_source(bound_module_id)
        if source_context:
            content = f"{source_context}\n\n{user_message}"

    history.append({"role": "user", "content": content})

    # Build a pruned copy of history for the API call.
    # Strip old source injections and <FWUBBO_MODULE> blocks to save context window.
    # The latest message already has the current source, so older copies are redundant.
    pruned_history = []
    for i, msg in enumerate(history):
        is_last = (i == len(history) - 1)
        cleaned_content = msg["content"]
        
        if not is_last and msg["role"] == "user":
            # Strip old source blocks from earlier messages
            cleaned_content = re.sub(
                r'\[CURRENT MODULE SOURCE[^\]]*\].*?\[END MODULE SOURCE\]\s*'
                r'You have the full source above\.[^\n]*',
                '', cleaned_content, flags=re.DOTALL
            ).strip()
            # Strip old global API key blocks (latest message has current keys)
            cleaned_content = re.sub(
                r'\[AVAILABLE GLOBAL API KEYS\].*?\[END GLOBAL API KEYS\]\s*',
                '', cleaned_content, flags=re.DOTALL
            ).strip()
        
        if msg["role"] == "assistant":
            # Strip <FWUBBO_MODULE> JSON blocks from old assistant responses —
            # they're huge and the current source on disk is what matters now
            cleaned_content = re.sub(
                r'<FWUBBO_MODULE>[\s\S]*?</FWUBBO_MODULE>',
                '[module code was generated here — see current source above]',
                cleaned_content
            ).strip()
        
        if cleaned_content:
            pruned_history.append({"role": msg["role"], "content": cleaned_content})

    # Call Claude with streaming
    try:
        import anthropic
        client = anthropic.Anthropic()

        full_response = ""

        with client.messages.stream(
            model="claude-sonnet-4-20250514",
            max_tokens=8192,
            system=CHAT_SYSTEM_PROMPT,
            messages=pruned_history,
        ) as stream:
            for text in stream.text_stream:
                full_response += text
                # SSE format: data: {json}\n\n
                event = json.dumps({"type": "text", "content": text})
                yield f"data: {event}\n\n"

        # Save assistant response to history
        history.append({"role": "assistant", "content": full_response})

        # Check if the response contains a module definition
        module_data = _extract_module_json(full_response)
        if module_data:
            # ── Hard enforce session-module binding ──────────────────
            # If this session is bound to a specific module (e.g. via
            # "Edit with Fwubbo"), force the output module ID to match.
            # This prevents Claude from accidentally overwriting a
            # different module when editing (e.g. replacing graduation
            # countdown with Christmas countdown).
            if bound_module_id and "manifest" in module_data:
                output_id = module_data["manifest"].get("id", "")
                if output_id != bound_module_id:
                    logger.warning(
                        f"Session {session_id} is bound to '{bound_module_id}' "
                        f"but Claude output module id '{output_id}'. "
                        f"Forcing id to '{bound_module_id}'."
                    )
                    module_data["manifest"]["id"] = bound_module_id

            result = _save_module(module_data, registry)

            if result["type"] in ("module_created", "module_updated"):
                # Refresh registry
                await registry.discover_modules()

                # Bind this session to the module for future iteration
                created_id = result["module_id"]
                _session_modules[session_id] = created_id

                # Send the bound module_id back so frontend can track it
                result["session_module_id"] = created_id

            event = json.dumps(result)
            yield f"data: {event}\n\n"

        # Send done event
        yield f"data: {json.dumps({'type': 'done'})}\n\n"

    except Exception as e:
        logger.error(f"Chat stream error: {e}")
        event = json.dumps({"type": "error", "error": str(e)})
        yield f"data: {event}\n\n"


@router.post("/stream")
async def chat_stream(req: ChatRequest, request: Request):
    """Stream a chat response for module generation conversation."""
    registry = request.state.registry

    return StreamingResponse(
        _stream_chat(
            session_id=req.session_id,
            user_message=req.message,
            registry=registry,
            module_id=req.module_id,
        ),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/session/{session_id}/module")
async def get_session_module(session_id: str):
    """Get the module_id bound to a chat session, if any."""
    module_id = _session_modules.get(session_id)
    return {"session_id": session_id, "module_id": module_id}


@router.post("/reset")
async def reset_chat(req: BaseModel):
    """Reset a chat session."""
    return {"status": "ok"}


@router.post("/reset/{session_id}")
async def reset_chat_session(session_id: str):
    """Reset a specific chat session."""
    if session_id in _conversations:
        del _conversations[session_id]
    if session_id in _session_modules:
        del _session_modules[session_id]
    return {"status": "ok", "session_id": session_id}


# ─── Module Config Endpoints ────────────────────────────────────

@router.get("/module/{module_id}/config")
async def get_module_config(module_id: str, request: Request):
    """Get a module's current config values."""
    registry = request.state.registry
    mod = registry.get(module_id)
    if not mod:
        raise HTTPException(404, f"Module '{module_id}' not found")

    config_path = mod.fetch_path.parent / "config.json"
    if config_path.exists():
        config = json.loads(config_path.read_text())
    else:
        config = {}

    # Get settings schema from manifest
    manifest_path = mod.fetch_path.parent / "manifest.json"
    manifest_raw = json.loads(manifest_path.read_text())
    settings = manifest_raw.get("settings", [])

    return {"config": config, "settings": settings}


@router.put("/module/{module_id}/config")
async def update_module_config(module_id: str, request: Request):
    """Update a module's config values."""
    registry = request.state.registry
    mod = registry.get(module_id)
    if not mod:
        raise HTTPException(404, f"Module '{module_id}' not found")

    body = await request.json()
    config = body.get("config", {})

    config_path = mod.fetch_path.parent / "config.json"
    config_path.write_text(json.dumps(config, indent=2))

    # If config contains secret-type values, also set them as env vars
    manifest_path = mod.fetch_path.parent / "manifest.json"
    manifest_raw = json.loads(manifest_path.read_text())
    settings = manifest_raw.get("settings", [])

    for setting in settings:
        if setting.get("type") == "password" and setting["key"] in config:
            env_key = f"FWUBBO_SECRET_{setting['key'].upper()}"
            os.environ[env_key] = str(config[setting["key"]])

    return {"status": "ok", "config": config}


@router.delete("/module/{module_id}")
async def delete_module(module_id: str, request: Request):
    """Delete a module entirely."""
    registry = request.state.registry
    mod = registry.get(module_id)
    if not mod:
        raise HTTPException(404, f"Module '{module_id}' not found")

    import shutil
    module_dir = mod.fetch_path.parent
    shutil.rmtree(module_dir)

    # Remove from registry
    if module_id in registry.modules:
        del registry.modules[module_id]

    return {"status": "ok", "module_id": module_id}
