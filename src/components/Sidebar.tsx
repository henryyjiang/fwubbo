import React, { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Palette,
  Plus,
  Settings,
  ChevronLeft,
  Layers,
  Bookmark,
  PlusCircle,
  Copy,
  Trash2,
  Edit2,
  Edit3,
} from "lucide-react";
import { useDashboardStore } from "@/stores/dashboard";
import { THEMES } from "@/themes/definitions";
import {
  listSavedWidgets,
  addSavedWidget,
  duplicateSavedWidget,
  deleteSavedWidget,
  renameSavedWidget,
  renameCustomTheme,
  duplicateCustomTheme,
  deleteCustomTheme,
} from "@/api/client";
import type { ModuleManifest, ThemeDefinition } from "@/types";
import { appConfirm } from "./ConfirmDialog";

type SidebarTab = "themes" | "saved";

export function Sidebar() {
  const {
    themeId,
    setTheme,
    activePanel,
    setActivePanel,
    modules,
    savedWidgets,
    registerSavedWidget,
    removeSavedWidget,
    updateSavedWidgetName,
    registerModule,
    layouts,
    setLayouts,
    customThemes,
    registerCustomTheme,
    removeCustomTheme,
    updateCustomThemeName,
    setEditThemeId,
  } = useDashboardStore();

  const [expanded, setExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<SidebarTab>("themes");

  // Context menu for saved widgets
  const [savedCtx, setSavedCtx] = useState<{
    x: number;
    y: number;
    savedId: string;
  } | null>(null);

  // Context menu for themes (custom only)
  const [themeCtx, setThemeCtx] = useState<{
    x: number;
    y: number;
    themeId: string;
  } | null>(null);

  // Inline rename state for saved widgets
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  // Inline rename state for themes
  const [renamingThemeId, setRenamingThemeId] = useState<string | null>(null);
  const [renameThemeValue, setRenameThemeValue] = useState("");

  const togglePanel = (panel: "add-module" | "settings") => {
    setActivePanel(activePanel === panel ? "none" : panel);
  };

  // Load saved widgets on mount
  useEffect(() => {
    listSavedWidgets()
      .then(({ saved }) => {
        for (const raw of saved) {
          registerSavedWidget(raw as unknown as ModuleManifest);
        }
      })
      .catch(() => {});
  }, [registerSavedWidget]);

  // ── Saved widget handlers ─────────────────────────────────────

  const handleAddSaved = useCallback(
    async (savedId: string) => {
      try {
        const result = await addSavedWidget(savedId);
        const manifest = result.manifest as unknown as ModuleManifest;
        registerModule(manifest);

        const currentLayouts = useDashboardStore.getState().layouts;
        const nextY = currentLayouts.reduce(
          (max, l) => Math.max(max, l.y + l.h),
          0
        );
        setLayouts([
          ...currentLayouts,
          {
            i: manifest.id,
            x: 0,
            y: nextY,
            w: manifest.widget?.default_w ?? 4,
            h: manifest.widget?.default_h ?? 3,
            minW: manifest.widget?.min_w ?? 3,
            minH: manifest.widget?.min_h ?? 2,
          },
        ]);
      } catch (err) {
        console.error("Failed to add saved widget:", err);
      }
      setSavedCtx(null);
    },
    [registerModule, setLayouts]
  );

  const handleDuplicateSaved = useCallback(
    async (savedId: string) => {
      try {
        const result = await duplicateSavedWidget(savedId);
        const manifest = result.manifest as unknown as ModuleManifest;
        registerSavedWidget(manifest);
      } catch (err) {
        console.error("Failed to duplicate saved widget:", err);
      }
      setSavedCtx(null);
    },
    [registerSavedWidget]
  );

  const handleDeleteSaved = useCallback(
    async (savedId: string) => {
      try {
        await deleteSavedWidget(savedId);
        removeSavedWidget(savedId);
      } catch (err) {
        console.error("Failed to delete saved widget:", err);
      }
      setSavedCtx(null);
    },
    [removeSavedWidget]
  );

  const handleStartRename = useCallback(
    (savedId: string) => {
      const name = savedWidgets[savedId]?.manifest.name ?? savedId;
      setRenamingId(savedId);
      setRenameValue(name);
      setSavedCtx(null);
    },
    [savedWidgets]
  );

  const handleCommitRename = useCallback(
    async (savedId: string) => {
      const trimmed = renameValue.trim();
      if (!trimmed || trimmed === savedWidgets[savedId]?.manifest.name) {
        setRenamingId(null);
        return;
      }
      try {
        await renameSavedWidget(savedId, trimmed);
        updateSavedWidgetName(savedId, trimmed);
      } catch (err) {
        console.error("Failed to rename saved widget:", err);
      }
      setRenamingId(null);
    },
    [renameValue, savedWidgets, updateSavedWidgetName]
  );

  // ── Theme handlers ────────────────────────────────────────────

  const handleEditTheme = useCallback(
    (id: string) => {
      setEditThemeId(id);
      setActivePanel("theme-chat");
      setThemeCtx(null);
    },
    [setEditThemeId, setActivePanel]
  );

  const handleDuplicateTheme = useCallback(
    async (id: string) => {
      try {
        const result = await duplicateCustomTheme(id);
        registerCustomTheme(result.theme as unknown as ThemeDefinition);
      } catch (err) {
        console.error("Failed to duplicate theme:", err);
      }
      setThemeCtx(null);
    },
    [registerCustomTheme]
  );

  const handleDeleteTheme = useCallback(
    async (id: string) => {
      try {
        await deleteCustomTheme(id);
        removeCustomTheme(id);
      } catch (err) {
        console.error("Failed to delete theme:", err);
      }
      setThemeCtx(null);
    },
    [removeCustomTheme]
  );

  const handleStartThemeRename = useCallback(
    (id: string) => {
      const name = customThemes[id]?.name ?? id;
      setRenamingThemeId(id);
      setRenameThemeValue(name);
      setThemeCtx(null);
    },
    [customThemes]
  );

  const handleCommitThemeRename = useCallback(
    async (id: string) => {
      const trimmed = renameThemeValue.trim();
      if (!trimmed || trimmed === customThemes[id]?.name) {
        setRenamingThemeId(null);
        return;
      }
      try {
        await renameCustomTheme(id, trimmed);
        updateCustomThemeName(id, trimmed);
      } catch (err) {
        console.error("Failed to rename theme:", err);
      }
      setRenamingThemeId(null);
    },
    [renameThemeValue, customThemes, updateCustomThemeName]
  );

  const handleCreateTheme = useCallback(() => {
    setEditThemeId(null);
    setActivePanel("theme-chat");
  }, [setEditThemeId, setActivePanel]);

  // Merge built-in + custom themes
  const allThemes = { ...THEMES, ...customThemes };
  const isCustomTheme = (id: string) => id in customThemes;

  return (
    <motion.aside
      className="fixed left-0 top-0 h-full z-50 flex"
      initial={false}
      animate={{ width: expanded ? 280 : 56 }}
      transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
    >
      {/* Icon rail */}
      <div
        className="w-14 h-full flex flex-col items-center py-4 gap-2 shrink-0"
        style={{
          background: "var(--surface-base)",
          borderRight: "1px solid var(--border-subtle)",
        }}
      >
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-9 h-9 rounded-lg flex items-center justify-center hover:bg-surface-overlay transition-colors mb-4"
          style={{ color: "var(--accent-primary)" }}
          title={expanded ? "Collapse sidebar" : "Expand sidebar"}
        >
          {expanded ? (
            <ChevronLeft className="w-5 h-5" />
          ) : (
            <Layers className="w-5 h-5" />
          )}
        </button>

        <SidebarButton
          icon={<Plus className="w-[18px] h-[18px]" />}
          active={activePanel === "add-module"}
          onClick={() => togglePanel("add-module")}
          title="Add Module"
        />

        <SidebarButton
          icon={<Bookmark className="w-[18px] h-[18px]" />}
          active={expanded && activeTab === "saved"}
          onClick={() => {
            setActiveTab("saved");
            if (!expanded) setExpanded(true);
          }}
          title="Saved Widgets"
        />

        <SidebarButton
          icon={<Palette className="w-[18px] h-[18px]" />}
          active={expanded && activeTab === "themes"}
          onClick={() => {
            setActiveTab("themes");
            if (!expanded) setExpanded(true);
          }}
          title="Themes"
        />

        <div className="flex-1" />

        <SidebarButton
          icon={<Settings className="w-[18px] h-[18px]" />}
          active={activePanel === "settings-page"}
          onClick={() => {
            setActivePanel(activePanel === "settings-page" ? "none" : "settings-page");
          }}
          title="Settings"
        />
      </div>

      {/* Expanded panel */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2 }}
            className="flex-1 overflow-y-auto py-4 px-3"
            style={{
              background: "var(--surface-raised)",
              borderRight: "1px solid var(--border-subtle)",
            }}
          >
            {activeTab === "themes" && (
              <div>
                {/* Header with + button */}
                <div className="flex items-center justify-between mb-3 px-1">
                  <h4
                    className="text-[11px] uppercase tracking-widest"
                    style={{ color: "var(--text-muted)" }}
                  >
                    Themes
                  </h4>
                  <button
                    onClick={handleCreateTheme}
                    className="w-5 h-5 rounded flex items-center justify-center transition-colors hover:bg-surface-overlay"
                    style={{ color: "var(--accent-primary)" }}
                    title="Create custom theme"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="space-y-1.5">
                  {Object.values(allThemes).map((t) => (
                    <div
                      key={t.id}
                      className="group"
                      onContextMenu={(e) => {
                        if (!isCustomTheme(t.id)) return;
                        e.preventDefault();
                        if (renamingThemeId) return;
                        setThemeCtx({
                          x: e.clientX,
                          y: e.clientY,
                          themeId: t.id,
                        });
                      }}
                    >
                      <button
                        onClick={() => setTheme(t.id)}
                        className="w-full text-left px-3 py-2 rounded-lg text-sm transition-all"
                        style={{
                          background:
                            themeId === t.id
                              ? "var(--accent-primary, #00e5ff)" + "22"
                              : "transparent",
                          color:
                            themeId === t.id
                              ? "var(--accent-primary)"
                              : "var(--text-secondary)",
                        }}
                      >
                        <div className="flex items-center gap-1.5">
                          {renamingThemeId === t.id ? (
                            <input
                              autoFocus
                              className="flex-1 bg-transparent border rounded px-1 py-0.5 text-sm font-medium outline-none"
                              style={{
                                color: "var(--text-primary)",
                                borderColor: "var(--accent-primary)",
                              }}
                              value={renameThemeValue}
                              onChange={(e) => setRenameThemeValue(e.target.value)}
                              onKeyDown={(e) => {
                                e.stopPropagation();
                                if (e.key === "Enter") handleCommitThemeRename(t.id);
                                if (e.key === "Escape") setRenamingThemeId(null);
                              }}
                              onBlur={() => handleCommitThemeRename(t.id)}
                              onClick={(e) => e.stopPropagation()}
                            />
                          ) : (
                            <div className="font-medium flex-1">{t.name}</div>
                          )}
                          {isCustomTheme(t.id) && renamingThemeId !== t.id && (
                            <span
                              className="text-[9px] px-1.5 py-0.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                              style={{
                                background: "var(--accent-primary)",
                                color: "var(--surface-base)",
                              }}
                            >
                              Custom
                            </span>
                          )}
                        </div>
                        {renamingThemeId !== t.id && (
                          <div
                            className="text-[11px] mt-0.5"
                            style={{ color: "var(--text-muted)" }}
                          >
                            {t.description}
                          </div>
                        )}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeTab === "saved" && (
              <div>
                <h4
                  className="text-[11px] uppercase tracking-widest mb-3 px-1"
                  style={{ color: "var(--text-muted)" }}
                >
                  Saved Widgets ({Object.keys(savedWidgets).length})
                </h4>

                {Object.keys(savedWidgets).length === 0 ? (
                  <div
                    className="px-3 py-6 text-center text-sm"
                    style={{ color: "var(--text-muted)" }}
                  >
                    <Bookmark
                      className="w-8 h-8 mx-auto mb-2"
                      style={{ opacity: 0.4 }}
                    />
                    <p>No saved widgets yet</p>
                    <p className="text-[11px] mt-1">
                      Right-click a widget → Save Widget
                    </p>
                  </div>
                ) : (
                  <div className="space-y-1">
                    {Object.values(savedWidgets).map((sw) => (
                      <div
                        key={sw.manifest.id}
                        className="px-3 py-2 rounded-lg text-sm transition-colors cursor-context-menu group"
                        style={{ color: "var(--text-secondary)" }}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          if (renamingId) return;
                          setSavedCtx({
                            x: e.clientX,
                            y: e.clientY,
                            savedId: sw.manifest.id,
                          });
                        }}
                      >
                        <div className="flex items-center justify-between">
                          {renamingId === sw.manifest.id ? (
                            <input
                              autoFocus
                              className="flex-1 bg-transparent border rounded px-1 py-0.5 text-sm font-medium outline-none"
                              style={{
                                color: "var(--text-primary)",
                                borderColor: "var(--accent-primary)",
                              }}
                              value={renameValue}
                              onChange={(e) => setRenameValue(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") handleCommitRename(sw.manifest.id);
                                if (e.key === "Escape") setRenamingId(null);
                              }}
                              onBlur={() => handleCommitRename(sw.manifest.id)}
                            />
                          ) : (
                            <div className="font-medium truncate flex-1">
                              {sw.manifest.name}
                            </div>
                          )}
                          {renamingId !== sw.manifest.id && (
                            <button
                              className="opacity-0 group-hover:opacity-100 transition-opacity ml-2 p-0.5 rounded hover:bg-surface-overlay"
                              style={{ color: "var(--accent-primary)" }}
                              title="Add to dashboard"
                              onClick={() => handleAddSaved(sw.manifest.id)}
                            >
                              <PlusCircle className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                        {sw.manifest.description && renamingId !== sw.manifest.id && (
                          <div
                            className="text-[11px] mt-0.5 truncate"
                            style={{ color: "var(--text-muted)" }}
                          >
                            {sw.manifest.description}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Saved widget context menu */}
      <AnimatePresence>
        {savedCtx && (
          <SavedWidgetContextMenu
            x={savedCtx.x}
            y={savedCtx.y}
            savedId={savedCtx.savedId}
            savedName={
              savedWidgets[savedCtx.savedId]?.manifest.name ?? savedCtx.savedId
            }
            onClose={() => setSavedCtx(null)}
            onAdd={handleAddSaved}
            onDuplicate={handleDuplicateSaved}
            onDelete={handleDeleteSaved}
            onRename={handleStartRename}
          />
        )}
      </AnimatePresence>

      {/* Theme context menu (custom themes only) */}
      <AnimatePresence>
        {themeCtx && (
          <ThemeContextMenu
            x={themeCtx.x}
            y={themeCtx.y}
            themeId={themeCtx.themeId}
            themeName={customThemes[themeCtx.themeId]?.name ?? themeCtx.themeId}
            onClose={() => setThemeCtx(null)}
            onEdit={handleEditTheme}
            onRename={handleStartThemeRename}
            onDuplicate={handleDuplicateTheme}
            onDelete={handleDeleteTheme}
          />
        )}
      </AnimatePresence>
    </motion.aside>
  );
}

// ── Theme Context Menu ─────────────────────────────────────────

function ThemeContextMenu({
  x,
  y,
  themeId,
  themeName,
  onClose,
  onEdit,
  onRename,
  onDuplicate,
  onDelete,
}: {
  x: number;
  y: number;
  themeId: string;
  themeName: string;
  onClose: () => void;
  onEdit: (id: string) => void;
  onRename: (id: string) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  useEffect(() => {
    const handleClick = () => onClose();
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const timer = setTimeout(() => {
      document.addEventListener("click", handleClick);
      document.addEventListener("contextmenu", handleClick);
      document.addEventListener("keydown", handleKey);
    }, 50);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("click", handleClick);
      document.removeEventListener("contextmenu", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [onClose]);

  const [position, setPosition] = useState({ x, y });
  useEffect(() => {
    const menuWidth = 190;
    const menuHeight = 200;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    setPosition({
      x: Math.min(x, vw - menuWidth - 8),
      y: Math.min(y, vh - menuHeight - 8),
    });
  }, [x, y]);

  const items = [
    {
      icon: <Edit3 className="w-3.5 h-3.5" />,
      label: "Edit Theme",
      onClick: () => onEdit(themeId),
    },
    {
      icon: <Edit2 className="w-3.5 h-3.5" />,
      label: "Rename",
      onClick: () => onRename(themeId),
    },
    {
      icon: <Copy className="w-3.5 h-3.5" />,
      label: "Duplicate",
      onClick: () => onDuplicate(themeId),
    },
    {
      icon: <Trash2 className="w-3.5 h-3.5" />,
      label: "Delete Theme",
      onClick: async () => {
        if (await appConfirm(`Delete theme "${themeName}"? This cannot be undone.`)) {
          onDelete(themeId);
        } else {
          onClose();
        }
      },
      danger: true,
    },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.92 }}
      transition={{ duration: 0.12 }}
      className="fixed z-[200] rounded-xl overflow-hidden py-1.5"
      style={{
        left: position.x,
        top: position.y,
        background: "var(--surface-raised)",
        border: "1px solid var(--border-subtle)",
        boxShadow: "0 8px 32px rgba(0,0,0,0.25), 0 2px 8px rgba(0,0,0,0.15)",
        minWidth: 180,
      }}
    >
      <div className="px-3 py-1.5 border-b border-border-subtle">
        <p className="text-[11px] text-text-muted font-mono truncate">
          {themeName}
        </p>
      </div>

      {items.map((item, i) => (
        <button
          key={i}
          onClick={item.onClick}
          className="w-full flex items-center gap-2.5 px-3 py-2 text-sm transition-colors"
          style={{
            color: (item as any).danger
              ? "var(--status-error)"
              : "var(--text-secondary)",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "var(--surface-overlay)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "transparent";
          }}
        >
          {item.icon}
          {item.label}
        </button>
      ))}
    </motion.div>
  );
}

// ── Saved Widget Context Menu ──────────────────────────────────

function SavedWidgetContextMenu({
  x,
  y,
  savedId,
  savedName,
  onClose,
  onAdd,
  onDuplicate,
  onDelete,
  onRename,
}: {
  x: number;
  y: number;
  savedId: string;
  savedName: string;
  onClose: () => void;
  onAdd: (id: string) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  onRename: (id: string) => void;
}) {
  useEffect(() => {
    const handleClick = () => onClose();
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const timer = setTimeout(() => {
      document.addEventListener("click", handleClick);
      document.addEventListener("contextmenu", handleClick);
      document.addEventListener("keydown", handleKey);
    }, 50);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("click", handleClick);
      document.removeEventListener("contextmenu", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [onClose]);

  const [position, setPosition] = useState({ x, y });
  useEffect(() => {
    const menuWidth = 190;
    const menuHeight = 190;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    setPosition({
      x: Math.min(x, vw - menuWidth - 8),
      y: Math.min(y, vh - menuHeight - 8),
    });
  }, [x, y]);

  const items = [
    {
      icon: <PlusCircle className="w-3.5 h-3.5" />,
      label: "Add Widget",
      onClick: () => onAdd(savedId),
    },
    {
      icon: <Edit2 className="w-3.5 h-3.5" />,
      label: "Rename",
      onClick: () => onRename(savedId),
    },
    {
      icon: <Copy className="w-3.5 h-3.5" />,
      label: "Duplicate Widget",
      onClick: () => onDuplicate(savedId),
    },
    {
      icon: <Trash2 className="w-3.5 h-3.5" />,
      label: "Delete Widget",
      onClick: async () => {
        if (await appConfirm(`Delete saved widget "${savedName}"? This cannot be undone.`)) {
          onDelete(savedId);
        } else {
          onClose();
        }
      },
      danger: true,
    },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.92 }}
      transition={{ duration: 0.12 }}
      className="fixed z-[200] rounded-xl overflow-hidden py-1.5"
      style={{
        left: position.x,
        top: position.y,
        background: "var(--surface-raised)",
        border: "1px solid var(--border-subtle)",
        boxShadow: "0 8px 32px rgba(0,0,0,0.25), 0 2px 8px rgba(0,0,0,0.15)",
        minWidth: 180,
      }}
    >
      <div className="px-3 py-1.5 border-b border-border-subtle">
        <p className="text-[11px] text-text-muted font-mono truncate">
          {savedName}
        </p>
      </div>

      {items.map((item, i) => (
        <button
          key={i}
          onClick={item.onClick}
          className="w-full flex items-center gap-2.5 px-3 py-2 text-sm transition-colors"
          style={{
            color: (item as any).danger
              ? "var(--status-error)"
              : "var(--text-secondary)",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "var(--surface-overlay)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "transparent";
          }}
        >
          {item.icon}
          {item.label}
        </button>
      ))}
    </motion.div>
  );
}

// ── Sidebar Button ─────────────────────────────────────────────

function SidebarButton({
  icon,
  active,
  onClick,
  title,
}: {
  icon: React.ReactNode;
  active: boolean;
  onClick: () => void;
  title: string;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="w-9 h-9 rounded-lg flex items-center justify-center transition-all"
      style={{
        background: active ? "var(--accent-primary, #00e5ff)" + "33" : "transparent",
        color: active ? "var(--accent-primary)" : "var(--text-muted)",
      }}
      onMouseEnter={(e) => {
        if (!active) e.currentTarget.style.color = "var(--text-secondary)";
      }}
      onMouseLeave={(e) => {
        if (!active) e.currentTarget.style.color = "var(--text-muted)";
      }}
    >
      {icon}
    </button>
  );
}
