"""LLM-powered module generation.

Pipeline:
1. User describes a widget in natural language (+ optional API docs)
2. Claude generates manifest.json + fetch.py + widget.tsx
3. Backend validates all three, runs sandbox checks on fetch.py
4. Files are written to modules/<module-id>/
5. If fetch.py needs extra pip packages, a requirements.txt is written
   and packages are auto-installed
6. Module registry is refreshed so the module is immediately available
7. The widget.tsx source is served to the frontend for dynamic compilation
"""

import json
import logging
import re
import subprocess
import sys
from pathlib import Path

from fastapi import APIRouter, Request, HTTPException
from pydantic import BaseModel

from core.sandbox import validate_imports, validate_network_calls
from core.module_registry import ModuleManifest

router = APIRouter()
logger = logging.getLogger("fwubbo.generate")

MODULES_DIR = Path(__file__).parent.parent / "modules"

# ─── System Prompt ────────────────────────────────────────────────
# Every rule here exists because an earlier generation got it wrong.

MODULE_GEN_SYSTEM_PROMPT = r"""You are Fwubbo's module generator. You produce dashboard widget modules.

A module is a folder with THREE files:
  manifest.json — metadata and permissions
  fetch.py      — Python data-fetching script (runs in a sandbox)
  widget.tsx    — React component that displays the fetched data

## MANIFEST SCHEMA (manifest.json)

```json
{
  "id": "kebab-case-unique-id",
  "name": "Human Readable Name",
  "description": "One sentence describing what this module shows",
  "icon": "lucide-icon-name",
  "refresh_interval": 300,
  "requires": [],
  "permissions": {
    "network": [],
    "python_imports": []
  },
  "api_stats": {
    "calls_per_refresh": 0,
    "llm_tokens_per_refresh": 0
  },
  "notifications": {
    "supported": false,
    "default_enabled": false
  },
  "widget": {
    "min_w": 3,
    "min_h": 2,
    "default_w": 4,
    "default_h": 3,
    "resizable": true
  },
  "theme_hints": {
    "supports_transparency": true,
    "animation_density": "subtle"
  }
}
```

Rules:
- "id" must be unique kebab-case, 2+ chars, alphanumeric and hyphens only. Examples: "weather-local", "arxiv-ml-papers".
- "requires" lists secret key names the fetch script needs. Example: ["openweathermap_key"]
  These become env vars at runtime: FWUBBO_SECRET_OPENWEATHERMAP_KEY (uppercased)
- "permissions.network" lists every domain the fetch script contacts. Must be exhaustive.
- "permissions.python_imports" lists pip packages beyond the always-available set.
  Always available (don't list these): httpx, requests, aiohttp, pydantic, numpy, pandas, anthropic
  If you need something else (e.g. yfinance, feedparser, beautifulsoup4), list it here.
- "refresh_interval" is seconds. Use 300 for most, 60 for fast-changing, 3600+ for slow.
- widget size is react-grid-layout units (12-column grid, ~80px row height).

## FETCH SCRIPT (fetch.py)

Runs as a standalone Python subprocess in a sandbox. Rules:

1. Print EXACTLY ONE JSON object to stdout. No other output. No print debugging.
2. Return shape: {"status": "ok"|"error", "data": {...}, "notifications": [...]}
3. Read secrets: `from os import environ` then `environ.get("FWUBBO_SECRET_KEYNAME")`
   ONLY `from os import environ` is allowed. No `import os`.
4. Use `httpx` for HTTP. Always set timeout on requests.
5. Catch ALL exceptions — always return valid JSON even on failure:
   {"status": "error", "data": {}, "notifications": [], "error_message": "..."}
6. Must complete within 15 seconds.
7. The script must be fully self-contained. Define a main function, call it, print result.

FORBIDDEN: import os, subprocess, socket, shutil, ctypes, multiprocessing, threading,
signal, sys, importlib, pickle, shelve, marshal, tempfile, glob, pathlib,
webbrowser, code, compileall. No filesystem access. No direct sockets.

NOTIFICATIONS (optional array in response):
```python
{"id": "dedup-key", "title": "Title", "body": "Details", "priority": "medium", "timestamp": "ISO"}
```

### EXAMPLE fetch.py — Weather

```python
import json
import httpx
from os import environ

def fetch():
    api_key = environ.get("FWUBBO_SECRET_OPENWEATHERMAP_KEY", "")
    if not api_key:
        return {"status": "error", "data": {}, "notifications": [], "error_message": "Missing API key"}
    try:
        r = httpx.get(
            "https://api.openweathermap.org/data/2.5/weather",
            params={"q": "Atlanta,US", "appid": api_key, "units": "imperial"},
            timeout=10.0,
        )
        r.raise_for_status()
        w = r.json()
        return {
            "status": "ok",
            "data": {
                "temp": w["main"]["temp"],
                "feels_like": w["main"]["feels_like"],
                "humidity": w["main"]["humidity"],
                "description": w["weather"][0]["description"],
                "icon": w["weather"][0]["icon"],
                "city": w["name"],
            },
            "notifications": [],
        }
    except Exception as e:
        return {"status": "error", "data": {}, "notifications": [], "error_message": str(e)}

print(json.dumps(fetch()))
```

### EXAMPLE fetch.py — Module using Claude

```python
import json
import httpx
import anthropic
from os import environ

def fetch():
    try:
        r = httpx.get("https://hacker-news.firebaseio.com/v0/topstories.json", timeout=10.0)
        story_ids = r.json()[:5]
        stories = []
        for sid in story_ids:
            sr = httpx.get(f"https://hacker-news.firebaseio.com/v0/item/{sid}.json", timeout=5.0)
            stories.append(sr.json())

        client = anthropic.Anthropic(api_key=environ.get("FWUBBO_SECRET_ANTHROPIC_KEY", ""))
        titles = [s.get("title", "") for s in stories]
        msg = client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=300,
            messages=[{"role": "user", "content": f"Summarize today's top HN trends from these titles: {titles}"}],
        )
        return {
            "status": "ok",
            "data": {
                "stories": [{"title": s.get("title"), "url": s.get("url"), "score": s.get("score")} for s in stories],
                "summary": msg.content[0].text,
            },
            "notifications": [],
        }
    except Exception as e:
        return {"status": "error", "data": {}, "notifications": [], "error_message": str(e)}

print(json.dumps(fetch()))
```

## WIDGET COMPONENT (widget.tsx)

React functional component rendered inside a WidgetCard container (title bar already provided).

STRICT RULES:
1. Default export the component: `export default function MyWidget({ data, loading, error, lastUpdated }: WidgetProps) { ... }`
2. Define the WidgetProps interface at the top of the file:
   ```tsx
   interface WidgetProps {
     data: Record<string, any> | null;
     loading: boolean;
     error: string | null;
     lastUpdated: string | null;
   }
   ```
3. Handle three states:
   - loading=true → animated skeleton (div with animate-pulse and bg-surface-overlay)
   - error is truthy → show error text with text-status-error
   - data exists → render the actual content
4. Color classes (these map to the active theme's CSS variables):
   Text:     text-text-primary, text-text-secondary, text-text-muted
   Surfaces: bg-surface-base, bg-surface-raised, bg-surface-overlay
   Accents:  text-accent-primary, text-accent-secondary, bg-accent-primary
   Borders:  border-border-subtle, border-border-strong
   Status:   text-status-ok, text-status-warn, text-status-error
5. NEVER hardcode colors (#fff, rgb(...), hsl(...)). Always theme classes.
6. Font classes: font-display (headings), font-body (body text), font-mono (numbers/code)
7. Allowed imports: "react", "lucide-react", "recharts" — nothing else
8. Do NOT render a title bar — the WidgetCard wrapper handles that
9. No external CSS. No data fetching. Data comes via the data prop.

### EXAMPLE widget.tsx — Weather

```tsx
import React from "react";
import { Cloud, Droplets, Thermometer } from "lucide-react";

interface WidgetProps {
  data: Record<string, any> | null;
  loading: boolean;
  error: string | null;
  lastUpdated: string | null;
}

export default function WeatherWidget({ data, loading, error }: WidgetProps) {
  if (loading) {
    return (
      <div className="flex flex-col gap-3 animate-pulse">
        <div className="h-8 bg-surface-overlay rounded w-1/2" />
        <div className="h-4 bg-surface-overlay rounded w-3/4" />
      </div>
    );
  }
  if (error) {
    return <div className="text-status-error text-sm font-mono">{error}</div>;
  }
  if (!data) {
    return <div className="text-text-muted text-sm">No data yet</div>;
  }
  return (
    <div className="flex flex-col gap-3 h-full">
      <div className="flex items-center gap-3">
        <Thermometer className="w-6 h-6 text-accent-primary" />
        <span className="text-3xl font-display font-bold text-text-primary">{data.temp}°F</span>
      </div>
      <p className="text-sm text-text-secondary capitalize">{data.description}</p>
      <div className="flex gap-4 mt-auto text-text-muted text-xs">
        <span className="flex items-center gap-1"><Droplets className="w-3.5 h-3.5" />{data.humidity}%</span>
        <span className="flex items-center gap-1"><Cloud className="w-3.5 h-3.5" />Feels {data.feels_like}°</span>
      </div>
    </div>
  );
}
```

### EXAMPLE widget.tsx — Recharts line chart

```tsx
import React from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { TrendingUp } from "lucide-react";

interface WidgetProps {
  data: Record<string, any> | null;
  loading: boolean;
  error: string | null;
  lastUpdated: string | null;
}

export default function PriceChartWidget({ data, loading, error }: WidgetProps) {
  if (loading) {
    return (
      <div className="flex flex-col gap-3 animate-pulse h-full">
        <div className="h-6 bg-surface-overlay rounded w-1/3" />
        <div className="flex-1 bg-surface-overlay rounded" />
      </div>
    );
  }
  if (error) return <div className="text-status-error text-sm font-mono">{error}</div>;
  if (!data?.prices) return <div className="text-text-muted text-sm">No price data</div>;

  const prices = data.prices as Array<{ time: string; price: number }>;
  const latest = prices[prices.length - 1]?.price ?? 0;
  const first = prices[0]?.price ?? 0;
  const pct = first > 0 ? (((latest - first) / first) * 100).toFixed(2) : "0.00";
  const up = latest >= first;

  return (
    <div className="flex flex-col h-full gap-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-accent-primary" />
          <span className="text-2xl font-display font-bold text-text-primary">${latest.toFixed(2)}</span>
        </div>
        <span className={`text-sm font-mono ${up ? "text-status-ok" : "text-status-error"}`}>
          {up ? "+" : ""}{pct}%
        </span>
      </div>
      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={prices}>
            <XAxis dataKey="time" hide />
            <YAxis domain={["auto", "auto"]} hide />
            <Tooltip contentStyle={{
              background: "var(--surface-overlay)", border: "1px solid var(--border-subtle)",
              borderRadius: 8, color: "var(--text-primary)", fontSize: 12,
            }} />
            <Line type="monotone" dataKey="price" stroke="var(--accent-primary)" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
```

## YOUR OUTPUT FORMAT

Respond with EXACTLY this JSON. No markdown fences, no commentary, no preamble or postamble.

{
  "manifest": { ... },
  "fetch_py": "...full python source...",
  "widget_tsx": "...full tsx source...",
  "pip_packages": ["package1", "package2"]
}

"pip_packages" lists pip packages needed beyond the always-available set (httpx, requests,
pydantic, numpy, pandas, anthropic). Empty array [] if none needed.
Must match manifest.permissions.python_imports.

CRITICAL:
- fetch.py: print EXACTLY ONE json line to stdout. No other prints.
- widget.tsx: must have `export default function ...`
- widget.tsx: ALL colors use theme classes. ZERO hardcoded colors.
- fetch.py: wrap everything in try/except. Always return valid JSON.
- fetch.py: use `from os import environ`, never `import os`.
- Output raw JSON only. No markdown. No explanation.
"""


