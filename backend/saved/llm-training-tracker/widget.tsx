import React, { useEffect, useRef } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import {
  Activity, Cpu, Zap, TrendingDown, Terminal, CheckCircle, WifiOff,
} from "lucide-react";

interface WidgetProps {
  data: Record<string, any> | null;
  loading: boolean;
  error: string | null;
  lastUpdated: string | null;
}

// ── small helpers ─────────────────────────────────────────────────────────────

function fmtLoss(v: number | null | undefined): string {
  if (v == null) return "—";
  return v < 1 ? v.toFixed(4) : v.toFixed(3);
}

function fmtLR(v: number | null | undefined): string {
  if (v == null) return "—";
  if (v < 1e-3) return v.toExponential(2);
  return v.toFixed(5);
}

function fmtElapsed(seconds: number | null | undefined): string {
  if (!seconds) return "";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
  if (m > 0) return `${m}m ${String(s).padStart(2, "0")}s`;
  return `${s}s`;
}

function logLineClass(line: string): string {
  if (/error|exception|traceback|failed/i.test(line)) return "text-status-error";
  if (/warn/i.test(line)) return "text-status-warn";
  if (/epoch|checkpoint|saved|complete/i.test(line)) return "text-accent-primary";
  if (/INFO/.test(line)) return "text-text-muted";
  return "text-text-secondary";
}

// ── sub-components ────────────────────────────────────────────────────────────

function MetricCard({
  icon, label, value, sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="bg-surface-raised border border-border-subtle rounded-lg px-2 py-1.5 flex flex-col gap-0.5 min-w-0">
      <div className="flex items-center gap-1 text-text-muted">
        {icon}
        <span className="text-[9px] font-mono uppercase tracking-wider">{label}</span>
      </div>
      <span className="font-mono text-sm font-bold text-text-primary truncate leading-tight">
        {value}
      </span>
      {sub && <span className="font-mono text-[9px] text-text-muted">{sub}</span>}
    </div>
  );
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div
      className="border border-border-subtle rounded px-2 py-1.5"
      style={{ background: "var(--color-surface-overlay)", fontSize: 11 }}
    >
      <p className="text-text-muted font-mono text-[10px] mb-1">
        {label != null ? `step ${label}` : ""}
      </p>
      {payload.map((p: any) => (
        <p key={p.dataKey} className="font-mono" style={{ color: p.color }}>
          {p.dataKey === "loss"
            ? `loss  ${Number(p.value).toFixed(4)}`
            : `lr  ${Number(p.value).toExponential(2)}×10⁻⁴`}
        </p>
      ))}
    </div>
  );
};

// ── main widget ───────────────────────────────────────────────────────────────

