import React, { useEffect, useRef } from "react";
import { AnimatePresence } from "framer-motion";
import { ThemeProvider } from "@/themes/ThemeProvider";
import { useDashboardStore } from "@/stores/dashboard";
import { WidgetGrid } from "@/components/WidgetGrid";
import { Sidebar } from "@/components/Sidebar";
import { ChatPanel } from "@/components/ChatPanel";
import { ThemeChatPanel } from "@/components/ThemeChatPanel";
import { WidgetSettingsPanel } from "@/components/WidgetSettingsPanel";
import { ModuleInfoPanel } from "@/components/ModuleInfoPanel";
import { SettingsPanel } from "@/components/SettingsPanel";
import { listModules, listCustomThemes } from "@/api/client";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import type { ModuleManifest, ThemeDefinition, WidgetLayout } from "@/types";

// System Status is the only remaining built-in widget (no backend needed)
const BUILTIN_MODULES: ModuleManifest[] = [
  {
    id: "demo-status",
    name: "System Status",
    icon: "activity",
    refresh_interval: 30,
    requires: [],
    permissions: { network: [] },
    api_stats: { calls_per_refresh: 0, llm_tokens_per_refresh: 0 },
    notifications: { supported: false, default_enabled: false },
    widget: { min_w: 3, min_h: 2, default_w: 4, default_h: 3, resizable: true },
    theme_hints: { supports_transparency: true, animation_density: "subtle" },
  },
];

const BUILTIN_LAYOUTS = [
  { i: "demo-status", x: 0, y: 0, w: 4, h: 3, minW: 3, minH: 2 },
];

export default function App() {
  const { themeId, registerModule, setLayouts, activePanel, setActivePanel, setEditModuleId, setEditThemeId, registerCustomTheme } =
    useDashboardStore();

  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    // Load persisted layout positions once — used throughout init to restore
    // user-customised sizes and positions rather than always using manifest defaults.
    const persistedLayouts: WidgetLayout[] = JSON.parse(localStorage.getItem("fwubbo-layouts") ?? "[]");
    const persistedMap = new Map(persistedLayouts.map((l) => [l.i, l]));
    const withPersisted = (defaults: typeof BUILTIN_LAYOUTS) =>
      defaults.map((l) => (persistedMap.get(l.i) as typeof l) ?? l);

    // Register built-in widgets
    for (const m of BUILTIN_MODULES) {
      registerModule(m);
    }
    setLayouts(withPersisted(BUILTIN_LAYOUTS));

    // Load custom themes
    listCustomThemes()
      .then(({ themes }) => {
        for (const raw of themes) {
          registerCustomTheme(raw as unknown as ThemeDefinition);
        }
      })
      .catch(() => {
        // Backend not reachable — no custom themes
      });

    // Load backend modules with retry — the backend subprocess takes a few
    // seconds to start, so the first attempt often fails when launching from
    // the .app bundle or via autostart.
    const tryLoadModules = (attempt: number) => {
      listModules()
        .then(({ modules: backendModules }) => {
          if (!backendModules || backendModules.length === 0) return;

          let nextY = BUILTIN_LAYOUTS.reduce((max, l) => Math.max(max, l.y + l.h), 0);
          const extraLayouts: typeof BUILTIN_LAYOUTS = [];

          for (const raw of backendModules) {
            const manifest = raw as unknown as ModuleManifest;
            if (BUILTIN_MODULES.some((d) => d.id === manifest.id)) continue;

            registerModule(manifest);
            const defaultLayout = {
              i: manifest.id,
              x: (extraLayouts.length * 4) % 12,
              y: nextY + Math.floor((extraLayouts.length * 4) / 12) * 3,
              w: manifest.widget?.default_w ?? 4,
              h: manifest.widget?.default_h ?? 3,
              minW: manifest.widget?.min_w ?? 3,
              minH: manifest.widget?.min_h ?? 2,
            };
            extraLayouts.push((persistedMap.get(manifest.id) as typeof defaultLayout) ?? defaultLayout);
          }

          if (extraLayouts.length > 0) {
            setLayouts([...withPersisted(BUILTIN_LAYOUTS), ...extraLayouts]);
          }
        })
        .catch(() => {
          // Backend not ready yet — retry with linear backoff, up to ~30 s total.
          if (attempt < 9) {
            setTimeout(() => tryLoadModules(attempt + 1), 1500 * (attempt + 1));
          } else {
            console.log("[fwubbo] Backend not reachable after retries — running with built-in widgets only");
          }
        });
    };
    tryLoadModules(0);
  }, [registerModule, setLayouts]);

  return (
    <ThemeProvider themeId={themeId}>
      <div className="min-h-screen font-body text-text-primary">
        <Sidebar />
        <main className="pl-14 min-h-screen">
          <WidgetGrid />
        </main>

        <AnimatePresence>
          {activePanel === "add-module" && (
            <ChatPanel onClose={() => {
              setEditModuleId(null);
              setActivePanel("none");
            }} />
          )}
        </AnimatePresence>

        <AnimatePresence>
          {activePanel === "theme-chat" && (
            <ThemeChatPanel onClose={() => {
              setEditThemeId(null);
              setActivePanel("none");
            }} />
          )}
        </AnimatePresence>

        <AnimatePresence>
          {activePanel === "settings-page" && (
            <SettingsPanel onClose={() => setActivePanel("none")} />
          )}
        </AnimatePresence>

        <AnimatePresence>
          <WidgetSettingsPanel />
        </AnimatePresence>

        <AnimatePresence>
          <ModuleInfoPanel />
        </AnimatePresence>

        <ConfirmDialog />
      </div>
    </ThemeProvider>
  );
}

