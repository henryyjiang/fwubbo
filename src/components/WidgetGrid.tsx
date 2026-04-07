import React, { useCallback, useEffect, useRef, useState } from "react";
import GridLayout from "react-grid-layout";
import { AnimatePresence } from "framer-motion";
import { useDashboardStore } from "@/stores/dashboard";
import { WidgetCard } from "./WidgetCard";
import { DynamicWidget } from "./DynamicWidget";
import { WidgetContextMenu } from "./WidgetContextMenu";
import { DemoStatusWidget } from "@/widgets/DemoStatus";
import { sendNotification, restartBackend, isTauri } from "@/tauri/bridge";
import { listModules, listCustomThemes, getSettings } from "@/api/client";
import type { ModuleManifest, ThemeDefinition } from "@/types";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";

const API_BASE = "http://localhost:9120";
const GRID_COLS = 12;

/** Clamp a layout item so it never exceeds the grid boundaries. */
function clampLayoutItem<T extends { x: number; y: number; w: number; h: number; minW?: number; minH?: number }>(item: T): T {
  const minW = item.minW ?? 1;
  const minH = item.minH ?? 1;
  const w = Math.max(minW, Math.min(item.w, GRID_COLS));
  const h = Math.max(minH, item.h);
  const x = Math.max(0, Math.min(item.x, GRID_COLS - w));
  const y = Math.max(0, item.y);
  return { ...item, x, y, w, h };
}

function clampLayouts<T extends { x: number; y: number; w: number; h: number; minW?: number; minH?: number }>(layouts: T[]): T[] {
  return layouts.map(clampLayoutItem);
}


const BUILTIN_WIDGETS: Record<string, React.FC<{ data: Record<string, unknown> | null }>> = {
  "demo-status": DemoStatusWidget,
};

