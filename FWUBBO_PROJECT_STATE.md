# Fwubbo — Complete Project State & Continuation Briefing

## What Fwubbo Is

Personal daily dashboard desktop app. **Tauri + React + Tailwind** frontend, **FastAPI** Python backend, runs fully locally. Users describe widgets in natural language via a streaming chat with Claude → Claude generates a Python data-fetching script + React display component → widget appears live on the dashboard. Widgets are configurable via right-click settings (API keys, parameters). Themes with animated backgrounds (particles, aurora, CRT scanlines). Planned: system tray behavior, startup-of-the-day logic, Tauri executable packaging.

---

## Current Project Structure

```
fwubbo/
├── src/                              # React + Vite + Tailwind frontend
│   ├── App.tsx                       # Root — registers built-in + backend modules, renders panels
│   ├── main.tsx                      # React entry point
│   ├── index.css                     # Global CSS — widget card glass styles, scrollbars, grid overrides
│   ├── types.ts                      # TypeScript types: ModuleManifest, SettingField, ThemeDefinition, WidgetProps
│   ├── api/
│   │   └── client.ts                 # Typed fetch wrappers: streaming chat, module CRUD, config, stats
│   ├── components/
│   │   ├── DynamicWidget.tsx         # In-browser TSX compiler (Sucrase) — loads LLM-generated widgets
│   │   ├── ChatPanel.tsx             # Right-side streaming chat UI with module context binding
│   │   ├── TerminalPanel.tsx         # [REMOVED] Terminal feature cut — security liability, beyond scope
│   │   ├── ModuleGeneratorPanel.tsx  # [LEGACY] Old single-shot generator — kept for reference, not used
│   │   ├── WidgetCard.tsx            # Glassmorphic card wrapper + error boundary + status badge + context menu
│   │   ├── WidgetContextMenu.tsx     # Right-click context menu: Settings, Edit, Refresh, Save, Info, Remove, Delete
│   │   ├── WidgetSettingsPanel.tsx   # Per-widget settings drawer (API keys, config values) + auto re-fetch on save
│   │   ├── WidgetGrid.tsx            # react-grid-layout draggable grid + auto-fetch + context menu state
│   │   └── Sidebar.tsx               # Left sidebar — theme picker, module list, panel toggles
│   ├── stores/
│   │   └── dashboard.ts             # Zustand store — theme, layouts, modules (with revision counter), panels, editModuleId
│   ├── themes/
│   │   ├── definitions.ts           # 4 themes: Deep Ocean, Brutalist Terminal, Paper & Ink, Aurora
│   │   ├── backgrounds.tsx          # Particle system, Aurora blobs, CRT scanline renderers
│   │   ├── ThemeProvider.tsx         # CSS variable injection + Google Fonts loading
│   │   └── index.ts                 # Re-exports
│   └── widgets/
│       ├── DemoClock.tsx             # [UNUSED] Built-in clock widget — removed from defaults
│       ├── DemoQuote.tsx             # [UNUSED] Built-in quote widget — removed from defaults
│       └── DemoStatus.tsx            # Built-in system status widget (only remaining built-in)
│
├── backend/                          # FastAPI Python backend
│   ├── main.py                       # App factory, CORS, .env loader, lifespan, 4 routers
│   ├── requirements.txt              # fastapi, uvicorn, pydantic, httpx, anthropic
│   ├── smoke_test.py                 # 28-test validation suite
│   ├── .env                          # ANTHROPIC_API_KEY + FWUBBO_SECRET_* vars (gitignored)
│   ├── core/
│   │   ├── sandbox.py                # AST import scanner + subprocess executor + secret/config injection
│   │   ├── module_registry.py        # Module discovery + Pydantic manifest validation (with SettingField)
│   │   └── stats_db.py               # SQLite usage tracking (hour/day/month windows)
│   ├── routes/
│   │   ├── chat.py                   # SSE streaming chat + module context injection + session-module binding + config CRUD + deletion
│   │   ├── generate.py               # [LEGACY] Single-shot LLM module generation (still functional)
│   │   ├── modules.py                # Module list/fetch/stats endpoints
│   │   ├── saved.py                  # Saved widgets library — save/add/duplicate/delete endpoints
│   │   ├── secrets.py                # Global API key management — .env-backed CRUD
│   │   └── settings.py               # App-wide settings — notifications, startup, profile
│   ├── modules/                      # Generated modules live here
│       ├── open-meteo-weather/       # Default weather widget (no API key needed)
│       │   ├── manifest.json
│       │   ├── fetch.py
│       │   ├── widget.tsx
│       │   └── config.json
│       └── countdown-timer/          # Example countdown widget
│           ├── manifest.json
│           ├── fetch.py
│           └── widget.tsx
│   └── saved/                        # Saved widget copies (same structure as modules/)
│
├── package.json
├── vite.config.ts
├── tailwind.config.js
├── tsconfig.json
├── index.html
└── README.md
```

