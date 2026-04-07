import React, { useMemo } from "react";
import { BookOpen, Clock, RefreshCw, AlertCircle } from "lucide-react";

interface WidgetProps {
  data: Record<string, any> | null;
  loading: boolean;
  error: string | null;
  lastUpdated: string | null;
}

type LineType = "h2" | "h3" | "bullet" | "text" | "empty";

function parseLine(raw: string): { type: LineType; text: string } {
  if (raw.startsWith("## ")) return { type: "h2", text: raw.slice(3) };
  if (raw.startsWith("### ")) return { type: "h3", text: raw.slice(4) };
  if (raw.startsWith("- ") || raw.startsWith("* ")) return { type: "bullet", text: raw.slice(2) };
  if (raw.trim() === "") return { type: "empty", text: "" };
  return { type: "text", text: raw };
}

// Very minimal inline bold renderer: splits on **...**
function InlineText({ text }: { text: string }) {
  const parts = text.split(/\*\*(.+?)\*\*/g);
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1
          ? <strong key={i} className="font-semibold text-text-primary">{part}</strong>
          : <span key={i}>{part}</span>
      )}
    </>
  );
}

function BriefingContent({ markdown }: { markdown: string }) {
  const lines = useMemo(() => markdown.split("\n").map(parseLine), [markdown]);

  return (
    <div className="text-sm leading-relaxed space-y-0.5">
      {lines.map((line, i) => {
        if (line.type === "empty") return <div key={i} className="h-2" />;
        if (line.type === "h2") return (
          <p key={i} className="text-accent-primary font-semibold text-xs uppercase tracking-wider mt-3 mb-1 first:mt-0">
            {line.text}
          </p>
        );
        if (line.type === "h3") return (
          <p key={i} className="text-text-secondary font-medium text-xs mt-2">
            {line.text}
          </p>
        );
        if (line.type === "bullet") return (
          <div key={i} className="flex gap-2 text-xs text-text-secondary pl-1">
            <span className="text-accent-primary mt-0.5 flex-shrink-0">·</span>
            <span><InlineText text={line.text} /></span>
          </div>
        );
        return (
          <p key={i} className="text-xs text-text-secondary">
            <InlineText text={line.text} />
          </p>
        );
      })}
    </div>
  );
}

export default function Widget({ data, loading, error, lastUpdated }: WidgetProps) {
  if (loading && !data) {
    return (
      <div className="h-full flex flex-col gap-2 p-3 animate-pulse">
        <div className="h-4 bg-surface-raised rounded w-1/2" />
        <div className="h-3 bg-surface-raised rounded w-3/4 mt-2" />
        <div className="h-3 bg-surface-raised rounded w-2/3" />
        <div className="h-3 bg-surface-raised rounded w-full mt-2" />
        <div className="h-3 bg-surface-raised rounded w-4/5" />
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-2 p-4">
        <AlertCircle size={22} className="text-status-error" />
        <p className="text-text-secondary text-xs text-center">{error}</p>
      </div>
    );
  }

  if (!data) return null;

  const briefing: string = data.briefing ?? "";
  const generatedAt: string = data.generated_at ?? "";
  const fromCache: boolean = data.from_cache ?? true;
  const warning: string = data.warning ?? "";

  const timeLabel = generatedAt
    ? new Date(generatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : "";

  return (
    <div className="no-drag h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-3 pt-2.5 pb-1.5 flex items-center gap-2 flex-shrink-0 border-b border-border-subtle">
        <BookOpen size={13} className="text-accent-primary flex-shrink-0" />
        <span className="text-xs font-semibold text-text-primary flex-1">Daily Briefing</span>
        <div className="flex items-center gap-1 text-[10px] text-text-muted">
          {loading
            ? <><RefreshCw size={9} className="animate-spin" /><span>updating…</span></>
            : fromCache
              ? <><Clock size={9} /><span>{timeLabel}</span></>
              : <><RefreshCw size={9} className="text-status-ok" /><span>{timeLabel}</span></>
          }
        </div>
      </div>

      {warning && (
        <p className="px-3 py-1 text-[10px] text-status-warn flex-shrink-0">{warning}</p>
      )}

      {/* Briefing body */}
      <div className="flex-1 overflow-y-auto px-3 py-2 min-h-0">
        {briefing
          ? <BriefingContent markdown={briefing} />
          : <p className="text-xs text-text-muted italic">No briefing yet — waiting for first generation.</p>
        }
      </div>
    </div>
  );
}
