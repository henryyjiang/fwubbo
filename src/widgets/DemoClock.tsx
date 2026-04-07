import React, { useState, useEffect } from "react";

export function DemoClockWidget({ data: _data }: { data: Record<string, unknown> | null }) {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  const hours = time.getHours().toString().padStart(2, "0");
  const minutes = time.getMinutes().toString().padStart(2, "0");
  const seconds = time.getSeconds().toString().padStart(2, "0");

  const greeting =
    time.getHours() < 12 ? "Good morning" : time.getHours() < 18 ? "Good afternoon" : "Good evening";

  return (
    <div className="flex flex-col items-center justify-center h-full gap-2">
      <p className="text-text-muted text-sm font-body">{greeting}</p>
      <div className="font-display font-bold text-text-primary" style={{ fontSize: "3rem", lineHeight: 1, letterSpacing: "-0.03em" }}>
        <span>{hours}</span>
        <span className="text-accent-primary animate-pulse">:</span>
        <span>{minutes}</span>
        <span className="text-text-muted text-2xl ml-1">{seconds}</span>
      </div>
      <p className="text-text-muted text-xs font-body mt-1">
        {time.toLocaleDateString("en-US", {
          weekday: "long",
          month: "long",
          day: "numeric",
          year: "numeric",
        })}
      </p>
    </div>
  );
}
