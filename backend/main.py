"""Fwubbo Backend — FastAPI server for module execution and LLM integration."""

import os
from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import logging

# Load .env file if it exists (for ANTHROPIC_API_KEY and secrets)
_env_file = Path(__file__).parent / ".env"
if _env_file.exists():
    for line in _env_file.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if "=" in line:
            key, _, value = line.partition("=")
            os.environ.setdefault(key.strip(), value.strip())

from core.module_registry import ModuleRegistry
from core.stats_db import StatsDB
from routes.modules import router as modules_router
from routes.generate import router as generate_router
from routes.secrets import router as secrets_router
from routes.chat import router as chat_router
from routes.saved import router as saved_router
from routes.settings import router as settings_router
from routes.theme_chat import router as theme_chat_router
from routes.local import router as local_router

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(name)s] %(message)s")
logger = logging.getLogger("fwubbo")

# ─── Shared State ─────────────────────────────────────────────────

registry = ModuleRegistry()
stats_db = StatsDB()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup / shutdown lifecycle."""
    logger.info("Fwubbo backend starting up")
    await registry.discover_modules()
    stats_db.initialize()
    yield
    logger.info("Fwubbo backend shutting down")
    stats_db.close()


app = FastAPI(
    title="Fwubbo",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:1420", "tauri://localhost"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Inject shared state into request scope ───────────────────────

@app.middleware("http")
async def inject_state(request, call_next):
    request.state.registry = registry
    request.state.stats_db = stats_db
    return await call_next(request)


# ─── Routes ───────────────────────────────────────────────────────

app.include_router(modules_router, prefix="/api/modules", tags=["modules"])
app.include_router(generate_router, prefix="/api/generate", tags=["generate"])
app.include_router(secrets_router, prefix="/api/secrets", tags=["secrets"])
app.include_router(chat_router, prefix="/api/chat", tags=["chat"])
app.include_router(saved_router, prefix="/api/saved", tags=["saved"])
app.include_router(settings_router, prefix="/api/settings", tags=["settings"])
app.include_router(theme_chat_router, prefix="/api/theme-chat", tags=["theme-chat"])
app.include_router(local_router, prefix="/api/local", tags=["local"])


@app.get("/api/health")
async def health():
    return {
        "status": "ok",
        "modules_loaded": len(registry.modules),
    }