---

## What Works Right Now

### ✅ Frontend
- **Dashboard renders** with 1 built-in widget (System Status) + all backend modules (including default Open-Meteo weather)
- **Theme switching** — 4 themes with animated backgrounds. Default is Paper & Ink. All via CSS variables.
- **Draggable/resizable grid** via react-grid-layout (loop-safe layout comparison)
- **Streaming Chat Panel** — slides in from the right:
  - Real-time SSE streaming of Claude responses
  - Claude can ask clarifying questions before generating
  - User can iterate: "change the color" / "add a feature" / "fix this bug" in the same session
  - **Module context binding** — chat session tracks which module it's editing; Claude always sees current source code
  - **Edit with Fwubbo** — right-click any widget → "Edit with Fwubbo" opens chat pre-bound to that module
  - Module creation and update events shown inline with success/warning indicators
  - Markdown formatting: **bold**, `inline code`, ```code blocks```
  - `<FWUBBO_MODULE>` tags stripped from display automatically
  - Session management with reset button
- **Widget Context Menu** — right-click any widget:
  - Settings (opens per-widget config panel, only for widgets with settings)
  - **Edit with Fwubbo** (opens chat panel pre-bound to this module for iterative editing)
  - Refresh (triggers immediate data fetch)
  - **Save Widget** (saves to library for later reuse)
  - Module Info (opens floating info popup with stats, network, secrets, performance)
  - **Remove Widget** (removes from dashboard, keeps files on disk)
  - Delete (removes module files permanently)
- **Module Info Panel** — floating popup at right-click position:
  - Status indicator (online/error/loading), refresh interval
  - Fetch performance: count/hour, avg fetch time, last fetch time
  - API calls and LLM token usage per hour/day (when applicable)
  - Declared network domains, secret names, widget size config, last error
  - Click outside or Escape to close
- **Saved Widgets Library** — sidebar tab (bookmark icon):
  - Browse saved widgets with descriptions
  - Quick-add to dashboard via hover button
  - Right-click context menu: Add Widget, Duplicate Widget, Delete Widget
  - Saved widgets stored in `backend/saved/` directory
- **Settings Panel** — sidebar gear icon, slides in from right with 4 tabs:
  - **API Keys** — list/add/update/delete global API keys stored in .env. Values never exposed to frontend.
  - **Notifications** — enable/disable, when-minimized, sound toggle
  - **Startup** — auto-launch, start minimized, first-boot-fullscreen
  - **Profile** — name, location, timezone, interests (tag chips)
- **Widget Settings Panel** — per-widget configuration drawer:
  - Dynamic form from manifest `settings` array
  - Input types: text, number, select, toggle, password (masked with eye toggle)
  - Save/reset to defaults, change detection
  - Settings persisted to config.json in module folder
  - Password-type settings auto-injected as FWUBBO_SECRET_* env vars
  - **Auto re-fetch on save** — widget immediately reflects config changes
