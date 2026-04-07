import { create } from "zustand";
import type { WidgetLayout, ModuleFetchResult, ModuleManifest, ThemeDefinition } from "@/types";
import { DEFAULT_THEME } from "@/themes/definitions";

const GRID_COLS = 12;

function clampLayouts(layouts: WidgetLayout[]): WidgetLayout[] {
  return layouts.map((item) => {
    const minW = item.minW ?? 1;
    const minH = item.minH ?? 1;
    const w = Math.max(minW, Math.min(item.w, GRID_COLS));
    const h = Math.max(minH, item.h);
    const x = Math.max(0, Math.min(item.x, GRID_COLS - w));
    const y = Math.max(0, item.y);
    return { ...item, x, y, w, h };
  });
}

interface ModuleState {
  manifest: ModuleManifest;
  lastResult: ModuleFetchResult | null;
  loading: boolean;
  error: string | null;
  lastUpdated: string | null;
  /** Incremented when widget source code is updated — forces DynamicWidget remount */
  revision: number;
}

interface SavedWidgetState {
  manifest: ModuleManifest;
}

interface DashboardStore {
  // Theme
  themeId: string;
  setTheme: (id: string) => void;

  // Layout
  layouts: WidgetLayout[];
  setLayouts: (layouts: WidgetLayout[]) => void;

  // Modules
  modules: Record<string, ModuleState>;
  registerModule: (manifest: ModuleManifest) => void;
  removeModule: (id: string) => void;
  updateModuleData: (id: string, result: ModuleFetchResult) => void;
  setModuleLoading: (id: string, loading: boolean) => void;
  setModuleError: (id: string, error: string | null) => void;

  // Saved widgets library
  savedWidgets: Record<string, SavedWidgetState>;
  registerSavedWidget: (manifest: ModuleManifest) => void;
  removeSavedWidget: (id: string) => void;
  updateSavedWidgetName: (id: string, newName: string) => void;

  // Custom themes
  customThemes: Record<string, ThemeDefinition>;
  registerCustomTheme: (theme: ThemeDefinition) => void;
  removeCustomTheme: (id: string) => void;
  updateCustomThemeName: (id: string, newName: string) => void;

  // Panel state
  activePanel: "none" | "settings" | "add-module" | "settings-page" | "theme-chat";
  setActivePanel: (panel: "none" | "settings" | "add-module" | "settings-page" | "theme-chat") => void;
  // Info panel popup (positioned at right-click location)
  infoPanelModule: { id: string; x: number; y: number } | null;
  setInfoPanelModule: (info: { id: string; x: number; y: number } | null) => void;

  // Context menu / settings panel for a specific widget
  settingsModule: string | null;
  setSettingsModule: (id: string | null) => void;

  // Chat editing: which module to open chat pre-bound to
  editModuleId: string | null;
  setEditModuleId: (id: string | null) => void;

  // Theme editing: which theme to open theme chat pre-bound to
  editThemeId: string | null;
  setEditThemeId: (id: string | null) => void;
}

export const useDashboardStore = create<DashboardStore>((set) => ({
  themeId: localStorage.getItem("fwubbo-theme") ?? DEFAULT_THEME,
  setTheme: (id) => { localStorage.setItem("fwubbo-theme", id); set({ themeId: id }); },

  layouts: [],
  setLayouts: (layouts) => {
    const clamped = clampLayouts(layouts);
    localStorage.setItem("fwubbo-layouts", JSON.stringify(clamped));
    set({ layouts: clamped });
  },

  modules: {},
  registerModule: (manifest) =>
    set((s) => {
      const existing = s.modules[manifest.id];
      return {
        modules: {
          ...s.modules,
          [manifest.id]: existing
            ? {
                // Update: keep existing data/state, bump revision to force remount
                ...existing,
                manifest,
                revision: existing.revision + 1,
              }
            : {
                // New module
                manifest,
                lastResult: null,
                loading: false,
                error: null,
                lastUpdated: null,
                revision: 0,
              },
        },
      };
    }),
  removeModule: (id) =>
    set((s) => {
      const { [id]: _, ...rest } = s.modules;
      return {
        modules: rest,
        layouts: s.layouts.filter((l) => l.i !== id),
      };
    }),
  updateModuleData: (id, result) =>
    set((s) => ({
      modules: {
        ...s.modules,
        [id]: {
          ...s.modules[id],
          lastResult: result,
          loading: false,
          error:
            result.status === "error"
              ? ((result as any).error_message || (result as any).error || "Fetch failed")
              : null,
          lastUpdated: new Date().toISOString(),
        },
      },
    })),
  setModuleLoading: (id, loading) =>
    set((s) => ({
      modules: {
        ...s.modules,
        [id]: { ...s.modules[id], loading },
      },
    })),
  setModuleError: (id, error) =>
    set((s) => ({
      modules: {
        ...s.modules,
        [id]: { ...s.modules[id], error, loading: false },
      },
    })),

  // Saved widgets
  savedWidgets: {},
  registerSavedWidget: (manifest) =>
    set((s) => ({
      savedWidgets: {
        ...s.savedWidgets,
        [manifest.id]: { manifest },
      },
    })),
  removeSavedWidget: (id) =>
    set((s) => {
      const { [id]: _, ...rest } = s.savedWidgets;
      return { savedWidgets: rest };
    }),
  updateSavedWidgetName: (id, newName) =>
    set((s) => ({
      savedWidgets: {
        ...s.savedWidgets,
        [id]: {
          ...s.savedWidgets[id],
          manifest: { ...s.savedWidgets[id].manifest, name: newName },
        },
      },
    })),

  // Custom themes
  customThemes: {},
  registerCustomTheme: (theme) =>
    set((s) => ({
      customThemes: {
        ...s.customThemes,
        [theme.id]: theme,
      },
    })),
  removeCustomTheme: (id) =>
    set((s) => {
      const { [id]: _, ...rest } = s.customThemes;
      return {
        customThemes: rest,
        // If the deleted theme was active, switch to default
        ...(s.themeId === id ? { themeId: "paper-ink" } : {}),
      };
    }),
  updateCustomThemeName: (id, newName) =>
    set((s) => ({
      customThemes: {
        ...s.customThemes,
        [id]: { ...s.customThemes[id], name: newName },
      },
    })),

  activePanel: "none",
  setActivePanel: (panel) => set({ activePanel: panel }),
  infoPanelModule: null,
  setInfoPanelModule: (info) => set({ infoPanelModule: info }),
  settingsModule: null,
  setSettingsModule: (id) => set({ settingsModule: id }),
  editModuleId: null,
  setEditModuleId: (id) => set({ editModuleId: id }),
  editThemeId: null,
  setEditThemeId: (id) => set({ editThemeId: id }),
}));
