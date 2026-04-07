import React, { useState, useMemo } from "react";
import { TrendingUp, ExternalLink, AlertCircle } from "lucide-react";

interface Article {
  ticker: string;
  title: string;
  url: string;
  publisher: string;
  age: string;
}

interface WidgetProps {
  data: Record<string, any> | null;
  loading: boolean;
  error: string | null;
  lastUpdated: string | null;
}

// Deterministic color index from ticker string
function tickerColorClass(ticker: string): string {
  const colors = [
    "text-accent-primary",
    "text-accent-secondary",
    "text-status-ok",
    "text-status-warn",
    "text-[#a78bfa]",
    "text-[#fb7185]",
    "text-[#34d399]",
    "text-[#60a5fa]",
  ];
  const idx = ticker.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0) % colors.length;
  return colors[idx];
}

export default function Widget({ data, loading, error, lastUpdated }: WidgetProps) {
  const [activeTicker, setActiveTicker] = useState("ALL");

  const articles: Article[] = data?.articles ?? [];
  const tickers: string[] = data?.tickers ?? [];

  const filtered = useMemo(() => {
    if (activeTicker === "ALL") return articles;
    return articles.filter(a => a.ticker === activeTicker);
  }, [articles, activeTicker]);

  if (loading) {
    return (
      <div className="h-full flex flex-col gap-2 p-3 animate-pulse">
        <div className="flex gap-1.5 mb-1">
          {[1, 2, 3, 4].map(i => <div key={i} className="h-5 w-12 bg-surface-raised rounded-full" />)}
        </div>
        {[1, 2, 3, 4, 5].map(i => (
          <div key={i} className="h-10 bg-surface-raised rounded-lg w-full" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-2 p-4">
        <AlertCircle size={20} className="text-status-error" />
        <p className="text-text-secondary text-sm text-center">{error}</p>
      </div>
    );
  }

  if (!data) return null;

  const hasErrors = data.errors && Object.keys(data.errors).length > 0;

  return (
    <div className="no-drag h-full flex flex-col overflow-hidden">

      {/* Ticker filter pills */}
      <div className="px-3 pt-2 pb-1.5 flex gap-1 flex-shrink-0 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
        <button
          onClick={() => setActiveTicker("ALL")}
          className={`text-[10px] font-mono px-2 py-0.5 rounded-full border whitespace-nowrap transition-colors ${
            activeTicker === "ALL"
              ? "border-accent-primary text-accent-primary bg-surface-overlay"
              : "border-border-subtle text-text-muted hover:border-border-strong"
          }`}
        >
          ALL {data.total}
        </button>
        {tickers.map(t => (
          <button
            key={t}
            onClick={() => setActiveTicker(t)}
            className={`text-[10px] font-mono px-2 py-0.5 rounded-full border whitespace-nowrap transition-colors ${
              activeTicker === t
                ? `border-current bg-surface-overlay ${tickerColorClass(t)}`
                : "border-border-subtle text-text-muted hover:border-border-strong"
            }`}
          >
            {t}
          </button>
        ))}
        {hasErrors && (
          <span className="text-[9px] text-status-warn self-center ml-1 whitespace-nowrap">
            ⚠ {Object.keys(data.errors).join(",")}
          </span>
        )}
      </div>

      {/* Headlines */}
      <div className="flex-1 overflow-y-auto px-3 pb-2 flex flex-col gap-1 min-h-0">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2">
            <TrendingUp size={24} className="text-text-muted" />
            <p className="text-text-muted text-sm">No headlines</p>
          </div>
        ) : (
          filtered.map((a, i) => (
            <div
              key={`${a.ticker}-${i}`}
              className="flex items-start gap-2 py-1.5 border-b border-border-subtle last:border-0 cursor-pointer group"
              onClick={() => a.url && window.open(a.url, "_blank")}
            >
              <span className={`text-[10px] font-mono font-bold flex-shrink-0 mt-0.5 w-10 text-right ${tickerColorClass(a.ticker)}`}>
                {a.ticker}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-text-primary leading-snug line-clamp-2 group-hover:text-accent-primary transition-colors">
                  {a.title}
                </p>
                <p className="text-[10px] text-text-muted mt-0.5">
                  {a.publisher}{a.age ? ` · ${a.age}` : ""}
                </p>
              </div>
              <ExternalLink size={10} className="text-text-muted flex-shrink-0 mt-1 opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
          ))
        )}
      </div>

      {lastUpdated && (
        <div className="px-3 py-1 border-t border-border-subtle flex-shrink-0">
          <span className="text-[10px] text-text-muted">
            {new Date(lastUpdated).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </span>
        </div>
      )}
    </div>
  );
}