- **DynamicWidget** compiler — Sucrase in-browser TSX → CJS, custom require() map, component caching
  - **Revision-based cache busting** — when module source is updated, widget remounts with fresh code
  - **Error copy buttons** — all error states (compile error, runtime crash) have "Copy error" buttons with "Copied!" feedback
  - Error areas use `no-drag` class so text is selectable and buttons are clickable without triggering grid drag
- **WidgetCard** — glassmorphic card with title bar, status badge, error boundary with copy button, right-click context menu
- **Error propagation** — actual error messages from fetch scripts shown in widgets (not generic "Fetch failed")
- **Global API Keys** — verified working. Keys stored via Settings → API Keys, injected as FWUBBO_SECRET_* env vars. Claude is informed of available global keys during widget generation and uses them automatically (e.g. OPENWEATHERMAP_KEY).

### ✅ Backend
- **Module registry** with Pydantic validation including `settings` field (SettingField schema)
- **Sandbox enforcer** — AST import scanning, network domain check, subprocess isolation
  - Expanded stdlib allowlist: includes `zoneinfo`, `time`, `calendar`, `csv`, `io`, `urllib`, etc.
- **Secret injection** — FWUBBO_SECRET_* env vars into subprocess
- **Config injection** — reads config.json → FWUBBO_CONFIG env var (JSON string), password-type settings auto-promoted to FWUBBO_SECRET_*
- **Streaming chat** (`POST /api/chat/stream`) — SSE via Anthropic `messages.stream()`:
  - **Session-to-module binding** — `_session_modules` tracks which module each session is editing
  - **Fresh source injection on every message** — always loads current code from disk, including config.json
  - **Global API key awareness** — injects available global key names into every message so Claude can use existing keys
  - **History pruning** — strips old source blocks, `<FWUBBO_MODULE>` JSON, and old API key blocks from earlier messages
  - **Update vs create detection** — returns `module_updated` for existing modules, preserves user config.json
  - **Action-oriented system prompt** — generates first, asks only when truly ambiguous; never asks for code it already has
- **Module config CRUD** — `GET/PUT /api/chat/module/{id}/config`, `DELETE /api/chat/module/{id}`
- **Session info** — `GET /api/chat/session/{id}/module` returns bound module_id
- **Stats DB** — SQLite tracking per module per time window
- **Saved widgets CRUD** — `GET/POST /api/saved/` for save/add/duplicate/delete of widget library
- **Global API key management** — `GET/POST/PUT/DELETE /api/secrets/` — .env-backed CRUD for FWUBBO_SECRET_* keys
- **App settings** — `GET/PUT /api/settings/` — notifications, startup, profile persisted to data/settings.json

### ✅ Default Modules
- `open-meteo-weather` — current weather via Open-Meteo API (no key needed). Settings: location, units. Geocodes city name, shows temp/humidity/wind/conditions/sunrise/sunset with weather icons. Toggle settings for feels-like and sunrise/sunset display.
- `countdown-timer` — counts down to May 9, 2026 graduation. No API calls.
- `demo-status` — built-in frontend-only system status widget.

---

## Known Issues & Bugs

### ~~🟡 Module Info Panel Not Working~~ ✅ DONE
- ~~Clicking "Module Info" in context menu or header does nothing visible~~
- ~~The `infoPanelModule` state is set but no panel component renders it~~
- **Implemented:** ModuleInfoPanel.tsx — floating popup positioned at right-click location. Shows: module status, description, refresh interval, fetch performance (count/avg time/last fetch), API call and LLM token usage per hour/day, declared network domains, secret names, widget size config, last error. Click outside or Escape to close. Stats fetched from existing `GET /api/modules/{id}/stats` endpoint.

### ~~🟡 No Saved Widgets / Remove Widget~~ ✅ DONE
- ~~No way to save widgets to a library for later reuse~~
- ~~No "Remove from dashboard" option (only Delete which removes files entirely)~~
- **Implemented:** Saved widgets tab in sidebar with right-click context menu (Add Widget, Duplicate Widget, Delete Widget). Widget context menu now has "Save Widget" and "Remove Widget" options. Backend `routes/saved.py` handles save/add/duplicate/delete with `backend/saved/` directory. Remove Widget keeps files on disk but removes from dashboard; Delete permanently removes files.

