import React, { useState, useEffect } from "react";
import { Activity, Cpu, HardDrive, Zap, Monitor, Clock } from "lucide-react";
import { getSystemInfo, checkBackendHealth, isTauri } from "@/tauri/bridge";
import type { SystemInfo } from "@/tauri/bridge";

export function DemoStatusWidget({ data: _data }: { data: Record<string, unknown> | null }) {
  const [sysInfo, setSysInfo] = useState<SystemInfo | null>(null);
  const [backendOk, setBackendOk] = useState<boolean | null>(null);

  useEffect(() => {
    let mounted = true;

    const refresh = async () => {
      try {
        const [info, health] = await Promise.all([
          getSystemInfo(),
          checkBackendHealth(),
        ]);
        if (mounted) {
          setSysInfo(info);
          setBackendOk(health);
        }
      } catch {
        if (mounted) setBackendOk(false);
      }
    };

    refresh();
    const interval = setInterval(refresh, 5000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  const formatUptime = (secs: number) => {
    if (!secs) return "—";
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    if (h > 24) return `${Math.floor(h / 24)}d ${h % 24}h`;
    return `${h}h ${m}m`;
  };

  const formatMemory = (used: number, total: number) => {
    if (!total) return "—";
    return `${(used / 1024).toFixed(1)} / ${(total / 1024).toFixed(1)} GB`;
  };

  const stats = [
    {
      label: "Backend",
      value: backendOk === null ? "..." : backendOk ? "Online" : "Offline",
      icon: <Activity className="w-4 h-4" />,
      ok: backendOk === true,
      error: backendOk === false,
    },
    {
      label: "CPU",
      value: sysInfo ? `${sysInfo.cpu_usage_percent.toFixed(0)}% (${sysInfo.cpu_count} cores)` : "...",
      icon: <Cpu className="w-4 h-4" />,
      accent: true,
    },
    {
      label: "Memory",
      value: sysInfo ? formatMemory(sysInfo.used_memory_mb, sysInfo.total_memory_mb) : "...",
      icon: <HardDrive className="w-4 h-4" />,
    },
    {
      label: "Uptime",
      value: sysInfo ? formatUptime(sysInfo.uptime_secs) : "...",
      icon: <Clock className="w-4 h-4" />,
    },
    {
      label: "Host",
      value: sysInfo ? sysInfo.hostname : "...",
      icon: <Monitor className="w-4 h-4" />,
    },
    {
      label: "Runtime",
      value: isTauri() ? "Tauri" : "Browser",
      icon: <Zap className="w-4 h-4" />,
      accent: isTauri(),
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 h-full content-center">
      {stats.map((s) => (
        <div key={s.label} className="flex items-center gap-2.5 p-2 rounded-lg hover:bg-surface-overlay transition-colors">
          <div className={`${s.accent ? "text-accent-primary" : s.ok ? "text-status-ok" : s.error ? "text-status-error" : "text-text-muted"}`}>
            {s.icon}
          </div>
          <div>
            <div className="text-[11px] text-text-muted font-body">{s.label}</div>
            <div className={`text-sm font-semibold font-mono ${s.ok ? "text-status-ok" : s.error ? "text-status-error" : "text-text-primary"}`}>
              {s.value}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
