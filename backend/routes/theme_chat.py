"""Streaming chat endpoint for custom theme generation.

Same conversational UX as the widget chat:
- User describes a theme in natural language
- Claude streams responses via SSE
- Claude outputs a <FWUBBO_THEME> JSON block to create/update themes
- Sessions track which theme they're editing for iteration
- Custom themes stored as JSON files in backend/data/custom_themes/
"""

import json
import logging
import re
import shutil
from pathlib import Path
from typing import AsyncGenerator

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

router = APIRouter()
logger = logging.getLogger("fwubbo.theme_chat")

CUSTOM_THEMES_DIR = Path(__file__).parent.parent / "data" / "custom_themes"


def _ensure_themes_dir():
    CUSTOM_THEMES_DIR.mkdir(parents=True, exist_ok=True)


# ─── In-memory conversation store ────────────────────────────────
_conversations: dict[str, list[dict]] = {}
_session_themes: dict[str, str] = {}


# ─── System prompt ───────────────────────────────────────────────

THEME_SYSTEM_PROMPT = r"""You are Fwubbo, a friendly AI assistant that helps create dashboard themes. You're creative and have a great eye for design.

## YOUR ROLE
You help users create and iterate on custom visual themes for their Fwubbo dashboard. You can:
1. Generate a complete theme definition from a description
2. Modify an existing theme's colors, fonts, or effects
3. Explain theme options and help with design decisions

## CONVERSATION FLOW — BE ACTION-ORIENTED
- For clear requests, just generate the theme immediately. Don't ask unnecessary questions.
- Make reasonable assumptions about colors, fonts, and effects.
- Only ask questions when truly ambiguous (e.g. "make it look cool" with no other context — ask what vibe they want).
- After generating, offer to help iterate: "Want me to adjust anything?"

## EDITING AN EXISTING THEME
When the user's message includes existing theme source (marked with [CURRENT THEME SOURCE]):
- You HAVE the complete current theme definition. Use it to make modifications.
- **CRITICAL: The [CURRENT THEME SOURCE] header contains the theme id. You MUST use this EXACT id in your <FWUBBO_THEME> output. NEVER change the id.**
- Apply only the changes needed. Don't rewrite everything from scratch unless asked.
- Always output the full updated <FWUBBO_THEME> block.

## GENERATING A THEME
When you're ready to generate (or update), output a special JSON block wrapped in <FWUBBO_THEME> tags.
Everything between these tags must be valid JSON and nothing else.

<FWUBBO_THEME>
{
  "id": "kebab-case-id",
  "name": "Human Readable Name",
  "description": "Short tagline",
  "variables": {
    "--font-display": "Font Name",
    "--font-body": "Font Name",
    "--font-mono": "Mono Font",
    "--surface-base": "rgba(r, g, b, a) or #hex",
    "--surface-raised": "rgba(r, g, b, a)",
    "--surface-overlay": "rgba(r, g, b, a)",
    "--accent-primary": "#hex",
    "--accent-secondary": "#hex",
    "--accent-glow": "rgba(r, g, b, a)",
    "--text-primary": "#hex",
    "--text-secondary": "#hex",
    "--text-muted": "#hex",
    "--border-subtle": "rgba(r, g, b, a)",
    "--border-strong": "rgba(r, g, b, a)",
    "--status-ok": "#hex",
    "--status-warn": "#hex",
    "--status-error": "#hex"
  },
  "fonts": ["https://fonts.googleapis.com/css2?family=...&display=swap"],
  "background": { "type": "solid", "color": "#hex" },
  "widget_style": {
    "blur": "16px",
    "opacity": 0.7,
    "border": "1px solid var(--border-subtle)",
    "shadow": "0 4px 32px rgba(0,0,0,0.4)",
    "shadow_hover": "0 8px 48px rgba(...)",
    "radius": "16px"
  }
}
</FWUBBO_THEME>

IMPORTANT: Only output the <FWUBBO_THEME> block when you're actually generating/updating.
Outside of that block, just chat normally with the user.

## THEME SPEC

### Required CSS Variables (ALL must be present)
- `--font-display`: Display/heading font family name
- `--font-body`: Body text font family name  
- `--font-mono`: Monospace font family name
- `--surface-base`: Main background surface (usually dark with transparency for glass effects, or solid for light themes)
- `--surface-raised`: Card/panel backgrounds (slightly lighter than base)
- `--surface-overlay`: Overlay/popup backgrounds (slightly lighter than raised)
- `--accent-primary`: Primary accent color (used for highlights, active states, buttons)
- `--accent-secondary`: Secondary accent color (complementary to primary)
- `--accent-glow`: Glow effect color (usually accent-primary with low opacity)
- `--text-primary`: Main text color (high contrast against surface-base)
- `--text-secondary`: Secondary text color (medium contrast)
- `--text-muted`: Muted/disabled text (low contrast, subtle)
- `--border-subtle`: Subtle borders (very low opacity)
- `--border-strong`: Strong/active borders
- `--status-ok`: Success/good status color (typically green)
- `--status-warn`: Warning status color (typically amber/orange)
- `--status-error`: Error status color (typically red)

### Fonts
- Array of Google Fonts CSS import URLs
- Always include all three font families: display, body, mono
- Use `&display=swap` for performance

### Background Types
1. `{"type": "solid", "color": "#hex"}` — Simple solid color
2. `{"type": "gradient", "css": "linear-gradient(...)"}` — CSS gradient
3. `{"type": "particle", "config": {...}}` — Animated particle system
4. `{"type": "animated", "component": "AuroraBackground"}` — Built-in animated backgrounds (only "AuroraBackground" available)
5. `{"type": "canvas", "setup": "scanlines"}` — Built-in canvas effects (only "scanlines" available)

For particle configs:
```json
{
  "count": 60,
  "shape": "circle",
  "size_range": [2, 8],
  "speed_range": [0.15, 0.6],
  "opacity_range": [0.15, 0.6],
  "colors": ["var(--accent-primary)", "var(--accent-secondary)", "#hex"],
  "behavior": "firefly",
  "mouse_interact": true,
  "blur": true,
  "connect_lines": false
}
```
Available shapes: "circle", "square", "triangle"
Available behaviors: "float", "orbit", "swarm", "rain", "snow", "firefly"

### Widget Style
- `blur`: Backdrop blur for glassmorphism ("0px" for no blur, "16px"-"24px" for glass)
- `opacity`: Background opacity (0.0-1.0, lower = more transparent/glass-like)
- `border`: CSS border shorthand (use var(--border-subtle) or var(--accent-primary))
- `shadow` / `shadow_hover`: Box shadow for normal/hover states
- `radius`: Border radius ("0px" for sharp, "4px" for subtle, "16px"-"24px" for rounded)

## DESIGN PRINCIPLES
- Ensure sufficient contrast between text and backgrounds (WCAG AA minimum)
- Dark themes: surface-base should be very dark, text should be light
- Light themes: surface-base should be very light, text should be dark
- Glass/transparent themes: use rgba() with alpha for surfaces, higher blur
- Accent colors should pop against both surfaces and text
- Status colors should be clearly distinguishable (green/amber/red family)
- Monospace fonts: JetBrains Mono, Fira Code, IBM Plex Mono, Space Mono are good choices
- Display fonts should have personality; body fonts should be readable
- Widget shadows should be subtle in dark themes, slightly more visible in light themes

## CRITICAL RULES
- ALL 17 CSS variables must be present
- Font URLs must be valid Google Fonts import URLs
- id must be unique kebab-case
- Colors must have sufficient contrast for readability
- When editing, keep the SAME id from the [CURRENT THEME SOURCE]
"""