### ~~🔴 Chat-to-Widget Targeting Not Hard Enforced~~ ✅ DONE
- ~~While editing a Christmas countdown widget, Claude got confused and **replaced the graduation countdown timer widget** with the Christmas widget instead~~
- ~~The session-module binding exists but Claude may output a `<FWUBBO_MODULE>` block with a different module ID than the bound one~~
- **Fixed:** Two-layer defense:
  1. **System prompt hard rule** — explicit CRITICAL instruction that the module id from [CURRENT MODULE SOURCE] header MUST be preserved in output. Source context injection now includes a ⚠️ MANDATORY reminder with the exact id to use.
  2. **Backend enforcement** — `_stream_chat()` now force-overwrites the module id in Claude's `<FWUBBO_MODULE>` output to match the session's bound module. Even if Claude ignores the prompt, the backend catches and corrects the mismatch with a warning log.

### ~~🔴 Font Size Styling Issues on Custom Countdown Widgets~~ ✅ DONE
- ~~Claude struggles to change font size on custom countdown widgets (e.g. making days-remaining number the biggest thing). All font sizes end up hardcoded to be the same.~~
- **Fixed:** Added explicit **FONT SIZING** section to the system prompt's widget.tsx spec. Lists all available Tailwind text size classes (text-xs through text-9xl plus arbitrary bracket syntax), gives concrete guidance for countdown/numeric widgets (primary number text-5xl to text-7xl, labels text-xs to text-sm), and includes a hard rule: "NEVER make all text the same size. Create visual contrast."

### ~~🟡 No Settings Page~~ ✅ DONE
- ~~API key must be set via .env file — no UI~~
- ~~No startup/notification/profile settings~~
- **Implemented:** Full Settings panel (gear icon in sidebar) with 4 tabs:
  - **API Keys** — list/add/update/delete global API keys stored in .env. Keys referenced by name only, values never exposed to frontend. Claude is informed of available global keys during widget generation and can use them directly or offer per-widget overrides.
  - **Notifications** — enable/disable, when-minimized, sound toggle (persisted to data/settings.json, Tauri integration pending)
  - **Startup** — auto-launch, start minimized, first-boot-fullscreen (persisted, Tauri integration pending)
  - **Profile** — name, location, timezone, interests (persisted, used for LLM prompt personalization)

### ~~🟡 No Theme Generator~~ ✅ DONE
- ~~Can't create custom themes via chat~~
- **Implemented:** Full theme generation system with streaming chat (ThemeChatPanel), backend route (routes/theme_chat.py), custom themes stored as JSON in backend/data/custom_themes/. Sidebar themes tab has + button for creating, right-click context menu on custom themes for Edit, Rename, Duplicate, Delete. Themes auto-apply on generation. Session-to-theme binding for iterative editing. Built-in themes are read-only.

### ~~🟡 No Tauri Integration~~ ✅ DONE
- ~~Runs as plain Vite dev server in browser~~
- **Implemented:** Full Tauri 2 integration. See details below.

---

## Architecture Details for Continuation

### Module Contract (four-file structure)

Every module lives in `backend/modules/<kebab-case-id>/` with:

**manifest.json:**
```json
{
  "id": "kebab-case-id",
  "name": "Human Readable Name",
  "description": "...",
  "icon": "lucide-icon-name",
  "refresh_interval": 300,
  "requires": ["secret_key_name"],
  "permissions": {
    "network": ["api.example.com"],
    "python_imports": ["yfinance"]
  },
  "settings": [
    { "key": "city", "type": "text", "label": "City", "default": "Atlanta", "description": "..." },
    { "key": "api_key", "type": "password", "label": "API Key", "default": "", "description": "..." },
    { "key": "units", "type": "select", "label": "Units", "default": "imperial", "options": ["imperial", "metric"] },
    { "key": "show_detail", "type": "toggle", "label": "Show Detail", "default": true, "description": "Toggle display of detail section" }
  ],
  "api_stats": { "calls_per_refresh": 1, "llm_tokens_per_refresh": 0 },
  "notifications": { "supported": false, "default_enabled": false },
  "widget": { "min_w": 3, "min_h": 2, "default_w": 4, "default_h": 3, "resizable": true },
  "theme_hints": { "supports_transparency": true, "animation_density": "subtle" }
}
```

