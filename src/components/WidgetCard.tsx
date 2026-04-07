import React, { Component, type ErrorInfo, type ReactNode } from "react";
import { motion } from "framer-motion";
import { AlertTriangle, Info, RefreshCw, Wifi, WifiOff } from "lucide-react";
import type { WidgetStatus } from "@/types";
import { useDashboardStore } from "@/stores/dashboard";

// ─── Error Boundary ───────────────────────────────────────────────

interface EBProps {
  moduleId: string;
  children: ReactNode;
}
interface EBState {
  hasError: boolean;
  error: string;
}

export class WidgetErrorBoundary extends Component<EBProps, EBState> {
  state: EBState = { hasError: false, error: "" };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error: error.message };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[Widget:${this.props.moduleId}]`, error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="no-drag flex flex-col items-center justify-center h-full gap-3 p-4 text-center">
          <AlertTriangle className="w-8 h-8 text-status-error" />
          <p className="text-sm text-text-secondary font-mono">
            Widget crashed: {this.state.error}
          </p>
          <div className="flex items-center gap-3">
            <button
              onClick={(e) => {
                navigator.clipboard.writeText(this.state.error);
                const btn = e.currentTarget;
                btn.textContent = "Copied!";
                setTimeout(() => { btn.textContent = "Copy error"; }, 1500);
              }}
              className="text-xs px-3 py-1 rounded border border-border-subtle text-text-secondary hover:text-text-primary transition-colors"
            >
              Copy error
            </button>
            <button
              onClick={() => this.setState({ hasError: false, error: "" })}
              className="text-xs px-3 py-1 rounded border border-border-subtle text-text-secondary hover:text-text-primary transition-colors"
            >
              Retry
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// ─── Status Badge ─────────────────────────────────────────────────

function StatusBadge({ status }: { status: WidgetStatus }) {
  if (status === "online") return null;

  const config: Record<string, { icon: ReactNode; label: string; color: string }> = {
    "offline-cached": {
      icon: <WifiOff className="w-3 h-3" />,
      label: "Cached",
      color: "text-status-warn",
    },
    "offline-no-cache": {
      icon: <WifiOff className="w-3 h-3" />,
      label: "Offline",
      color: "text-status-error",
    },
    loading: {
      icon: <RefreshCw className="w-3 h-3 animate-spin" />,
      label: "Loading",
      color: "text-text-muted",
    },
    error: {
      icon: <AlertTriangle className="w-3 h-3" />,
      label: "Error",
      color: "text-status-error",
    },
  };

  const c = config[status];
  if (!c) return null;

  return (
    <span className={`flex items-center gap-1 text-[10px] ${c.color}`}>
      {c.icon}
      {c.label}
    </span>
  );
}

// ─── Widget Card ──────────────────────────────────────────────────

interface WidgetCardProps {
  moduleId: string;
  title: string;
  icon?: string;
  status: WidgetStatus;
  children: ReactNode;
  onRefresh?: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
}

export function WidgetCard({
  moduleId,
  title,
  status,
  children,
  onRefresh,
  onContextMenu,
}: WidgetCardProps) {
  const setInfoPanel = useDashboardStore((s) => s.setInfoPanelModule);

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onContextMenu?.(e);
  };

  return (
    <motion.div
      className="widget-card h-full flex flex-col overflow-hidden"
      initial={{ opacity: 0, y: 12, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
      whileHover={{ scale: 1.005 }}
      onContextMenu={handleContextMenu}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-2.5 border-b border-border-subtle shrink-0"
        style={{ background: "var(--widget-header-bg, transparent)" }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <h3
            className="text-sm font-semibold font-display truncate"
            style={{ color: "var(--widget-title-color, var(--text-primary))" }}
          >
            {title}
          </h3>
          <StatusBadge status={status} />
        </div>
        <div className="no-drag flex items-center gap-1 shrink-0">
          {onRefresh && (
            <button
              onClick={onRefresh}
              className="p-1.5 rounded-md hover:bg-surface-overlay transition-colors"
              style={{ color: "var(--widget-header-icon, var(--text-muted))" }}
              title="Refresh"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              setInfoPanel({ id: moduleId, x: rect.left, y: rect.bottom + 4 });
            }}
            className="p-1.5 rounded-md hover:bg-surface-overlay transition-colors"
            style={{ color: "var(--widget-header-icon, var(--text-muted))" }}
            title="Module Info"
          >
            <Info className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-auto p-4">
        <WidgetErrorBoundary moduleId={moduleId}>{children}</WidgetErrorBoundary>
      </div>
    </motion.div>
  );
}
