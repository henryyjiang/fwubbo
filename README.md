# Fwubbo

Personal AI-powered daily dashboard. Describe a widget in plain English, Claude generates the data fetcher and React component, and it appears live on your dashboard.

## Quick Start

### 1. Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate   # Windows: venv\Scripts\activate
pip install -r requirements.txt

# Set your Anthropic API key
export ANTHROPIC_API_KEY=sk-ant-...

# Start the backend
uvicorn main:app --reload --port 9120
```

### 2. Frontend

```bash
# From the project root
npm install
npm run dev
```

Open http://localhost:1420

### 3. Generate a Widget

1. Click the **+** button in the sidebar
2. Describe what you want: *"Show me the current weather in Atlanta with temperature and humidity"*
3. (Optional) Expand "Advanced options" to paste API docs or specify API key names
4. Click **Generate Widget**
5. The widget appears on your dashboard

### Setting API Keys for Modules

When a generated module needs an API key (e.g. OpenWeatherMap), set it as an environment variable before starting the backend:

```bash
export FWUBBO_SECRET_OPENWEATHERMAP_KEY=your-key-here
export FWUBBO_SECRET_FINNHUB_TOKEN=your-token-here
```

The module's manifest declares which keys it needs in `requires`. The sandbox injects these as `FWUBBO_SECRET_*` environment variables into the fetch subprocess.

## Architecture

```
fwubbo/
├── src/                          # React + Tailwind frontend (Vite)
│   ├── components/
│   │   ├── DynamicWidget.tsx     # Runtime TSX compiler (Sucrase)
│   │   ├── ModuleGeneratorPanel  # AI widget generation UI
│   │   ├── WidgetCard.tsx        # Glass card container + error boundary
│   │   ├── WidgetGrid.tsx        # Draggable grid + auto-refresh
│   │   └── Sidebar.tsx           # Theme picker + module list
│   ├── themes/                   # Theme definitions + animated backgrounds
│   ├── stores/                   # Zustand state
│   ├── api/                      # Typed backend client
│   └── widgets/                  # Built-in demo widgets
│
├── backend/                      # FastAPI Python backend
│   ├── core/
│   │   ├── sandbox.py            # AST import scanner + subprocess executor
│   │   ├── module_registry.py    # Module discovery + Pydantic validation
│   │   └── stats_db.py           # SQLite usage tracking
│   ├── routes/
│   │   ├── generate.py           # LLM module generation endpoint
│   │   ├── modules.py            # Module fetch/stats endpoints
│   │   └── secrets.py            # Keytar proxy (stub)
│   └── modules/                  # Generated modules live here
│       └── <module-id>/
│           ├── manifest.json
│           ├── fetch.py
│           ├── widget.tsx
│           └── requirements.txt  # (if extra pip deps needed)
```

## How Widget Generation Works

1. Your description → Claude (via `/api/generate/module`)
2. Claude returns JSON: `{manifest, fetch_py, widget_tsx, pip_packages}`
3. Backend validates:
   - Manifest against Pydantic schema
   - fetch.py: AST scan for forbidden imports, network domain check
   - widget.tsx: checks for `export default`, warns on hardcoded colors
4. Pip dependencies auto-installed if needed
5. Files written to `backend/modules/<id>/`
6. Frontend fetches widget.tsx source, transpiles with Sucrase in-browser
7. Component rendered with data from backend fetch cycle

## Themes

Four built-in themes with different vibes:
- **Deep Ocean** — bioluminescent particles, glassmorphic cards
- **Aurora** — shifting gradient blobs, frosted glass
- **Brutalist Terminal** — CRT scanlines, monospace, green-on-black
- **Paper & Ink** — warm editorial, serif fonts, clean borders

Themes control everything via CSS variables. Widgets never hardcode colors.
