import React from "react";
import { TrendingUp, TrendingDown, Minus, AlertCircle } from "lucide-react";

interface SentimentResult {
  score: number;
  label: string;
  summary: string;
  article_count: number;
}

interface WidgetProps {
  data: Record<string, any> | null;
  loading: boolean;
  error: string | null;
  lastUpdated: string | null;
}

// ── regime config ─────────────────────────────────────────────────────────────

const REGIME = {
  "Strong Buy":  { textColor: "text-status-ok",    borderColor: "border-status-ok/50",    bg: "bg-status-ok/8",    Icon: TrendingUp,   arrows: "▲▲" },
  "Buy":         { textColor: "text-accent-secondary", borderColor: "border-accent-secondary/50", bg: "bg-accent-secondary/8", Icon: TrendingUp, arrows: "▲" },
  "Hold":        { textColor: "text-text-secondary", borderColor: "border-border-subtle",  bg: "bg-surface-raised", Icon: Minus,        arrows: "◆" },
  "Sell":        { textColor: "text-status-warn",   borderColor: "border-status-warn/50",  bg: "bg-status-warn/8",  Icon: TrendingDown, arrows: "▼" },
  "Strong Sell": { textColor: "text-status-error",  borderColor: "border-status-error/50", bg: "bg-status-error/8", Icon: TrendingDown, arrows: "▼▼" },
} as const;

// ── helpers ───────────────────────────────────────────────────────────────────

function sentimentColor(score: number): string {
  if (score >  0.25) return "text-status-ok";
  if (score < -0.25) return "text-status-error";
  return "text-status-warn";
}

function sentimentBarColor(score: number): string {
  if (score >  0.25) return "bg-status-ok";
  if (score < -0.25) return "bg-status-error";
  return "bg-status-warn";
}

function SentimentRow({ label, s }: { label: string; s: SentimentResult | null | undefined }) {
  if (!s) {
    return (
      <div className="flex items-center gap-2 py-0.5">
        <span className="font-mono text-[10px] text-text-muted w-6 flex-shrink-0">{label}</span>
        <span className="font-mono text-[10px] text-text-muted">— no data</span>
      </div>
    );
  }

  const score = Number(s.score);
  const sign = score >= 0 ? "+" : "";
  // Bar: 0% = score -1, 50% = score 0, 100% = score +1
  const barPct = Math.round(((score + 1) / 2) * 100);

  return (
    <div className="flex flex-col gap-0.5 py-0.5">
      <div className="flex items-center gap-2">
        <span className="font-mono text-[10px] text-text-muted w-6 flex-shrink-0">{label}</span>
        <span className={`font-mono text-[11px] font-bold tabular-nums ${sentimentColor(score)}`}>
          {sign}{score.toFixed(2)}
        </span>
        <span className="font-mono text-[10px] text-text-muted truncate">{s.label}</span>
        {s.article_count > 0 && (
          <span className="font-mono text-[9px] text-text-muted opacity-50 ml-auto flex-shrink-0">
            {s.article_count}
          </span>
        )}
      </div>
      {/* Sentiment bar: neutral at 50% */}
      <div className="flex items-center gap-1 pl-8">
        <div className="relative h-1 flex-1 bg-surface-raised rounded-full overflow-hidden">
          {/* Center marker */}
          <div className="absolute top-0 bottom-0 left-1/2 w-px bg-border-subtle" />
          <div
            className={`absolute top-0 bottom-0 rounded-full ${sentimentBarColor(score)}`}
            style={{
              left:  barPct >= 50 ? "50%" : `${barPct}%`,
              right: barPct >= 50 ? `${100 - barPct}%` : "50%",
            }}
          />
        </div>
      </div>
    </div>
  );
}

// ── main widget ───────────────────────────────────────────────────────────────

export default function Widget({ data, loading, error, lastUpdated }: WidgetProps) {
  if (loading && !data) {
    return (
      <div className="no-drag h-full flex flex-col gap-3 p-3 animate-pulse">
        <div className="flex-1 bg-surface-raised rounded-lg" />
        <div className="h-8 bg-surface-raised rounded-lg" />
        <div className="h-8 bg-surface-raised rounded-lg" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="no-drag h-full flex flex-col items-center justify-center gap-2 p-3">
        <AlertCircle size={20} className="text-status-error" />
        <p className="text-status-error text-xs font-mono text-center">{error}</p>
      </div>
    );
  }

  if (!data) return null;

  const regimeName: string = data.regime ?? "Hold";
  const cfg = REGIME[regimeName as keyof typeof REGIME] ?? REGIME["Hold"];
  const composite: number = Number(data.composite ?? 0);
  const sign = composite >= 0 ? "+" : "";

  return (
    <div className="no-drag h-full flex flex-col gap-2 p-3 overflow-hidden">

      {/* ── Regime indicator ── */}
      <div className={`flex-1 flex flex-col items-center justify-center rounded-lg border ${cfg.borderColor} ${cfg.bg} min-h-0 py-2`}>
        <span className="font-mono text-[9px] text-text-muted tracking-widest uppercase mb-1">
          regime
        </span>
        <span className={`font-mono font-bold leading-tight text-center ${cfg.textColor}`}
          style={{ fontSize: "clamp(0.9rem, 3.5vw, 1.25rem)" }}>
          {regimeName}
        </span>
        <span className={`font-mono text-base mt-0.5 ${cfg.textColor}`}>
          {cfg.arrows}
        </span>
        <span className="font-mono text-[10px] text-text-muted mt-1 tabular-nums">
          {sign}{composite.toFixed(2)}
        </span>
      </div>

      {/* ── Sentiment rows ── */}
      <div className="flex flex-col gap-0 border-t border-border-subtle pt-2 flex-shrink-0">
        <span className="font-mono text-[9px] text-text-muted tracking-widest uppercase mb-1">
          news sentiment
        </span>
        <SentimentRow label="1d" s={data.sentiment_day} />
        <SentimentRow label="7d" s={data.sentiment_week} />
        {!data.sentiment_available && (
          <p className="font-mono text-[9px] text-text-muted opacity-60 mt-0.5">
            add ANTHROPIC_API_KEY for sentiment
          </p>
        )}
      </div>

      {/* ── Footer ── */}
      <div className="flex items-center justify-between flex-shrink-0">
        <span className="font-mono text-[9px] text-text-muted opacity-50">
          QQQ · {data.meta?.price != null ? `$${data.meta.price}` : ""}
        </span>
        <span className="font-mono text-[9px] text-text-muted opacity-50">
          {data.date ?? ""}
        </span>
      </div>
    </div>
  );
}