export function WidgetGrid() {
  const layouts = useDashboardStore((s) => s.layouts);
  const setLayouts = useDashboardStore((s) => s.setLayouts);
  const modules = useDashboardStore((s) => s.modules);
  const updateModuleData = useDashboardStore((s) => s.updateModuleData);
  const setModuleLoading = useDashboardStore((s) => s.setModuleLoading);
  const setModuleError = useDashboardStore((s) => s.setModuleError);

  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(1200);

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    moduleId: string;
  } | null>(null);

  // Track intervals and initialization state outside of React to avoid loops
  const intervalsRef = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map());
  const initializedModulesRef = useRef<Set<string>>(new Set());
  const backendAliveRef = useRef<boolean | null>(null);
  const lastLayoutJsonRef = useRef("");
  const notificationsEnabledRef = useRef<boolean>(true);

  // Load notification settings once on mount
  useEffect(() => {
    getSettings()
      .then(({ settings }) => {
        const notifSettings = settings.notifications as { enabled?: boolean } | undefined;
        notificationsEnabledRef.current = notifSettings?.enabled !== false;
      })
      .catch(() => { /* keep default true */ });
  }, []);

  // ── Container width measurement ──────────────────────────────
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(Math.floor(entry.contentRect.width));
      }
    });
    observer.observe(el);
    setContainerWidth(el.clientWidth);
    return () => observer.disconnect();
  }, []);

  // ── Fetch a single module's data ─────────────────────────────
  // This function does NOT trigger store subscriptions that could
  // re-invoke itself. It reads/writes state directly.
  const fetchModuleData = useCallback(
    async (moduleId: string) => {
      if (backendAliveRef.current === false) return;

      // Use getState() instead of the reactive hook to avoid re-render loops
      const store = useDashboardStore.getState();
      store.setModuleLoading(moduleId, true);

      try {
        const res = await fetch(`${API_BASE}/api/modules/${moduleId}/fetch`, {
          method: "POST",
          signal: AbortSignal.timeout(15000),
        });
        if (!res.ok) {
          useDashboardStore.getState().setModuleError(moduleId, `Fetch failed: ${res.status}`);
          return;
        }
        backendAliveRef.current = true;
        const result = await res.json();
        useDashboardStore.getState().updateModuleData(moduleId, result);

        // Dispatch native notifications if the module returned any and notifications are enabled
        if (notificationsEnabledRef.current && result.notifications && Array.isArray(result.notifications)) {
          for (const n of result.notifications) {
            const body = n.body || n.message;
            if (n.title && body) {
              sendNotification(n.title, body).catch(() => {});
            }
          }
        }
      } catch {
        backendAliveRef.current = false;
        useDashboardStore.getState().setModuleError(moduleId, "Backend unreachable");
        setTimeout(() => { backendAliveRef.current = null; }, 30000);
      }
    },
    [] // No dependencies — uses getState() directly
  );

  // ── Reload all backend modules (used by System Status refresh) ──
  const reloadAllModules = useCallback(async () => {
    const store = useDashboardStore.getState();

    // If backend appears down and we're in Tauri, attempt a restart.
    if (backendAliveRef.current === false && isTauri()) {
      try {
        await restartBackend();
        await new Promise((r) => setTimeout(r, 3000));
      } catch { /* ignore */ }
    }

    // Reload custom themes (non-critical).
    try {
      const { themes } = await listCustomThemes();
      for (const raw of themes) {
        store.registerCustomTheme(raw as unknown as ThemeDefinition);
      }
    } catch { /* ignore */ }

    // Reload modules and add any new ones to the grid.
    try {
      const { modules: backendModules } = await listModules();
      if (!backendModules || backendModules.length === 0) return;

      const currentLayouts = store.layouts;
      const layoutIds = new Set(currentLayouts.map((l) => l.i));
      let nextY = currentLayouts.reduce((max, l) => Math.max(max, l.y + l.h), 0);
      const newLayouts: typeof currentLayouts = [];

      for (const raw of backendModules) {
        const manifest = raw as unknown as ModuleManifest;
        if (BUILTIN_WIDGETS[manifest.id]) continue;
        store.registerModule(manifest);
        if (!layoutIds.has(manifest.id)) {
          newLayouts.push({
            i: manifest.id,
            x: (newLayouts.length * 4) % 12,
            y: nextY + Math.floor((newLayouts.length * 4) / 12) * 3,
            w: manifest.widget?.default_w ?? 4,
            h: manifest.widget?.default_h ?? 3,
            minW: manifest.widget?.min_w ?? 3,
            minH: manifest.widget?.min_h ?? 2,
          });
        }
      }

      if (newLayouts.length > 0) {
        store.setLayouts(clampLayouts([...currentLayouts, ...newLayouts]));
      }
      backendAliveRef.current = true;
    } catch {
      backendAliveRef.current = false;
    }
  }, []); // uses getState() — no reactive deps needed

  // ── Set up fetch intervals for non-builtin modules ───────────
  // This effect depends on `modules` but does NOT call any store
  // setters synchronously — only the async fetchModuleData does,
  // and it uses getState() to avoid the subscription loop.
  useEffect(() => {
    const intervals = intervalsRef.current;
    const initialized = initializedModulesRef.current;

    for (const [id, mod] of Object.entries(modules)) {
      if (BUILTIN_WIDGETS[id]) continue;
      if (initialized.has(id)) continue;

      // Mark as initialized BEFORE fetching to prevent re-entry
      initialized.add(id);

      // Initial fetch (async, won't block or cause sync store updates)
      fetchModuleData(id);

      // Periodic refresh
      const intervalMs = Math.max(mod.manifest.refresh_interval * 1000, 30000);
      const handle = setInterval(() => fetchModuleData(id), intervalMs);
      intervals.set(id, handle);
    }

    // Clean up removed modules
    for (const [id, handle] of intervals.entries()) {
      if (!modules[id]) {
        clearInterval(handle);
        intervals.delete(id);
        initialized.delete(id);
      }
    }
  }, [modules, fetchModuleData]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      for (const handle of intervalsRef.current.values()) {
        clearInterval(handle);
      }
      intervalsRef.current.clear();
    };
  }, []);

  // ── Layout change handler (loop-safe) ────────────────────────
  const handleLayoutChange = useCallback(
    (newLayout: GridLayout.Layout[]) => {
      const json = JSON.stringify(
        newLayout.map((l) => `${l.i}:${l.x},${l.y},${l.w},${l.h}`)
      );
      if (json === lastLayoutJsonRef.current) return;
      lastLayoutJsonRef.current = json;

      setLayouts(
        clampLayouts(
          newLayout.map((l) => ({
            i: l.i, x: l.x, y: l.y, w: l.w, h: l.h,
            minW: l.minW, minH: l.minH,
          }))
        )
      );
    },
    [setLayouts]
  );

  const moduleEntries = Object.values(modules);

  if (moduleEntries.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center space-y-3">
          <p className="text-text-muted text-lg font-display">No modules loaded</p>
          <p className="text-text-muted text-sm">Click + in the sidebar to add a module</p>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="w-full">
      {containerWidth > 0 && (
        <GridLayout
          className="layout"
          layout={layouts}
          cols={12}
          rowHeight={80}
          width={containerWidth}
          onLayoutChange={handleLayoutChange}
          compactType="vertical"
          margin={[16, 16]}
          containerPadding={[16, 16]}
          useCSSTransforms
          isDraggable
          isResizable
          draggableCancel=".no-drag"
        >
          {moduleEntries.map((mod) => {
            const isBuiltin = !!BUILTIN_WIDGETS[mod.manifest.id];
            const BuiltinComponent = BUILTIN_WIDGETS[mod.manifest.id];

            const status = mod.loading
              ? ("loading" as const)
              : mod.error
              ? ("error" as const)
              : mod.lastResult
              ? ("online" as const)
              : isBuiltin
              ? ("online" as const)
              : ("offline-no-cache" as const);

            return (
              <div key={mod.manifest.id}>
                <WidgetCard
                  moduleId={mod.manifest.id}
                  title={mod.manifest.name}
                  icon={mod.manifest.icon}
                  status={status}
                  onRefresh={
                    isBuiltin
                      ? mod.manifest.id === "demo-status" ? reloadAllModules : undefined
                      : () => fetchModuleData(mod.manifest.id)
                  }
                  onContextMenu={(e) =>
                    setContextMenu({
                      x: e.clientX,
                      y: e.clientY,
                      moduleId: mod.manifest.id,
                    })
                  }
                >
                  {isBuiltin && BuiltinComponent ? (
                    <BuiltinComponent data={mod.lastResult?.data ?? null} />
                  ) : (
                    <DynamicWidget
                      key={`${mod.manifest.id}-rev${mod.revision}`}
                      moduleId={mod.manifest.id}
                      data={mod.lastResult?.data ?? null}
                      loading={mod.loading}
                      error={mod.error}
                      lastUpdated={mod.lastUpdated}
                    />
                  )}
                </WidgetCard>
              </div>
            );
          })}
        </GridLayout>
      )}

      {/* Context Menu Portal */}
      <AnimatePresence>
        {contextMenu && (
          <WidgetContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            moduleId={contextMenu.moduleId}
            onClose={() => setContextMenu(null)}
            onRefresh={
              BUILTIN_WIDGETS[contextMenu.moduleId]
                ? undefined
                : () => fetchModuleData(contextMenu.moduleId)
            }
          />
        )}
      </AnimatePresence>
    </div>
  );
}