class GenerateRequest(BaseModel):
    description: str
    api_docs: str | None = None
    api_key_names: list[str] | None = None


class GenerateResponse(BaseModel):
    module_id: str
    manifest: dict
    files_written: list[str]
    warnings: list[str]
    message: str


def _strip_code_fences(text: str) -> str:
    """Remove markdown code fences from LLM output."""
    text = text.strip()
    if text.startswith("```"):
        first_newline = text.index("\n") if "\n" in text else len(text)
        text = text[first_newline + 1:]
    if text.endswith("```"):
        text = text[:-3]
    return text.strip()


def _validate_widget_tsx(source: str) -> list[str]:
    """Check widget.tsx for common issues."""
    warnings = []

    if "export default" not in source:
        warnings.append("widget.tsx missing 'export default' — component won't load")

    hex_colors = re.findall(r'["\']#[0-9a-fA-F]{3,8}["\']', source)
    rgb_colors = re.findall(r'rgba?\([^)]+\)', source)
    if hex_colors:
        warnings.append(f"widget.tsx has hardcoded hex colors: {hex_colors[:3]}. Use theme classes instead.")
    if rgb_colors:
        # Allow var(--...) references inside inline styles
        non_var_rgb = [c for c in rgb_colors if "var(--" not in c]
        if non_var_rgb:
            warnings.append(f"widget.tsx has hardcoded rgb colors: {non_var_rgb[:3]}. Use theme classes instead.")

    return warnings


