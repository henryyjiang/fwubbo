"""Module discovery, validation, and lifecycle management."""

from pathlib import Path
from typing import Any
import json
import logging

from pydantic import BaseModel, Field

logger = logging.getLogger("fwubbo.registry")

MODULES_DIR = Path(__file__).parent.parent / "modules"


class ModulePermissions(BaseModel):
    network: list[str] = Field(default_factory=list)
    python_imports: list[str] = Field(default_factory=list)


class ApiStats(BaseModel):
    calls_per_refresh: int = 0
    llm_tokens_per_refresh: int = 0


class NotificationConfig(BaseModel):
    supported: bool = False
    default_enabled: bool = False


class WidgetSize(BaseModel):
    min_w: int = 3
    min_h: int = 2
    default_w: int = 4
    default_h: int = 2
    resizable: bool = True


class ThemeHints(BaseModel):
    supports_transparency: bool = True
    accent_regions: list[str] = Field(default_factory=list)
    animation_density: str = "subtle"  # none | subtle | full


class SettingField(BaseModel):
    key: str
    type: str = "text"  # text | number | select | toggle | password
    label: str = ""
    default: str | int | float | bool | None = None
    description: str = ""
    options: list[str] = Field(default_factory=list)  # for select type


class ModuleManifest(BaseModel):
    id: str
    name: str
    description: str = ""
    icon: str = "box"
    refresh_interval: int = 300
    fetch_timeout: float = 30.0  # seconds; increase for LLM-powered fetch scripts
    requires: list[str] = Field(default_factory=list)
    permissions: ModulePermissions = Field(default_factory=ModulePermissions)
    settings: list[SettingField] = Field(default_factory=list)
    api_stats: ApiStats = Field(default_factory=ApiStats)
    notifications: NotificationConfig = Field(default_factory=NotificationConfig)
    widget: WidgetSize = Field(default_factory=WidgetSize)
    theme_hints: ThemeHints = Field(default_factory=ThemeHints)


class LoadedModule:
    """A validated, ready-to-execute module."""

    def __init__(self, manifest: ModuleManifest, fetch_path: Path, widget_path: Path):
        self.manifest = manifest
        self.fetch_path = fetch_path  # Python fetch script
        self.widget_path = widget_path  # React component (.tsx)

    def to_dict(self) -> dict[str, Any]:
        return {
            "manifest": self.manifest.model_dump(),
            "fetch_script": str(self.fetch_path),
            "widget_component": str(self.widget_path),
        }


class ModuleRegistry:
    """Discovers and manages all installed modules."""

    def __init__(self):
        self.modules: dict[str, LoadedModule] = {}

    async def discover_modules(self):
        """Scan the modules directory for valid module packages."""
        MODULES_DIR.mkdir(parents=True, exist_ok=True)

        for module_dir in MODULES_DIR.iterdir():
            if not module_dir.is_dir():
                continue

            manifest_path = module_dir / "manifest.json"
            fetch_path = module_dir / "fetch.py"
            widget_path = module_dir / "widget.tsx"

            if not manifest_path.exists():
                logger.warning(f"Skipping {module_dir.name}: no manifest.json")
                continue

            try:
                raw = json.loads(manifest_path.read_text())
                manifest = ModuleManifest(**raw)

                if not fetch_path.exists():
                    logger.warning(f"Skipping {manifest.id}: no fetch.py")
                    continue

                if not widget_path.exists():
                    logger.warning(f"Skipping {manifest.id}: no widget.tsx")
                    continue

                self.modules[manifest.id] = LoadedModule(manifest, fetch_path, widget_path)
                logger.info(f"Loaded module: {manifest.id} ({manifest.name})")

            except Exception as e:
                logger.error(f"Failed to load {module_dir.name}: {e}")

        logger.info(f"Module discovery complete: {len(self.modules)} modules loaded")

    def get(self, module_id: str) -> LoadedModule | None:
        return self.modules.get(module_id)

    def list_manifests(self) -> list[dict[str, Any]]:
        return [m.manifest.model_dump() for m in self.modules.values()]