**fetch.py** — standalone Python script, runs in subprocess:
- Reads secrets via `from os import environ` → `environ.get("FWUBBO_SECRET_KEYNAME")`
- Reads settings via `json.loads(environ.get("FWUBBO_CONFIG", "{}"))`
- Uses `httpx` for HTTP (sync, always with timeout)
- Prints exactly ONE JSON object to stdout: `{"status": "ok"|"error", "data": {...}, "notifications": [...]}`
- Must complete in <15 seconds
- **IMPORTANT:** widget.tsx has NO direct access to config/settings. For display-toggle settings, fetch.py must pass toggle values through in its `data` output (e.g., `data["show_detail"] = config.get("show_detail", True)`), and widget.tsx reads them from `data`.

**widget.tsx** — React component, compiled in-browser by Sucrase:
- `export default function Widget({ data, loading, error, lastUpdated }: WidgetProps)`
- Uses ONLY theme CSS variable classes — never hardcodes colors
- Can import from: react, lucide-react, recharts

**config.json** — per-instance settings values:
- Written with defaults on module creation
- Updated via Settings panel (right-click → Settings)
- Preserved on module update (new setting keys get defaults merged in)
- Injected as FWUBBO_CONFIG env var into fetch.py subprocess

### Sandbox Security Model

**Static analysis:** AST walks fetch.py, blocks forbidden imports, checks URL domains.
**Allowed stdlib:** json, math, re, datetime, collections, itertools, functools, operator, string, decimal, fractions, statistics, random, hashlib, hmac, base64, urllib, html, textwrap, enum, dataclasses, typing, abc, copy, pprint, zoneinfo, time, calendar, bisect, heapq, struct, io, csv
**Runtime isolation:** Subprocess with stripped env, secrets/config injected, 30s timeout, stdout parsed as JSON.
**Config injection:** Reads config.json → FWUBBO_CONFIG env var. Password-type settings auto-promoted to FWUBBO_SECRET_*.

### Streaming Chat Architecture

1. Frontend sends `POST /api/chat/stream` with `{ session_id, message, module_id? }`
2. Backend resolves bound module: explicit `module_id` param, or `_session_modules[session_id]`
3. If bound module exists, loads current source from disk (manifest.json, fetch.py, widget.tsx, config.json) and prepends to user message
4. Prunes old source blocks and `<FWUBBO_MODULE>` JSON from earlier messages in conversation history
5. Calls `client.messages.stream()` from Anthropic SDK with pruned history
6. Responses streamed as SSE: `data: {"type": "text", "content": "..."}\n\n`
7. Full response saved to in-memory conversation history
8. When Claude includes `<FWUBBO_MODULE>{json}</FWUBBO_MODULE>`:
   - Backend validates, installs packages, writes files
   - Detects update vs create: existing module dir → `module_updated` (preserves config.json); new → `module_created` (writes default config)
   - Binds session to module for future iteration
   - Sends `module_created` or `module_updated` SSE event → frontend handles accordingly
9. Frontend on `module_created`: registers manifest, clears widget cache, adds to grid layout, binds chat session
10. Frontend on `module_updated`: re-registers manifest (bumps revision), clears widget cache (triggers remount via key change), re-fetches data, NO new layout entry
11. Reset via `POST /api/chat/reset/{session_id}` — clears conversation history and session-module binding

### Store Architecture (Zustand)

