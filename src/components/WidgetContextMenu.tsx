import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Settings,
  Trash2,
  RefreshCw,
  Code,
  Info,
  Edit3,
  Bookmark,
  X,
} from "lucide-react";
import { useDashboardStore } from "@/stores/dashboard";
import { deleteModule, saveWidget } from "@/api/client";
import { clearWidgetCache } from "./DynamicWidget";
import { appConfirm } from "./ConfirmDialog";

interface ContextMenuProps {
  x: number;
  y: number;
  moduleId: string;
  onClose: () => void;
  onRefresh?: () => void;
}

export function WidgetContextMenu({
  x,
  y,
  moduleId,
  onClose,
  onRefresh,
}: ContextMenuProps) {
  const {
    modules,
    setSettingsModule,
    setInfoPanelModule,
    removeModule,
    setActivePanel,
    setEditModuleId,
    registerSavedWidget,
  } = useDashboardStore();

  const mod = modules[moduleId];
  const isBuiltin = moduleId.startsWith("demo-");

  // Close on click outside or escape
  useEffect(() => {
    const handleClick = () => onClose();
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    // Delay to avoid the triggering right-click from closing immediately
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

  // Position the menu so it doesn't overflow the viewport
  const [position, setPosition] = useState({ x, y });
  useEffect(() => {
    const menuWidth = 200;
    const menuHeight = 300;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    setPosition({
      x: Math.min(x, vw - menuWidth - 8),
      y: Math.min(y, vh - menuHeight - 8),
    });
  }, [x, y]);

  const handleDelete = async () => {
    if (!await appConfirm(`Delete widget "${mod?.manifest.name}"? This removes the widget files permanently.`)) return;
    try {
      await deleteModule(moduleId);
      removeModule(moduleId);
      clearWidgetCache(moduleId);
    } catch (err) {
      console.error("Failed to delete module:", err);
    }
    onClose();
  };

  const handleRemove = async () => {
    if (!await appConfirm(`Remove "${mod?.manifest.name}" from the dashboard? It will be saved to your library.`)) return;
    // Auto-save to library, then remove from dashboard
    try {
      const result = await saveWidget(moduleId);
      if (result.manifest) {
        registerSavedWidget(result.manifest as any);
      }
    } catch {
      // Save failed — still remove from dashboard
    }
    removeModule(moduleId);
    clearWidgetCache(moduleId);
    onClose();
  };

  const handleSave = async () => {
    try {
      const result = await saveWidget(moduleId);
      if (result.manifest) {
        registerSavedWidget(result.manifest as any);
      }
    } catch (err) {
      console.error("Failed to save widget:", err);
    }
    onClose();
  };

  const handleSettings = () => {
    setSettingsModule(moduleId);
    onClose();
  };

  const handleInfo = () => {
    setInfoPanelModule({ id: moduleId, x: position.x, y: position.y });
    onClose();
  };

  const handleEdit = () => {
    setEditModuleId(moduleId);
    setActivePanel("add-module");
    onClose();
  };

  const items = [
    ...(!isBuiltin && mod?.manifest.settings?.length
      ? [
          {
            icon: <Settings className="w-3.5 h-3.5" />,
            label: "Settings",
            onClick: handleSettings,
          },
        ]
      : []),
    ...(!isBuiltin
      ? [
          {
            icon: <Edit3 className="w-3.5 h-3.5" />,
            label: "Edit with Fwubbo",
            onClick: handleEdit,
          },
        ]
      : []),
    ...(onRefresh
      ? [
          {
            icon: <RefreshCw className="w-3.5 h-3.5" />,
            label: "Refresh",
            onClick: () => {
              onRefresh();
              onClose();
            },
          },
        ]
      : []),
    ...(!isBuiltin
      ? [
          {
            icon: <Bookmark className="w-3.5 h-3.5" />,
            label: "Save Widget",
            onClick: handleSave,
          },
        ]
      : []),
    ...(!isBuiltin
      ? [
          {
            icon: <Info className="w-3.5 h-3.5" />,
            label: "Module Info",
            onClick: handleInfo,
          },
        ]
      : []),
    ...(!isBuiltin
      ? [
          {
            icon: <X className="w-3.5 h-3.5" />,
            label: "Remove & Save to Library",
            onClick: handleRemove,
            danger: false,
          },
        ]
      : []),
    ...(!isBuiltin
      ? [
          {
            icon: <Trash2 className="w-3.5 h-3.5" />,
            label: "Delete",
            onClick: handleDelete,
            danger: true,
          },
        ]
      : []),
  ];

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.92 }}
      transition={{ duration: 0.12 }}
      className="fixed z-[100] rounded-xl overflow-hidden py-1.5"
      style={{
        left: position.x,
        top: position.y,
        background: "var(--surface-raised)",
        border: "1px solid var(--border-subtle)",
        boxShadow: "0 8px 32px rgba(0,0,0,0.25), 0 2px 8px rgba(0,0,0,0.15)",
        minWidth: 180,
      }}
    >
      {/* Module name header */}
      <div className="px-3 py-1.5 border-b border-border-subtle">
        <p className="text-[11px] text-text-muted font-mono truncate">
          {mod?.manifest.name ?? moduleId}
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