def _validate_fetch_py(source: str, manifest: dict) -> list[str]:
    """Run sandbox validation on the fetch script."""
    warnings = []

    allowed_extra = manifest.get("permissions", {}).get("python_imports", [])
    import_violations = validate_imports(source, allowed_extra)
    for v in import_violations:
        warnings.append(f"fetch.py: {v}")

    allowed_domains = manifest.get("permissions", {}).get("network", [])
    network_violations = validate_network_calls(source, allowed_domains)
    for v in network_violations:
        warnings.append(f"fetch.py: {v}")

    print_count = len(re.findall(r'\bprint\s*\(', source))
    if print_count == 0:
        warnings.append("fetch.py has no print() call — must print JSON to stdout")
    elif print_count > 1:
        warnings.append(f"fetch.py has {print_count} print() calls — should have exactly 1")

    if re.search(r'^import\s+os\b', source, re.MULTILINE):
        warnings.append("fetch.py uses 'import os' — use 'from os import environ' instead")

    return warnings


def _install_pip_packages(packages: list[str]) -> tuple[bool, str]:
    """Install pip packages needed by the module."""
    if not packages:
        return True, ""
    try:
        result = subprocess.run(
            [sys.executable, "-m", "pip", "install", "--break-system-packages", *packages],
            capture_output=True, text=True, timeout=120,
        )
        if result.returncode != 0:
            return False, f"pip install failed: {result.stderr[:500]}"
        return True, result.stdout[:200]
    except subprocess.TimeoutExpired:
        return False, "pip install timed out"
    except Exception as e:
        return False, f"pip install error: {e}"


