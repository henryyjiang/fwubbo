# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

Fwubbo is a personal AI-powered daily dashboard. Users describe widgets in plain English → Claude generates a Python data-fetcher + React component → the widget appears live on the dashboard. It's a **Tauri 2 + React + Vite + Tailwind** frontend with a **FastAPI** Python backend, running fully locally.

## Commands

### Frontend
```bash
npm run dev          # Vite dev server at http://localhost:1420
npm run build        # Production build
npm run tauri:dev    # Tauri desktop app (dev mode)
npm run tauri:build  # Package as desktop app
```

### Backend
```bash
cd backend
source venv/bin/activate
uvicorn main:app --reload --port 9120

# Run smoke tests (no LLM call needed)
python smoke_test.py
```

Backend requires `ANTHROPIC_API_KEY` in `backend/.env`. Optional secret env vars use the `FWUBBO_SECRET_*` prefix (e.g. `FWUBBO_SECRET_OPENWEATHERMAP_KEY`).

## Architecture

### Module System (Core Concept)

Every widget is a **module** — a four-file bundle in `backend/modules/<kebab-id>/`:

- **`manifest.json`** — Pydantic-validated schema: id, name, refresh_interval, `requires` (secret names), `permissions.network` (allowed domains), `settings` (typed form fields), widget sizing
- **`fetch.py`** — subprocess-isolated Python script; reads secrets via `os.environ.get("FWUBBO_SECRET_*")` and config via `json.loads(environ.get("FWUBBO_CONFIG", "{}"))`, prints exactly ONE JSON object `{"status": "ok"|"error", "data": {...}}`
- **`widget.tsx`** — React component `export default function Widget({ data, loading, error, lastUpdated })`, compiled in-browser by Sucrase; may only import from `react`, `lucide-react`, `recharts`; must use CSS variable classes only (never hardcode colors)
- **`config.json`** — per-instance user settings, injected into fetch.py as `FWUBBO_CONFIG` env var; password-type settings auto-promoted to `FWUBBO_SECRET_*`

**Critical constraint:** `widget.tsx` has NO direct access to `config.json`. For display-toggle settings, `fetch.py` must forward values through its `data` output, and the widget reads them from `data`.

### Backend (`backend/`)

- `main.py` — FastAPI app factory, CORS, `.env` loader, lifespan, routes
- `core/sandbox.py` — AST import scanner + subprocess executor + secret/config injection. Allowed stdlib is an explicit allowlist (json, httpx, re, datetime, zoneinfo, etc.). Subprocess runs with stripped env, 30s timeout.
- `core/module_registry.py` — module discovery + Pydantic manifest validation
- `core/stats_db.py` — SQLite usage tracking (hour/day/month windows)
- `routes/chat.py` — **primary route**: SSE streaming chat with session-to-module binding; injects fresh module source on every message; prunes old source blocks from history; force-overwrites module id in Claude's `<FWUBBO_MODULE>` output to match the session's bound module
- `routes/modules.py` — module list/fetch/stats endpoints
- `routes/saved.py` — saved widget library (copies in `backend/saved/`)
- `routes/secrets.py` — global API key CRUD backed by `backend/.env`
- `routes/settings.py` — notifications, startup, profile persisted to `backend/data/settings.json`
- `routes/generate.py` — legacy single-shot generator (not used by UI)

### Frontend (`src/`)

- `App.tsx` — root; registers built-in + backend modules, renders panels
- `types.ts` — shared TypeScript types: `ModuleManifest`, `SettingField`, `ThemeDefinition`, `WidgetProps`
- `api/client.ts` — typed fetch wrappers for all backend endpoints
- `stores/dashboard.ts` — single Zustand store: theme, layouts, modules (with `revision` counter), panels, saved widgets. **Use `getState()` for mutations inside subscriptions to avoid stack overflow.**
- `components/DynamicWidget.tsx` — in-browser Sucrase TSX compiler; cache-busted via `revision` counter (changing the React `key` forces full remount)
- `components/ChatPanel.tsx` — SSE streaming chat UI; strips `<FWUBBO_MODULE>` tags from display; handles `module_created` / `module_updated` events
- `components/WidgetCard.tsx` — glassmorphic card with error boundary and context menu
- `components/WidgetGrid.tsx` — react-grid-layout draggable grid; compares layouts before calling `setLayouts` to prevent infinite re-render
- `themes/` — 4 built-in themes (Deep Ocean, Aurora, Brutalist Terminal, Paper & Ink) defined as `ThemeDefinition` objects; CSS variables injected by `ThemeProvider.tsx`. Widgets must use only CSS variable classes.

### Streaming Chat Flow

1. Frontend POSTs to `POST /api/chat/stream` with `{ session_id, message, module_id? }`
2. Backend resolves bound module, loads current source from disk, prepends to user message
3. Old source blocks + `<FWUBBO_MODULE>` JSON pruned from history
4. Anthropic SDK streams response as SSE
5. On `<FWUBBO_MODULE>{json}</FWUBBO_MODULE>` in response: validated, pip deps installed, files written, session bound to module
6. `module_created` → frontend adds to grid; `module_updated` → bumps revision (triggers remount), no new grid entry

## Key Gotchas

- **react-grid-layout fires `onLayoutChange` on mount** — always compare before calling `setLayouts` or you get infinite re-render loops
- **Subprocess env stripping** — must propagate SSL cert vars and minimal PATH or pip imports and HTTPS fail
- **Open-Meteo geocoding** — "Atlanta, US" fails; "Atlanta" works
- **DynamicWidget caching** — clearing the component cache isn't enough; the React `key` (revision counter) must change to force remount and re-fetch source
- **LLM context must be fresh every message** — source injected only on the first message causes context loss after updates