export default function Widget({ data, loading, error, lastUpdated }: WidgetProps) {
  const termRef = useRef<HTMLDivElement>(null);

  // Auto-scroll terminal to bottom whenever log_lines changes
  useEffect(() => {
    if (termRef.current) {
      termRef.current.scrollTop = termRef.current.scrollHeight;
    }
  }, [data?.log_lines?.length]);

  // ── loading skeleton ───────────────────────────────────────────────────────
  if (loading && !data) {
    return (
      <div className="no-drag h-full flex flex-col gap-2 p-3 animate-pulse">
        <div className="flex gap-1">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-12 bg-surface-raised rounded-lg flex-1" />
          ))}
        </div>
        <div className="h-2 bg-surface-raised rounded-full w-full" />
        <div className="flex-1 flex gap-2 min-h-0">
          <div className="flex-1 bg-surface-raised rounded-lg" />
          <div className="w-2/5 bg-surface-raised rounded-lg" />
        </div>
      </div>
    );
  }

  // ── error ──────────────────────────────────────────────────────────────────
  if (error) {
    return (
      <div className="no-drag h-full flex flex-col items-center justify-center gap-2 p-4">
        <WifiOff size={24} className="text-status-error" />
        <p className="text-status-error text-sm font-mono text-center">{error}</p>
      </div>
    );
  }

  if (!data) return null;

  const {
    mode, status, is_active, job_label,
    current_step, total_steps, epoch, epoch_progress,
    current_loss, current_lr, gpu_util, tokens_per_sec,
    elapsed_seconds, chart_data = [], log_lines = [],
  } = data;

  const isDemo = mode === "demo";
  const isIdle = status === "idle";
  const isComplete = status === "completed";

  // ── idle ───────────────────────────────────────────────────────────────────
  if (isIdle) {
    return (
      <div className="no-drag h-full flex flex-col items-center justify-center gap-3 p-6">
        <Activity size={32} className="text-text-muted opacity-30" />
        <p className="text-text-muted text-sm font-mono">No active training job</p>
        <p className="text-text-muted text-xs opacity-50 font-mono">watching · {job_label}</p>
      </div>
    );
  }

  // ── status badge helpers ───────────────────────────────────────────────────
  const statusLabel = isDemo
    ? "DEMO"
    : is_active
    ? "TRAINING"
    : "COMPLETE";

  const statusColor = isDemo
    ? "text-accent-secondary"
    : is_active
    ? "text-status-ok"
    : "text-accent-primary";

  const progressPct =
    total_steps && current_step != null
      ? Math.min(100, (current_step / total_steps) * 100)
      : null;

  const stepLabel =
    total_steps != null && current_step != null
      ? `step ${current_step.toLocaleString()} / ${total_steps.toLocaleString()}`
      : current_step != null
      ? `step ${current_step.toLocaleString()}`
      : null;

  return (
    <div className="no-drag h-full flex flex-col gap-1.5 p-2 overflow-hidden text-text-primary">

      {/* ── header ── */}
      <div className="flex items-center justify-between px-0.5 flex-shrink-0">
        <div className="flex items-center gap-2">
          {is_active && !isComplete && (
            <span className="inline-block w-2 h-2 rounded-full bg-status-ok animate-pulse flex-shrink-0" />
          )}
          {isComplete && <CheckCircle size={12} className="text-accent-primary flex-shrink-0" />}
          <span className={`text-xs font-mono font-bold tracking-widest ${statusColor}`}>
            {statusLabel}
          </span>
          {isDemo && (
            <span className="text-[10px] text-text-muted font-mono">· dummy data</span>
          )}
        </div>
        <div className="flex items-center gap-2 text-[10px] font-mono text-text-muted">
          {elapsed_seconds != null && (
            <span>{fmtElapsed(elapsed_seconds)}</span>
          )}
          <span className="opacity-60">{job_label}</span>
        </div>
      </div>

      {/* ── metric cards ── */}
      <div className="grid grid-cols-4 gap-1.5 flex-shrink-0">
        <MetricCard
          icon={<TrendingDown size={10} />}
          label="loss"
          value={fmtLoss(current_loss)}
          sub={epoch != null ? `epoch ${epoch}` : undefined}
        />
        <MetricCard
          icon={<Zap size={10} />}
          label="lr"
          value={fmtLR(current_lr)}
        />
        <MetricCard
          icon={<Cpu size={10} />}
          label="gpu"
          value={gpu_util != null ? `${gpu_util}%` : "—"}
        />
        <MetricCard
          icon={<Activity size={10} />}
          label="tok/s"
          value={tokens_per_sec != null ? tokens_per_sec.toLocaleString() : "—"}
        />
      </div>

      {/* ── progress bar ── */}
      {progressPct != null && (
        <div className="flex-shrink-0 px-0.5">
          <div className="h-1.5 bg-surface-raised rounded-full overflow-hidden">
            <div
              className="h-full bg-accent-primary rounded-full transition-all duration-700"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <div className="flex justify-between items-center mt-0.5">
            <span className="text-[10px] font-mono text-text-muted">{stepLabel}</span>
            <span className="text-[10px] font-mono text-text-muted">
              {progressPct.toFixed(1)}%
            </span>
          </div>
        </div>
      )}
      {progressPct == null && stepLabel && (
        <div className="flex-shrink-0 px-0.5">
          <span className="text-[10px] font-mono text-text-muted">{stepLabel}</span>
        </div>
      )}

      {/* ── chart + terminal ── */}
      <div className="flex-1 flex gap-2 min-h-0">

        {/* Loss chart */}
        <div className="flex-1 min-w-0 flex flex-col min-h-0">
          <p className="text-[10px] font-mono text-text-muted mb-0.5 px-0.5 flex-shrink-0">
            Training Loss
          </p>
          {chart_data.length > 2 ? (
            <div className="flex-1 min-h-0">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={chart_data}
                  margin={{ top: 4, right: 4, left: -24, bottom: 0 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="var(--color-border-subtle)"
                    opacity={0.5}
                  />
                  <XAxis
                    dataKey="step"
                    tick={{ fontSize: 9, fill: "var(--color-text-muted)", fontFamily: "monospace" }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v) =>
                      chart_data[0]?.lr !== undefined
                        ? String(v)
                        : String(v)
                    }
                  />
                  <YAxis
                    tick={{ fontSize: 9, fill: "var(--color-text-muted)", fontFamily: "monospace" }}
                    tickLine={false}
                    axisLine={false}
                    domain={["auto", "auto"]}
                    tickFormatter={(v) => Number(v).toFixed(2)}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Line
                    type="monotone"
                    dataKey="loss"
                    stroke="var(--color-accent-primary)"
                    strokeWidth={1.5}
                    dot={false}
                    isAnimationActive={false}
                  />
                  {chart_data[0]?.lr !== undefined && (
                    <Line
                      type="monotone"
                      dataKey="lr"
                      stroke="var(--color-accent-secondary)"
                      strokeWidth={1}
                      dot={false}
                      isAnimationActive={false}
                      strokeDasharray="4 2"
                      opacity={0.7}
                    />
                  )}
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <p className="text-text-muted text-xs font-mono opacity-60">
                Awaiting data…
              </p>
            </div>
          )}
        </div>

        {/* Terminal log */}
        <div className="w-[42%] flex flex-col min-h-0">
          <div className="flex items-center gap-1 mb-0.5 flex-shrink-0">
            <Terminal size={10} className="text-text-muted" />
            <p className="text-[10px] font-mono text-text-muted">output</p>
          </div>
          <div
            ref={termRef}
            className="flex-1 min-h-0 overflow-y-auto bg-surface-base border border-border-subtle rounded-lg p-2"
          >
            {log_lines.length > 0 ? (
              log_lines.map((line: string, i: number) => (
                <div
                  key={i}
                  className={`font-mono text-[10px] leading-relaxed whitespace-pre-wrap break-all ${logLineClass(line)}`}
                >
                  {line}
                </div>
              ))
            ) : (
              <p className="text-text-muted text-[10px] font-mono opacity-60">
                Waiting for logs…
              </p>
            )}
          </div>
        </div>
      </div>

      {/* ── footer timestamp ── */}
      {lastUpdated && (
        <div className="flex-shrink-0 text-right px-0.5">
          <span className="text-[9px] font-mono text-text-muted opacity-40">
            {new Date(lastUpdated).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            })}
          </span>
        </div>
      )}
    </div>
  );
}