def _load_theme_source(theme_id: str) -> str | None:
    """Load a custom theme's definition as context for Claude."""
    theme_path = CUSTOM_THEMES_DIR / f"{theme_id}.json"
    if not theme_path.exists():
        return None

    try:
        theme_data = json.loads(theme_path.read_text())
    except (json.JSONDecodeError, OSError):
        return None

    return (
        f"[CURRENT THEME SOURCE — id: {theme_id}]\n"
        f"⚠️ MANDATORY: When outputting <FWUBBO_THEME>, you MUST set id to \"{theme_id}\". Do NOT use any other id.\n"
        f"```json\n{json.dumps(theme_data, indent=2)}\n```\n"
        f"[END THEME SOURCE]"
    )


def _extract_theme_json(text: str) -> dict | None:
    """Extract theme JSON from <FWUBBO_THEME> tags."""
    match = re.search(r'<FWUBBO_THEME>\s*(.*?)\s*</FWUBBO_THEME>', text, re.DOTALL)
    if not match:
        return None
    try:
        return json.loads(match.group(1))
    except json.JSONDecodeError:
        return None


REQUIRED_VARIABLES = [
    "--font-display", "--font-body", "--font-mono",
    "--surface-base", "--surface-raised", "--surface-overlay",
    "--accent-primary", "--accent-secondary", "--accent-glow",
    "--text-primary", "--text-secondary", "--text-muted",
    "--border-subtle", "--border-strong",
    "--status-ok", "--status-warn", "--status-error",
]


