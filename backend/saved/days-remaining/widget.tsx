import React from "react";

interface WidgetProps {
  data: Record<string, any> | null;
  loading: boolean;
  error: string | null;
  lastUpdated: string | null;
}

export default function Widget({ data, loading, error }: WidgetProps) {
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 animate-pulse">
        <div className="h-16 w-32 rounded-lg bg-surface-raised" />
        <div className="h-3 w-24 rounded bg-surface-raised" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex items-center justify-center h-full px-4">
        <span className="text-status-error text-sm text-center">{error ?? "No data"}</span>
      </div>
    );
  }

  const { days_remaining, target_date } = data;
  const isToday = days_remaining === 0;
  const isPast = days_remaining < 0;
  const count = Math.abs(days_remaining);

  return (
    <div className="flex flex-col items-center justify-center h-full gap-1 px-4">
      <div className="font-display font-bold text-[clamp(3rem,12cqw,6rem)] leading-none tabular-nums text-text-primary">
        {count}
      </div>
      <div className="text-text-muted text-xs font-body text-center">
        {isToday
          ? `Today — ${target_date}`
          : isPast
          ? `day${count === 1 ? "" : "s"} since ${target_date}`
          : `day${count === 1 ? "" : "s"} until ${target_date}`}
      </div>
    </div>
  );
}
