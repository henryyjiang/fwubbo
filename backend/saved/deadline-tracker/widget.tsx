import React, { useState, useMemo } from "react";
import { Clock, ExternalLink, Search, AlertCircle, RefreshCw, Zap } from "lucide-react";

interface Deadline {
  name: string;
  type: string;
  deadline: string;
  url: string;
  description: string;
  days_left: number;
}

interface WidgetProps {
  data: Record<string, any> | null;
  loading: boolean;
  error: string | null;
  lastUpdated: string | null;
}

const TYPE_LABELS: Record<string, string> = {
  hackathon:   "hack",
  conference:  "conf",
  fellowship:  "fellowship",
  competition: "comp",
  program:     "prog",
  grant:       "grant",
};

function urgencyClass(daysLeft: number): string {
  if (daysLeft <= 3)  return "text-status-error";
  if (daysLeft <= 14) return "text-status-warn";
  return "text-status-ok";
}

function urgencyBg(daysLeft: number): string {
  if (daysLeft <= 3)  return "border-status-error/40 bg-surface-raised";
  if (daysLeft <= 14) return "border-status-warn/40 bg-surface-raised";
  return "border-border-subtle bg-surface-raised";
}

function formatDeadline(dateStr: string): string {
  try {
    const d = new Date(dateStr + "T00:00:00Z");
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
  } catch {
    return dateStr;
  }
}

function CountdownPill({ daysLeft }: { daysLeft: number }) {
  const cls = urgencyClass(daysLeft);
  if (daysLeft === 0) return (
    <div className="flex flex-col items-center min-w-[42px]">
      <span className={`text-xl font-mono font-bold ${cls} leading-none`}>!</span>
      <span className="text-[9px] text-text-muted leading-none mt-0.5">today</span>
    </div>
  );
  return (
    <div className="flex flex-col items-center min-w-[42px]">
      <span className={`text-2xl font-mono font-bold ${cls} leading-none`}>{daysLeft}</span>
      <span className="text-[9px] text-text-muted leading-none mt-0.5">day{daysLeft !== 1 ? "s" : ""}</span>
    </div>
  );
}

export default function Widget({ data, loading, error, lastUpdated }: WidgetProps) {
  const [filter, setFilter] = useState("");
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

  if (loading) {
    return (
      <div className="h-full flex flex-col gap-2 p-3 animate-pulse">
        <div className="h-8 bg-surface-raised rounded-lg w-full" />
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="h-16 bg-surface-raised rounded-lg w-full" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-2 p-4">
        <AlertCircle size={24} className="text-status-error" />
        <p className="text-text-secondary text-sm text-center">{error}</p>
        <p className="text-text-muted text-xs text-center">Make sure ANTHROPIC_API_KEY is set in backend/.env</p>
      </div>
    );
  }

  if (!data) return null;

  const deadlines: Deadline[] = data.deadlines || [];
  const filterLower = filter.toLowerCase();

  const filtered = useMemo(() => {
    if (!filterLower) return deadlines;
    return deadlines.filter(d =>
      d.name.toLowerCase().includes(filterLower) ||
      d.type.toLowerCase().includes(filterLower) ||
      (d.description || "").toLowerCase().includes(filterLower)
    );
  }, [deadlines, filterLower]);

  const urgent = filtered.filter(d => d.days_left <= 7).length;

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-3 pt-2 pb-1 flex items-center gap-2 flex-shrink-0">
        <span className="text-base font-display font-semibold text-text-primary leading-none">
          {data.total ?? 0}
        </span>
        <span className="text-xs text-text-muted">upcoming</span>
        {urgent > 0 && (
          <span className="flex items-center gap-0.5 text-[10px] text-status-error font-mono ml-1">
            <Zap size={10} />{urgent} urgent
          </span>
        )}
        <div className="ml-auto flex items-center gap-1">
          {data.from_cache === false && (
            <span className="text-[9px] text-status-ok flex items-center gap-0.5">
              <RefreshCw size={8} />live
            </span>
          )}
          {data.from_cache === true && (
            <span className="text-[9px] text-text-muted flex items-center gap-0.5">
              <Clock size={8} />cached
            </span>
          )}
        </div>
      </div>

      {data.warning && (
        <div className="px-3 pb-1 flex-shrink-0">
          <p className="text-[10px] text-status-warn">{data.warning}</p>
        </div>
      )}

      {/* Filter */}
      <div className="px-3 pb-2 flex-shrink-0">
        <div className="flex items-center gap-2 bg-surface-raised border border-border-subtle rounded-lg px-2 py-1">
          <Search size={11} className="text-text-muted flex-shrink-0" />
          <input
            type="text"
            placeholder="Filter deadlines…"
            value={filter}
            onChange={e => setFilter(e.target.value)}
            className="bg-transparent text-xs text-text-primary placeholder:text-text-muted outline-none w-full"
          />
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-3 pb-2 flex flex-col gap-1.5 min-h-0">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2">
            <Clock size={28} className="text-text-muted" />
            <p className="text-text-muted text-sm">
              {filter ? "No matches" : "No upcoming deadlines found"}
            </p>
            {!data.from_cache && data.total === 0 && (
              <p className="text-text-muted text-xs text-center px-4">
                Try broadening your search topics in settings
              </p>
            )}
          </div>
        ) : (
          filtered.map((d, i) => (
            <div
              key={`${d.name}-${i}`}
              className={`border rounded-lg px-3 py-2 cursor-pointer transition-colors ${urgencyBg(d.days_left)} hover:border-accent-primary/60`}
              onClick={() => setExpandedIdx(expandedIdx === i ? null : i)}
            >
              <div className="flex items-center gap-3">
                <CountdownPill daysLeft={d.days_left} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                    <span className="text-[10px] font-mono text-text-muted bg-surface-overlay px-1.5 py-0.5 rounded border border-border-subtle">
                      {TYPE_LABELS[d.type] || d.type}
                    </span>
                    <span className="text-[10px] font-mono text-text-muted">
                      {formatDeadline(d.deadline)}
                    </span>
                  </div>
                  <p className={`text-sm font-body leading-snug ${d.days_left <= 3 ? "text-status-error" : "text-text-primary"}`}>
                    {d.name}
                  </p>
                  {expandedIdx === i && d.description && (
                    <p className="text-xs text-text-secondary mt-1 leading-relaxed">
                      {d.description}
                    </p>
                  )}
                </div>
                {d.url && (
                  <ExternalLink
                    size={12}
                    className="text-text-muted hover:text-accent-primary flex-shrink-0 transition-colors"
                    onClick={e => { e.stopPropagation(); window.open(d.url, "_blank"); }}
                  />
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Footer */}
      {data.last_search && (
        <div className="px-3 py-1 border-t border-border-subtle flex-shrink-0">
          <span className="text-[10px] text-text-muted truncate block">
            searched {new Date(data.last_search).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
            {" · "}{data.topics?.split(",")[0]?.trim()}…
          </span>
        </div>
      )}
    </div>
  );
}