def _validate_theme(theme: dict) -> list[str]:
    """Validate a theme definition. Returns list of warnings."""
    warnings = []

    if not theme.get("id") or not re.match(r'^[a-z0-9][a-z0-9\-]*[a-z0-9]$', theme["id"]):
        warnings.append(f"Invalid theme id: '{theme.get('id')}'")

    if not theme.get("name"):
        warnings.append("Missing theme name")

    variables = theme.get("variables", {})
    for var in REQUIRED_VARIABLES:
        if var not in variables:
            warnings.append(f"Missing CSS variable: {var}")

    if not theme.get("fonts") or not isinstance(theme["fonts"], list):
        warnings.append("Missing or invalid fonts array")

    if not theme.get("background"):
        warnings.append("Missing background definition")

    ws = theme.get("widget_style", {})
    for key in ("blur", "opacity", "border", "shadow", "shadow_hover", "radius"):
        if key not in ws:
            warnings.append(f"Missing widget_style.{key}")

    return warnings


def _save_theme(theme_data: dict) -> dict:
    """Validate and save a custom theme. Returns result dict."""
    _ensure_themes_dir()

    warnings = _validate_theme(theme_data)
    hard_fails = [w for w in warnings if "Invalid theme id" in w or "Missing CSS variable" in w]
    if hard_fails:
        return {"type": "error", "error": f"Theme validation failed: {'; '.join(hard_fails)}"}

    theme_id = theme_data["id"]
    theme_path = CUSTOM_THEMES_DIR / f"{theme_id}.json"
    is_update = theme_path.exists()

    theme_path.write_text(json.dumps(theme_data, indent=2))

    event_type = "theme_updated" if is_update else "theme_created"
    logger.info(f"{'Updated' if is_update else 'Created'} custom theme: {theme_id}")

    return {
        "type": event_type,
        "theme_id": theme_id,
        "theme": theme_data,
        "warnings": [w for w in warnings if w not in hard_fails],
    }


async def _stream_theme_chat(
    session_id: str,
    user_message: str,
    theme_id: str | None = None,
) -> AsyncGenerator[str, None]:
    """Stream a chat response for theme generation via SSE."""
    if session_id not in _conversations:
        _conversations[session_id] = []

    history = _conversations[session_id]

    # Resolve bound theme
    if theme_id:
        _session_themes[session_id] = theme_id

    bound_theme_id = _session_themes.get(session_id)

    # Build user message content
    content = user_message

    # Inject current theme source if editing
    if bound_theme_id:
        source_context = _load_theme_source(bound_theme_id)
        if source_context:
            content = f"{source_context}\n\n{user_message}"

    history.append({"role": "user", "content": content})

    # Prune history
    pruned_history = []
    for i, msg in enumerate(history):
        is_last = (i == len(history) - 1)
        cleaned_content = msg["content"]

        if not is_last and msg["role"] == "user":
            cleaned_content = re.sub(
                r'\[CURRENT THEME SOURCE[^\]]*\].*?\[END THEME SOURCE\]',
                '', cleaned_content, flags=re.DOTALL
            ).strip()

        if msg["role"] == "assistant":
            cleaned_content = re.sub(
                r'<FWUBBO_THEME>[\s\S]*?</FWUBBO_THEME>',
                '[theme definition was generated here — see current source above]',
                cleaned_content
            ).strip()

        if cleaned_content:
            pruned_history.append({"role": msg["role"], "content": cleaned_content})

    try:
        import anthropic
        client = anthropic.Anthropic()

        full_response = ""

        with client.messages.stream(
            model="claude-sonnet-4-20250514",
            max_tokens=4096,
            system=THEME_SYSTEM_PROMPT,
            messages=pruned_history,
        ) as stream:
            for text in stream.text_stream:
                full_response += text
                event = json.dumps({"type": "text", "content": text})
                yield f"data: {event}\n\n"

        history.append({"role": "assistant", "content": full_response})

        # Check for theme definition
        theme_data = _extract_theme_json(full_response)
        if theme_data:
            # Enforce session binding
            if bound_theme_id:
                output_id = theme_data.get("id", "")
                if output_id != bound_theme_id:
                    logger.warning(
                        f"Session {session_id} bound to '{bound_theme_id}' "
                        f"but output theme id '{output_id}'. Forcing."
                    )
                    theme_data["id"] = bound_theme_id

            result = _save_theme(theme_data)

            if result["type"] in ("theme_created", "theme_updated"):
                _session_themes[session_id] = result["theme_id"]
                result["session_theme_id"] = result["theme_id"]

            event = json.dumps(result)
            yield f"data: {event}\n\n"

        yield f"data: {json.dumps({'type': 'done'})}\n\n"

    except Exception as e:
        logger.error(f"Theme chat stream error: {e}")
        event = json.dumps({"type": "error", "error": str(e)})
        yield f"data: {event}\n\n"