@router.post("/module", response_model=GenerateResponse)
async def generate_module(req: GenerateRequest, request: Request):
    """Generate a complete module from a natural language description."""
    registry = request.state.registry

    # Build user prompt
    parts = [f"Create a Fwubbo dashboard module for:\n\n{req.description}"]
    if req.api_docs:
        parts.append(f"\n\nAPI Documentation:\n{req.api_docs}")
    if req.api_key_names:
        parts.append(f"\n\nRequired API key names (for FWUBBO_SECRET_ env vars): {', '.join(req.api_key_names)}")
    user_prompt = "".join(parts)

    # ── Call Claude ──────────────────────────────────────────────
    try:
        import anthropic
        client = anthropic.Anthropic()  # ANTHROPIC_API_KEY from env
        response = client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=8192,
            system=MODULE_GEN_SYSTEM_PROMPT,
            messages=[{"role": "user", "content": user_prompt}],
        )
        raw_text = response.content[0].text
    except Exception as e:
        raise HTTPException(500, f"LLM call failed: {e}")

    # ── Parse JSON ──────────────────────────────────────────────
    raw_text = _strip_code_fences(raw_text)
    try:
        generated = json.loads(raw_text)
    except json.JSONDecodeError as e:
        logger.error(f"LLM output not valid JSON:\n{raw_text[:1000]}")
        raise HTTPException(422, f"LLM response was not valid JSON: {e}")

    for key in ("manifest", "fetch_py", "widget_tsx"):
        if key not in generated:
            raise HTTPException(422, f"Missing '{key}' in generated output")

    # ── Validate manifest ───────────────────────────────────────
    manifest_raw = generated["manifest"]
    try:
        manifest = ModuleManifest(**manifest_raw)
    except Exception as e:
        raise HTTPException(422, f"Invalid manifest: {e}")

    module_id = manifest.id
    if not module_id or not re.match(r'^[a-z0-9][a-z0-9\-]*[a-z0-9]$', module_id):
        raise HTTPException(422, f"Invalid module id '{module_id}' — must be kebab-case, 2+ chars")

    # ── Validate fetch.py and widget.tsx ────────────────────────
    warnings: list[str] = []
    warnings.extend(_validate_fetch_py(generated["fetch_py"], manifest_raw))
    warnings.extend(_validate_widget_tsx(generated["widget_tsx"]))

    hard_fails = [w for w in warnings if "Forbidden import" in w]
    if hard_fails:
        raise HTTPException(422, f"Sandbox violations: {hard_fails}")

    # ── Install pip dependencies ────────────────────────────────
    pip_packages = generated.get("pip_packages", [])
    declared_imports = manifest.permissions.python_imports
    all_packages = list(set(pip_packages) | set(declared_imports))

    if all_packages:
        ok, msg = _install_pip_packages(all_packages)
        if not ok:
            warnings.append(f"Failed to install packages: {msg}")
        else:
            logger.info(f"Installed packages for {module_id}: {all_packages}")

    # ── Write module folder ─────────────────────────────────────
    module_dir = MODULES_DIR / module_id
    module_dir.mkdir(parents=True, exist_ok=True)

    files_written = []

    manifest_path = module_dir / "manifest.json"
    manifest_path.write_text(json.dumps(manifest_raw, indent=2))
    files_written.append(str(manifest_path))

    fetch_path = module_dir / "fetch.py"
    fetch_path.write_text(generated["fetch_py"])
    files_written.append(str(fetch_path))

    widget_path = module_dir / "widget.tsx"
    widget_path.write_text(generated["widget_tsx"])
    files_written.append(str(widget_path))

    if all_packages:
        req_path = module_dir / "requirements.txt"
        req_path.write_text("\n".join(all_packages) + "\n")
        files_written.append(str(req_path))

    logger.info(f"Module '{module_id}': {len(files_written)} files, {len(warnings)} warnings")

    # ── Refresh registry ────────────────────────────────────────
    await registry.discover_modules()

    return GenerateResponse(
        module_id=module_id,
        manifest=manifest_raw,
        files_written=files_written,
        warnings=warnings,
        message=f"Module '{manifest.name}' generated and registered",
    )


@router.get("/module/{module_id}/widget-source")
async def get_widget_source(module_id: str, request: Request):
    """Serve the raw widget.tsx source for frontend dynamic compilation."""
    registry = request.state.registry
    mod = registry.get(module_id)
    if not mod:
        raise HTTPException(404, f"Module '{module_id}' not found")
    if not mod.widget_path.exists():
        raise HTTPException(404, f"Widget source not found for '{module_id}'")

    source = mod.widget_path.read_text()
    return {"module_id": module_id, "source": source}
