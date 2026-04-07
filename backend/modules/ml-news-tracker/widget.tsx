import React, { useState, useMemo } from "react";
import { Newspaper, ExternalLink, Search, RefreshCw, Clock, AlertCircle, BookOpen, Wrench, MessageSquare, Rss } from "lucide-react";

interface FeedItem {
  title: string;
  url: string;
  type: "paper" | "news" | "blog" | "tool" | "discussion";
  date: string;
  source: string;
  summary: string;
  relevance: string;
  rank: number;
}

interface WidgetProps {
  data: Record<string, any> | null;
  loading: boolean;
  error: string | null;
  lastUpdated: string | null;
}

const TYPE_CONFIG: Record<string, { label: string; Icon: any; color: string }> = {
  paper:      { label: "paper",  Icon: BookOpen,      color: "text-accent-primary" },
  news:       { label: "news",   Icon: Newspaper,     color: "text-status-warn" },
  blog:       { label: "blog",   Icon: Rss,           color: "text-accent-secondary" },
  tool:       { label: "tool",   Icon: Wrench,        color: "text-status-ok" },
  discussion: { label: "disc",   Icon: MessageSquare, color: "text-text-secondary" },
};

const ALL_TYPES = ["all", "paper", "news", "blog", "tool", "discussion"];

function relativeDate(dateStr: string): string {
  try {
    const d = new Date(dateStr + "T12:00:00Z");
    const diffDays = Math.floor((Date.now() - d.getTime()) / 86400000);
    if (diffDays === 0) return "today";
    if (diffDays === 1) return "yesterday";
    if (diffDays < 7) return `${diffDays}d ago`;
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  } catch {
    return dateStr;
  }
}

