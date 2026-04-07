import React, { useState } from "react";
import { Mail, Clock, RefreshCw, AlertCircle, Reply, BookOpen, Calendar, Info, Zap } from "lucide-react";

interface ImportantEmail {
  index: number;
  subject: string;
  sender: string;
  date: string;
  reason: string;
  action: "reply" | "read" | "deadline" | "info" | "other";
}

interface WidgetProps {
  data: Record<string, any> | null;
  loading: boolean;
  error: string | null;
  lastUpdated: string | null;
}

const ACTION_CONFIG: Record<string, { Icon: any; color: string; label: string }> = {
  reply:    { Icon: Reply,    color: "text-accent-primary",   label: "reply" },
  read:     { Icon: BookOpen, color: "text-accent-secondary", label: "read" },
  deadline: { Icon: Calendar, color: "text-status-error",     label: "deadline" },
  info:     { Icon: Info,     color: "text-text-muted",       label: "info" },
  other:    { Icon: Zap,      color: "text-status-warn",      label: "action" },
};

function ActionBadge({ action }: { action: string }) {
  const cfg = ACTION_CONFIG[action] ?? ACTION_CONFIG.other;
  return (
    <span className={`flex items-center gap-0.5 text-[9px] font-mono px-1.5 py-0.5 rounded border border-border-subtle bg-surface-overlay ${cfg.color}`}>
      <cfg.Icon size={8} />
      {cfg.label}
    </span>
  );
}

export default function Widget({ data, loading, error, lastUpdated }: WidgetProps) {
  const [expanded, setExpanded] = useState<number | null>(null);

  if (loading && !data) {
    return (
      <div className="h-full flex flex-col gap-2 p-3 animate-pulse">
        <div className="h-4 bg-surface-raised rounded w-1/2" />
        <div className="h-3 bg-surface-raised rounded w-full mt-1" />
        <div className="h-3 bg-surface-raised rounded w-4/5" />
        {[1, 2, 3].map(i => (
          <div key={i} className="h-14 bg-surface-raised rounded-lg mt-1" />
        ))}
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-2 p-4">
        <AlertCircle size={22} className="text-status-error" />
        <p className="text-text-secondary text-xs text-center">{error}</p>
        <p className="text-text-muted text-[10px] text-center">
          Use an App Password from myaccount.google.com → Security → App passwords
        </p>
      </div>
    );
  }

  if (!data) return null;

  const summary: string = data.summary ?? "";
  const important: ImportantEmail[] = data.important ?? [];
  const totalScanned: number = data.total_scanned ?? 0;
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
        <Mail size={13} className="text-accent-primary flex-shrink-0" />
        <span className="text-xs font-semibold text-text-primary flex-1">Gmail Digest</span>
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

      {/* Summary */}
      {summary && (
        <div className="px-3 py-2 flex-shrink-0 border-b border-border-subtle">
          <p className="text-xs text-text-secondary leading-relaxed">{summary}</p>
          <p className="text-[10px] text-text-muted mt-1">
            {important.length > 0
              ? `${important.length} need attention · ${totalScanned} scanned`
              : `${totalScanned} scanned · nothing urgent`}
          </p>
        </div>
      )}

      {/* Important emails */}
      <div className="flex-1 overflow-y-auto px-3 py-2 flex flex-col gap-1.5 min-h-0">
        {important.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2">
            <Mail size={24} className="text-text-muted" />
            <p className="text-text-muted text-xs">Inbox looks clear</p>
          </div>
        ) : (
          important.map((item, i) => {
            const isExpanded = expanded === i;
            return (
              <div
                key={i}
                onClick={() => setExpanded(isExpanded ? null : i)}
                className="bg-surface-raised border border-border-subtle rounded-lg px-3 py-2 cursor-pointer hover:border-accent-primary/50 transition-colors"
              >
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <ActionBadge action={item.action} />
                      <span className="text-[10px] font-mono text-text-muted truncate">{item.date}</span>
                    </div>
                    <p className="text-xs font-medium text-text-primary leading-snug truncate">
                      {item.subject}
                    </p>
                    <p className="text-[10px] text-text-muted truncate">{item.sender}</p>
                    {isExpanded && (
                      <p className="text-[11px] text-accent-secondary mt-1.5 leading-relaxed">
                        {item.reason}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