Single store in `stores/dashboard.ts`:
- `themeId`, `layouts`, `modules` (Record<id, ModuleState>)
- `ModuleState`: manifest, lastResult, loading, error, lastUpdated, **revision** (incremented on update, used as React key for DynamicWidget remount)
- `activePanel` — "none" | "settings" | "add-module" | "settings-page"
- `settingsModule` — module ID for open settings panel
- `infoPanelModule` — module ID for info panel (not yet rendered)
- `editModuleId` — module ID for "Edit with Fwubbo" flow (passed to ChatPanel on open)
- `savedWidgets` — Record<id, SavedWidgetState> for saved widget library (manifest only, no runtime state)
- Actions: registerModule (detects update vs create, bumps revision), removeModule, updateModuleData, setModuleLoading, setModuleError, registerSavedWidget, removeSavedWidget, etc.

**Critical:** WidgetGrid uses `getState()` for mutations during fetch to avoid subscribe→mutate→subscribe loops.

### Theme System

4 themes defined as ThemeDefinition objects with CSS variables, Google Fonts, backgrounds (solid/gradient/particle/animated), widget glass styling. ThemeProvider injects onto :root.

---

## Roadmap: Remaining Features (Priority Order)

### ~~1. Fix Internet Connectivity~~ ✅ DONE
### ~~2. Streaming Chat Panel~~ ✅ DONE
### ~~3. Widget Context Menu~~ ✅ DONE
### ~~4. Per-Widget Settings Panel~~ ✅ DONE
### ~~5. Error Propagation~~ ✅ DONE
### ~~6. Default Weather Widget~~ ✅ DONE
### ~~7. Chat Context Persistence & Widget Association~~ ✅ DONE
### ~~8. Chat Prompt Tuning (Action-Oriented)~~ ✅ DONE
### ~~9. Error Copy Buttons & Drag Bypass~~ ✅ DONE
### ~~10. Terminal Panel Placeholder~~ ❌ REMOVED
- Removed from scope — potential security liability and beyond project goals

### ~~11. Saved Widgets Library + Remove Widget~~ ✅ DONE
- ~~"Saved Widgets" tab in sidebar — modules stored in a `saved/` directory~~
- ~~Distinction between "Remove from dashboard" (hides, keeps files) and "Delete" (removes files)~~
- ~~Add "Save to Library" in context menu~~
- ~~Import from library back to dashboard (copies to modules/, re-registers)~~
- ~~Add "Remove from Dashboard" option in context menu (separate from Delete)~~
- **Also added:** Duplicate Widget and Delete Widget in saved widgets context menu

### ~~12. Module Info Panel~~ ✅ DONE
- ~~Build ModuleInfoPanel component, render when infoPanelModule is set~~
- ~~Show: manifest details, description, icon, refresh interval~~
- ~~Show: stats from backend (api_calls/hour, llm_tokens/hour, last_fetch_ms)~~
- ~~Show: network status, declared domains, secret names~~
- Show: auto-refresh toggle (enable/disable the setInterval per widget) — **not yet implemented**
- ~~Backend support already exists via `GET /api/modules/{id}/stats`~~

### ~~13. Settings Page~~ ✅ DONE
- ~~API key input stored to backend .env (or keytar when Tauri integrated)~~
- ~~Profile editor (name, location, interests — injected into LLM prompts for personalization)~~
- ~~Notification master controls~~
- ~~Startup behavior: always open / first boot of day only~~
- Module management: enable/disable/delete all modules — **not yet implemented**
- Theme selection (duplicate of sidebar for discoverability) — **not yet implemented, already in sidebar**

### 14. Theme Generator
- Same ChatPanel UX but targeting ThemeDefinition JSON output
- Input: "dark mode with orange accents and geometric patterns"
- Output: ThemeDefinition JSON + optional background component
- Simple mode: just colors/fonts
- Advanced mode: custom particle configs, animated backgrounds, CSS effects
- May need to refactor theme system for maximum customizability (more CSS variables, more background types)

