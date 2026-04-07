import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  X,
  Globe,
  Clock,
  Zap,
  Activity,
  Key,
  AlertCircle,
  CheckCircle,
  Loader2,
} from "lucide-react";
import { useDashboardStore } from "@/stores/dashboard";
import { getModuleStats } from "@/api/client";

interface StatsData {
  api_calls_hour: number;
  api_calls_day: number;
  api_calls_month: number;
  llm_tokens_hour: number;
  llm_tokens_day: number;
  llm_tokens_month: number;
  fetch_count_hour: number;
  fetch_count_day: number;
  fetch_count_month: number;
  avg_fetch_ms_hour: number;
  avg_fetch_ms_day: number;
  avg_fetch_ms_month: number;
  last_fetch: number | null;
  last_status: string | null;
  last_fetch_ms: number | null;
  last_error: string | null;
  declared_domains: string[];
  secret_names: string[];
}

export function ModuleInfoPanel() {
  const { infoPanelModule, setInfoPanelModule, modules } = useDashboardStore();
  const [stats, setStats] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const moduleId = infoPanelModule?.id ?? null;
  const mod = moduleId ? modules[moduleId] : null;

  // Fetch stats when panel opens
  useEffect(() => {
    if (!moduleId) {
      setStats(null);
      return;
    }
    setLoading(true);
    setError(null);
    getModuleStats(moduleId)
      .then((data) => {
        setStats(data as StatsData);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, [moduleId]);

  // Close on escape
  useEffect(() => {
    if (!infoPanelModule) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setInfoPanelModule(null);
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [infoPanelModule, setInfoPanelModule]);

  if (!infoPanelModule || !mod) return null;

  const manifest = mod.manifest;

  // Compute popup position — keep it within viewport
  const popupW = 340;
  const popupH = 480;
  const vw = typeof window !== "undefined" ? window.innerWidth : 1200;
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;
  const posX = Math.min(Math.max(infoPanelModule.x, 8), vw - popupW - 8);
  const posY = Math.min(Math.max(infoPanelModule.y, 8), vh - popupH - 8);

  const lastFetchTime = stats?.last_fetch
    ? new Date(stats.last_fetch * 1000).toLocaleTimeString()
    : null;

  return (
    <>
      {/* Backdrop — click to close */}
      <div
        className="fixed inset-0 z-[90]"
        onClick={() => setInfoPanelModule(null)}
      />

      {/* Floating popup */}
      <motion.div
        initial={{ opacity: 0, scale: 0.92, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.92, y: 8 }}
        transition={{ duration: 0.15 }}
        className="fixed z-[100] rounded-xl overflow-hidden"
        style={{
          left: posX,
          top: posY,
          width: popupW,
          maxHeight: popupH,
          background: "var(--surface-raised)",
          border: "1px solid var(--border-subtle)",
          boxShadow:
            "0 12px 40px rgba(0,0,0,0.3), 0 4px 12px rgba(0,0,0,0.2)",
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-4 py-3"
          style={{ borderBottom: "1px solid var(--border-subtle)" }}
        >
          <div className="flex-1 min-w-0">
            <h3
              className="text-sm font-display font-semibold truncate"
              style={{ color: "var(--text-primary)" }}
            >
              {manifest.name}
            </h3>
            <p
              className="text-[11px] font-mono truncate mt-0.5"
              style={{ color: "var(--text-muted)" }}
            >
              {manifest.id}
            </p>
          </div>
          <button
            onClick={() => setInfoPanelModule(null)}
            className="ml-2 p-1 rounded-lg transition-colors"
            style={{ color: "var(--text-muted)" }}
            onMouseEnter={(e) =>
              (e.currentTarget.style.background = "var(--surface-overlay)")
            }
            onMouseLeave={(e) =>
              (e.currentTarget.style.background = "transparent")
            }
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div
          className="px-4 py-3 space-y-4 overflow-y-auto"
          style={{ maxHeight: popupH - 56 }}
        >
          {/* Description */}
          {manifest.description && (
            <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
              {manifest.description}
            </p>
          )}

          {/* Status row */}
          <InfoSection title="Status">
            <div className="flex items-center gap-2">
              {mod.error ? (
                <>
                  <AlertCircle
                    className="w-3.5 h-3.5"
                    style={{ color: "var(--status-error)" }}
                  />
                  <span
                    className="text-xs"
                    style={{ color: "var(--status-error)" }}
                  >
                    Error
                  </span>
                </>
              ) : mod.loading ? (
                <>
                  <Loader2
                    className="w-3.5 h-3.5 animate-spin"
                    style={{ color: "var(--accent-primary)" }}
                  />
                  <span
                    className="text-xs"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    Fetching...
                  </span>
                </>
              ) : (
                <>
                  <CheckCircle
                    className="w-3.5 h-3.5"
                    style={{ color: "var(--status-ok)" }}
                  />
                  <span
                    className="text-xs"
                    style={{ color: "var(--status-ok)" }}
                  >
                    Online
                  </span>
                </>
              )}
            </div>
            {mod.lastUpdated && (
              <StatRow
                label="Last updated"
                value={new Date(mod.lastUpdated).toLocaleTimeString()}
              />
            )}
            <StatRow
              label="Refresh interval"
              value={`${manifest.refresh_interval}s`}
            />
          </InfoSection>

          {/* Loading / error state for stats */}
          {loading && (
            <div className="flex items-center gap-2 py-2">
              <Loader2
                className="w-3.5 h-3.5 animate-spin"
                style={{ color: "var(--text-muted)" }}
              />
              <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                Loading stats...
              </span>
            </div>
          )}

          {error && (
            <div className="text-xs" style={{ color: "var(--status-error)" }}>
              Failed to load stats: {error}
            </div>
          )}

          {/* Fetch Performance */}
          {stats && (
            <InfoSection icon={<Zap className="w-3.5 h-3.5" />} title="Performance">
              <StatRow
                label="Fetches (last hour)"
                value={String(stats.fetch_count_hour)}
              />
              <StatRow
                label="Avg fetch time (hour)"
                value={`${stats.avg_fetch_ms_hour}ms`}
              />
              {stats.last_fetch_ms != null && (
                <StatRow
                  label="Last fetch time"
                  value={`${Math.round(stats.last_fetch_ms)}ms`}
                />
              )}
              {lastFetchTime && (
                <StatRow label="Last fetch at" value={lastFetchTime} />
              )}
              {stats.last_status && stats.last_status !== "ok" && (
                <StatRow
                  label="Last status"
                  value={stats.last_status}
                  valueColor="var(--status-error)"
                />
              )}
            </InfoSection>
          )}

          {/* API & Token Usage */}
          {stats && (stats.api_calls_day > 0 || stats.llm_tokens_day > 0) && (
            <InfoSection icon={<Activity className="w-3.5 h-3.5" />} title="Usage">
              {stats.api_calls_day > 0 && (
                <>
                  <StatRow
                    label="API calls (hour)"
                    value={String(stats.api_calls_hour)}
                  />
                  <StatRow
                    label="API calls (day)"
                    value={String(stats.api_calls_day)}
                  />
                </>
              )}
              {stats.llm_tokens_day > 0 && (
                <>
                  <StatRow
                    label="LLM tokens (hour)"
                    value={String(stats.llm_tokens_hour)}
                  />
                  <StatRow
                    label="LLM tokens (day)"
                    value={String(stats.llm_tokens_day)}
                  />
                </>
              )}
            </InfoSection>
          )}

          {/* Network */}
          <InfoSection icon={<Globe className="w-3.5 h-3.5" />} title="Network">
            {stats?.declared_domains && stats.declared_domains.length > 0 ? (
              <div className="flex flex-wrap gap-1.5 mt-1">
                {stats.declared_domains.map((d) => (
                  <span
                    key={d}
                    className="text-[11px] font-mono px-1.5 py-0.5 rounded"
                    style={{
                      background: "var(--surface-overlay)",
                      color: "var(--text-secondary)",
                    }}
                  >
                    {d}
                  </span>
                ))}
              </div>
            ) : (
              <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                No network access
              </span>
            )}
          </InfoSection>

          {/* Secrets */}
          {stats?.secret_names && stats.secret_names.length > 0 && (
            <InfoSection icon={<Key className="w-3.5 h-3.5" />} title="Secrets">
              <div className="flex flex-wrap gap-1.5 mt-1">
                {stats.secret_names.map((s) => (
                  <span
                    key={s}
                    className="text-[11px] font-mono px-1.5 py-0.5 rounded"
                    style={{
                      background: "var(--surface-overlay)",
                      color: "var(--text-secondary)",
                    }}
                  >
                    {s}
                  </span>
                ))}
              </div>
            </InfoSection>
          )}

          {/* Widget Size */}
          <InfoSection icon={<Clock className="w-3.5 h-3.5" />} title="Widget Config">
            <StatRow
              label="Default size"
              value={`${manifest.widget.default_w}×${manifest.widget.default_h}`}
            />
            <StatRow
              label="Min size"
              value={`${manifest.widget.min_w}×${manifest.widget.min_h}`}
            />
            <StatRow
              label="Resizable"
              value={manifest.widget.resizable ? "Yes" : "No"}
            />
          </InfoSection>

          {/* Last Error */}
          {stats?.last_error && (
            <InfoSection title="Last Error">
              <p
                className="text-[11px] font-mono mt-1 break-all"
                style={{ color: "var(--status-error)" }}
              >
                {stats.last_error}
              </p>
            </InfoSection>
          )}
        </div>
      </motion.div>
    </>
  );
}

// ── Sub-components ──────────────────────────────────────────────

function InfoSection({
  icon,
  title,
  children,
}: {
  icon?: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-1.5">
        {icon && (
          <span style={{ color: "var(--text-muted)" }}>{icon}</span>
        )}
        <h4
          className="text-[11px] uppercase tracking-widest font-semibold"
          style={{ color: "var(--text-muted)" }}
        >
          {title}
        </h4>
      </div>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function StatRow({
  label,
  value,
  valueColor,
}: {
  label: string;
  value: string;
  valueColor?: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs" style={{ color: "var(--text-muted)" }}>
        {label}
      </span>
      <span
        className="text-xs font-mono"
        style={{ color: valueColor ?? "var(--text-secondary)" }}
      >
        {value}
      </span>
    </div>
  );
}