function SourceBadge({ source, type }: { source: string; type: string }) {
  const cfg = TYPE_CONFIG[type] ?? TYPE_CONFIG.news;
  return (
    <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border border-border-subtle bg-surface-overlay ${cfg.color}`}>
      {source}
    </span>
  );
}

export default function Widget({ data, loading, error, lastUpdated }: WidgetProps) {
  const [search, setSearch] = useState("");
  const [activeType, setActiveType] = useState("all");
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

  const items: FeedItem[] = data?.items ?? [];
  const searchLower = search.toLowerCase();

  const filtered = useMemo(() => {
    return items.filter(item => {
      const typeMatch = activeType === "all" || item.type === activeType;
      const textMatch = !searchLower ||
        item.title.toLowerCase().includes(searchLower) ||
        (item.summary || "").toLowerCase().includes(searchLower) ||
        item.source.toLowerCase().includes(searchLower);
      return typeMatch && textMatch;
    });
  }, [items, activeType, searchLower]);

  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = { all: items.length };
    for (const item of items) counts[item.type] = (counts[item.type] ?? 0) + 1;
    return counts;
  }, [items]);

  if (loading) {
    return (
      <div className="h-full flex flex-col gap-2 p-3 animate-pulse">
        <div className="h-7 bg-surface-raised rounded-lg w-3/4" />
        <div className="flex gap-1">
          {[1,2,3,4].map(i => <div key={i} className="h-6 bg-surface-raised rounded-full w-12" />)}
        </div>
        {[1,2,3,4].map(i => <div key={i} className="h-16 bg-surface-raised rounded-lg w-full" />)}
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-2 p-4">
        <AlertCircle size={24} className="text-status-error" />
        <p className="text-text-secondary text-sm text-center">{error}</p>
        <p className="text-text-muted text-xs text-center">Set ANTHROPIC_API_KEY in backend/.env</p>
      </div>
    );
  }

  if (!data) return null;

  const interests: string[] = data.interests ?? [];

  return (
    <div className="no-drag h-full flex flex-col overflow-hidden">

      {/* Top bar: interests + freshness */}
      <div className="px-3 pt-2 pb-1 flex items-center gap-2 flex-shrink-0 min-w-0">
        <div className="flex-1 flex flex-wrap gap-1 min-w-0 overflow-hidden" style={{ maxHeight: "1.6rem" }}>
          {interests.slice(0, 4).map(i => (
            <span key={i} className="text-[10px] font-mono text-accent-primary bg-surface-raised border border-border-subtle px-1.5 py-0.5 rounded-full whitespace-nowrap">
              {i}
            </span>
          ))}
          {interests.length > 4 && (
            <span className="text-[10px] text-text-muted">+{interests.length - 4}</span>
          )}
        </div>
        <div className="flex-shrink-0 flex items-center gap-1">
          {data.from_cache === false
            ? <span className="text-[9px] text-status-ok flex items-center gap-0.5"><RefreshCw size={8} />live</span>
            : <span className="text-[9px] text-text-muted flex items-center gap-0.5"><Clock size={8} />cached</span>
          }
        </div>
      </div>

      {data.warning && (
        <p className="px-3 text-[10px] text-status-warn flex-shrink-0">{data.warning}</p>
      )}

      {/* Type filter tabs */}
      <div className="px-3 pb-1.5 flex gap-1 flex-shrink-0 overflow-x-auto scrollbar-none">
        {ALL_TYPES.filter(t => t === "all" || (typeCounts[t] ?? 0) > 0).map(t => {
          const isActive = activeType === t;
          const cfg = TYPE_CONFIG[t];
          return (
            <button
              key={t}
              onClick={() => setActiveType(t)}
              className={`flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-full border whitespace-nowrap transition-colors
                ${isActive
                  ? "border-accent-primary bg-surface-overlay text-accent-primary"
                  : "border-border-subtle text-text-muted hover:text-text-secondary hover:border-border-strong"}`}
            >
              {cfg && <cfg.Icon size={9} />}
              {t}{typeCounts[t] !== undefined && t !== "all" ? ` ${typeCounts[t]}` : t === "all" ? ` ${typeCounts.all}` : ""}
            </button>
          );
        })}
      </div>

      {/* Search */}
      <div className="px-3 pb-2 flex-shrink-0">
        <div className="flex items-center gap-2 bg-surface-raised border border-border-subtle rounded-lg px-2 py-1">
          <Search size={11} className="text-text-muted flex-shrink-0" />
          <input
            type="text"
            placeholder="Search titles, sources…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="bg-transparent text-xs text-text-primary placeholder:text-text-muted outline-none w-full"
          />
        </div>
      </div>

      {/* Feed */}
      <div className="flex-1 overflow-y-auto px-3 pb-2 flex flex-col gap-1.5 min-h-0">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2">
            <Newspaper size={28} className="text-text-muted" />
            <p className="text-text-muted text-sm">{search || activeType !== "all" ? "No matches" : "No items yet"}</p>
          </div>
        ) : (
          filtered.map((item, i) => {
            const cfg = TYPE_CONFIG[item.type] ?? TYPE_CONFIG.news;
            const isExpanded = expandedIdx === i;
            return (
              <div
                key={`${item.url}-${i}`}
                className="bg-surface-raised border border-border-subtle rounded-lg px-3 py-2 cursor-pointer hover:border-accent-primary/50 transition-colors"
                onClick={() => setExpandedIdx(isExpanded ? null : i)}
              >
                <div className="flex items-start gap-2">
                  <cfg.Icon size={13} className={`${cfg.color} flex-shrink-0 mt-0.5`} />
                  <div className="flex-1 min-w-0">
                    {/* Source + date row */}
                    <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                      <SourceBadge source={item.source} type={item.type} />
                      <span className="text-[10px] font-mono text-text-muted">{relativeDate(item.date)}</span>
                    </div>
                    {/* Title */}
                    <p className="text-sm font-body text-text-primary leading-snug line-clamp-2">
                      {item.title}
                    </p>
                    {/* Summary — always shown, clamped unless expanded */}
                    <p className={`text-xs text-text-secondary mt-1 leading-relaxed ${isExpanded ? "" : "line-clamp-2"}`}>
                      {item.summary}
                    </p>
                    {/* Relevance — only when expanded */}
                    {isExpanded && item.relevance && (
                      <p className="text-[10px] text-accent-primary mt-1 italic">{item.relevance}</p>
                    )}
                  </div>
                  {/* Open link */}
                  <ExternalLink
                    size={12}
                    className="text-text-muted hover:text-accent-primary flex-shrink-0 transition-colors mt-0.5"
                    onClick={e => { e.stopPropagation(); item.url && window.open(item.url, "_blank"); }}
                  />
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Footer */}
      {data.last_search && (
        <div className="px-3 py-1 border-t border-border-subtle flex-shrink-0">
          <span className="text-[10px] text-text-muted">
            {filtered.length}/{data.total} shown · searched {new Date(data.last_search).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </span>
        </div>
      )}
    </div>
  );
}