### 15. Security Hardening & Debug Features
- Runtime network enforcement (proxy subprocess traffic through domain allowlist)
- Generated code review before first execution
- Secret scoping (each module sees only its own secrets)
- CSP headers in Tauri
- Module signing (hash verification)
- Rate limiting per module per hour
- Debug panel: show raw fetch.py output, timing, errors

### 16. Tauri Desktop App
- Create src-tauri/ with Cargo.toml and tauri.conf.json
- System tray with Show/Refresh/Quit
- Startup behavior: check timestamp file, full-screen on first boot, tray on subsequent
- Autostart via Tauri plugin
- Native notifications (forwarded from module notification arrays)
- Keytar integration for secrets
- shell.open() for "Open File Location" feature

### ~~17. Built-in Terminal~~ ❌ REMOVED
- Cut from scope — security liability (shell access from generated code), beyond project goals

---

## Remaining Work

### Next Up
1. **Security Hardening & Debug Features** — runtime network enforcement, generated code review before first execution, secret scoping, CSP headers, module signing, rate limiting, debug panel
2. **Theme Generator** — same ChatPanel UX but targeting ThemeDefinition JSON output. Right-click themes to delete or clone. May need to refactor theme system for maximum customizability (more CSS variables, more background types, custom particle configs, animated backgrounds, CSS effects)
3. **Tauri Desktop App** — src-tauri/ setup, system tray (Show/Refresh/Quit), auto-startup, first-boot-of-day fullscreen logic, native notifications, keytar for secrets, shell.open() for file locations

### Future Optimization
- Further optimization to the widget system to enable highly advanced modules
- Enabling higher customization on themes

---

## How to Run

```bash
# Terminal 1 — Backend
cd fwubbo/backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
# Create .env with: ANTHROPIC_API_KEY=sk-ant-...
# Optionally add: FWUBBO_SECRET_OPENWEATHERMAP_KEY=... (for OWM widgets)
uvicorn main:app --reload --port 9120

# Terminal 2 — Frontend
cd fwubbo
npm install
npm run dev
# Open http://localhost:1420
```

## Key Technical Decisions & Lessons Learned

1. **react-grid-layout fires onLayoutChange on mount** — must compare layouts before calling setLayouts or you get infinite re-render loops
2. **Zustand subscribe() inside useEffect is dangerous** — use `getState()` for mutations inside subscriptions to avoid stack overflow
3. **Subprocess env needs careful construction** — stripping PATH/PYTHONPATH breaks pip imports and SSL. Must propagate minimal but sufficient env including SSL cert vars.
4. **Sucrase `imports` transform produces CJS require() calls** — custom require function maps to pre-imported modules (react, lucide-react, recharts)
5. **Error messages must propagate** — the store must extract `error_message` or `error` from fetch results, not use a generic string. This was a major debugging pain point.
6. **Open-Meteo geocoding doesn't like country codes** — "Atlanta, US" fails, "Atlanta" works. Generated widgets should be tested with actual API behavior.
7. **Tarball state can desync** — when shipping code between sessions, verify ALL files have the expected changes. The store/types/API client/backend files were frequently out of sync with the component files.
8. **DynamicWidget needs revision-based cache busting** — clearing the component cache isn't enough; the React component instance holds stale state. Must change the React `key` (using a revision counter in the Zustand store) to force a full unmount→remount cycle that re-fetches source from the backend.
9. **Widget.tsx has NO direct access to config.json** — settings flow only to fetch.py via FWUBBO_CONFIG. For display-toggle settings, fetch.py must forward them through in its `data` output. The system prompt documents this pattern.
10. **LLM context injection must be fresh on every message** — injecting module source only on the first message causes context loss after updates. Source must be re-loaded from disk and prepended on every message, with old copies pruned from history to save context window.
11. **Settings panel must trigger re-fetch** — saving config.json without re-running fetch.py leaves the widget showing stale data until the next periodic refresh.
12. **System prompt needs hard rules, not suggestions** — Claude will ignore passive context ("here's the source") if the system prompt doesn't explicitly forbid asking for code. "NEVER ask the user to share code" works; "the source is available" doesn't.