# ─── Routes ──────────────────────────────────────────────────────

class ThemeChatRequest(BaseModel):
    session_id: str
    message: str
    theme_id: str | None = None


class RenameThemeRequest(BaseModel):
    theme_id: str
    new_name: str


class DuplicateThemeRequest(BaseModel):
    theme_id: str


@router.post("/stream")
async def theme_chat_stream(req: ThemeChatRequest):
    """Stream a chat response for theme generation."""
    return StreamingResponse(
        _stream_theme_chat(
            session_id=req.session_id,
            user_message=req.message,
            theme_id=req.theme_id,
        ),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/reset/{session_id}")
async def reset_theme_chat(session_id: str):
    """Reset a theme chat session."""
    if session_id in _conversations:
        del _conversations[session_id]
    if session_id in _session_themes:
        del _session_themes[session_id]
    return {"status": "ok", "session_id": session_id}


@router.get("/custom")
async def list_custom_themes():
    """List all custom themes."""
    _ensure_themes_dir()
    themes = []
    for f in sorted(CUSTOM_THEMES_DIR.glob("*.json")):
        try:
            theme = json.loads(f.read_text())
            themes.append(theme)
        except Exception as e:
            logger.warning(f"Failed to read custom theme {f.name}: {e}")
    return {"themes": themes}


@router.post("/rename")
async def rename_theme(req: RenameThemeRequest):
    """Rename a custom theme."""
    _ensure_themes_dir()
    theme_path = CUSTOM_THEMES_DIR / f"{req.theme_id}.json"
    if not theme_path.exists():
        raise HTTPException(404, f"Custom theme '{req.theme_id}' not found")

    new_name = req.new_name.strip()
    if not new_name:
        raise HTTPException(400, "Name cannot be empty")

    theme = json.loads(theme_path.read_text())
    theme["name"] = new_name
    theme_path.write_text(json.dumps(theme, indent=2))

    logger.info(f"Renamed theme {req.theme_id} to '{new_name}'")
    return {"status": "ok", "theme_id": req.theme_id, "theme": theme}


@router.post("/duplicate")
async def duplicate_theme(req: DuplicateThemeRequest):
    """Duplicate a custom theme."""
    _ensure_themes_dir()
    theme_path = CUSTOM_THEMES_DIR / f"{req.theme_id}.json"
    if not theme_path.exists():
        raise HTTPException(404, f"Custom theme '{req.theme_id}' not found")

    theme = json.loads(theme_path.read_text())

    # Generate unique id
    base_id = re.sub(r'-copy(-\d+)?$', '', req.theme_id)
    new_id = f"{base_id}-copy"
    counter = 2
    while (CUSTOM_THEMES_DIR / f"{new_id}.json").exists():
        new_id = f"{base_id}-copy-{counter}"
        counter += 1

    theme["id"] = new_id
    theme["name"] = theme.get("name", new_id) + " (Copy)"
    new_path = CUSTOM_THEMES_DIR / f"{new_id}.json"
    new_path.write_text(json.dumps(theme, indent=2))

    logger.info(f"Duplicated theme {req.theme_id} -> {new_id}")
    return {"status": "ok", "theme_id": new_id, "theme": theme}


@router.delete("/{theme_id}")
async def delete_theme(theme_id: str):
    """Delete a custom theme."""
    _ensure_themes_dir()
    theme_path = CUSTOM_THEMES_DIR / f"{theme_id}.json"
    if not theme_path.exists():
        raise HTTPException(404, f"Custom theme '{theme_id}' not found")

    theme_path.unlink()
    logger.info(f"Deleted custom theme: {theme_id}")
    return {"status": "ok", "theme_id": theme_id}
