import React, { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import {
  X,
  Settings,
  Save,
  Loader2,
  CheckCircle,
  Eye,
  EyeOff,
  RotateCcw,
} from "lucide-react";
import { getModuleConfig, updateModuleConfig, fetchModuleData } from "@/api/client";
import { useDashboardStore } from "@/stores/dashboard";
import type { SettingField } from "@/types";

export function WidgetSettingsPanel() {
  const { settingsModule, setSettingsModule, modules } = useDashboardStore();

  if (!settingsModule) return null;

  const mod = modules[settingsModule];
  if (!mod) return null;

  return (
    <SettingsContent
      moduleId={settingsModule}
      moduleName={mod.manifest.name}
      onClose={() => setSettingsModule(null)}
    />
  );
}

function SettingsContent({
  moduleId,
  moduleName,
  onClose,
}: {
  moduleId: string;
  moduleName: string;
  onClose: () => void;
}) {
  const [settings, setSettings] = useState<SettingField[]>([]);
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [originalValues, setOriginalValues] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revealedPasswords, setRevealedPasswords] = useState<Set<string>>(new Set());

  // Load config on mount
  useEffect(() => {
    setLoading(true);
    getModuleConfig(moduleId)
      .then(({ config, settings: settingsSchema }) => {
        setSettings(settingsSchema);
        // Merge defaults with saved config
        const merged: Record<string, unknown> = {};
        for (const s of settingsSchema) {
          merged[s.key] = config[s.key] ?? s.default ?? "";
        }
        setValues(merged);
        setOriginalValues({ ...merged });
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, [moduleId]);

  const hasChanges = JSON.stringify(values) !== JSON.stringify(originalValues);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      await updateModuleConfig(moduleId, values);
      setOriginalValues({ ...values });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);

      // Re-fetch data so the widget immediately reflects the new config.
      // fetch.py reads config via FWUBBO_CONFIG, so it needs to re-run.
      fetchModuleData(moduleId).then((result) => {
        useDashboardStore.getState().updateModuleData(moduleId, result);
      }).catch(() => {});
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    const defaults: Record<string, unknown> = {};
    for (const s of settings) {
      defaults[s.key] = s.default ?? "";
    }
    setValues(defaults);
  };

  const togglePasswordVisibility = (key: string) => {
    setRevealedPasswords((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 300 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 300 }}
      transition={{ duration: 0.25, ease: [0.23, 1, 0.32, 1] }}
      className="fixed right-0 top-0 h-full w-[380px] z-[60] flex flex-col overflow-hidden"
      style={{
        background: "var(--surface-base)",
        borderLeft: "1px solid var(--border-subtle)",
        boxShadow: "-8px 0 40px rgba(0,0,0,0.3)",
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-border-subtle shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <Settings className="w-4 h-4 text-accent-primary shrink-0" />
          <h2 className="text-base font-display font-semibold text-text-primary truncate">
            {moduleName}
          </h2>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-overlay transition-colors shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-5 py-4">
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <Loader2 className="w-5 h-5 animate-spin text-text-muted" />
          </div>
        ) : error ? (
          <div className="text-sm text-status-error font-mono p-3 rounded-lg bg-surface-overlay">
            {error}
          </div>
        ) : settings.length === 0 ? (
          <div className="text-sm text-text-muted text-center py-8">
            This widget has no configurable settings.
          </div>
        ) : (
          <div className="space-y-5">
            {settings.map((setting) => (
              <SettingInput
                key={setting.key}
                setting={setting}
                value={values[setting.key] ?? ""}
                onChange={(val) =>
                  setValues((prev) => ({ ...prev, [setting.key]: val }))
                }
                passwordRevealed={revealedPasswords.has(setting.key)}
                onTogglePassword={() => togglePasswordVisibility(setting.key)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      {settings.length > 0 && !loading && (
        <div className="shrink-0 border-t border-border-subtle px-5 py-3 flex items-center gap-2">
          <button
            onClick={handleReset}
            className="px-3 py-2 rounded-lg text-xs text-text-muted hover:text-text-secondary hover:bg-surface-overlay transition-colors flex items-center gap-1.5"
          >
            <RotateCcw className="w-3 h-3" />
            Defaults
          </button>
          <div className="flex-1" />
          {saved && (
            <motion.span
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-xs text-status-ok flex items-center gap-1"
            >
              <CheckCircle className="w-3 h-3" />
              Saved
            </motion.span>
          )}
          <button
            onClick={handleSave}
            disabled={saving || !hasChanges}
            className="px-4 py-2 rounded-lg text-sm font-semibold font-display transition-all flex items-center gap-1.5 disabled:opacity-40"
            style={{
              background: hasChanges ? "var(--accent-primary)" : "var(--surface-overlay)",
              color: hasChanges ? "var(--surface-base)" : "var(--text-muted)",
            }}
          >
            {saving ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Save className="w-3.5 h-3.5" />
            )}
            Save
          </button>
        </div>
      )}
    </motion.div>
  );
}

// ─── Individual Setting Input ──────────────────────────────────

function SettingInput({
  setting,
  value,
  onChange,
  passwordRevealed,
  onTogglePassword,
}: {
  setting: SettingField;
  value: unknown;
  onChange: (val: unknown) => void;
  passwordRevealed: boolean;
  onTogglePassword: () => void;
}) {
  const inputStyle = {
    background: "var(--surface-raised)",
    border: "1px solid var(--border-subtle)",
  };

  return (
    <div>
      <label className="block text-xs uppercase tracking-wider text-text-muted font-display mb-1.5">
        {setting.label || setting.key}
      </label>
      {setting.description && (
        <p className="text-[11px] text-text-muted mb-2">{setting.description}</p>
      )}

      {setting.type === "text" && (
        <input
          type="text"
          value={String(value ?? "")}
          onChange={(e) => onChange(e.target.value)}
          className="w-full px-3 py-2 rounded-lg text-sm font-body text-text-primary placeholder-text-muted focus:outline-none focus:ring-1 focus:ring-accent-primary"
          style={inputStyle}
        />
      )}

      {setting.type === "password" && (
        <div className="relative">
          <input
            type={passwordRevealed ? "text" : "password"}
            value={String(value ?? "")}
            onChange={(e) => onChange(e.target.value)}
            placeholder="Enter API key..."
            className="w-full px-3 py-2 pr-10 rounded-lg text-sm font-mono text-text-primary placeholder-text-muted focus:outline-none focus:ring-1 focus:ring-accent-primary"
            style={inputStyle}
          />
          <button
            type="button"
            onClick={onTogglePassword}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-text-muted hover:text-text-secondary transition-colors"
          >
            {passwordRevealed ? (
              <EyeOff className="w-3.5 h-3.5" />
            ) : (
              <Eye className="w-3.5 h-3.5" />
            )}
          </button>
        </div>
      )}

      {setting.type === "number" && (
        <input
          type="number"
          value={String(value ?? "")}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-full px-3 py-2 rounded-lg text-sm font-mono text-text-primary placeholder-text-muted focus:outline-none focus:ring-1 focus:ring-accent-primary"
          style={inputStyle}
        />
      )}

      {setting.type === "select" && (
        <select
          value={String(value ?? "")}
          onChange={(e) => onChange(e.target.value)}
          className="w-full px-3 py-2 rounded-lg text-sm font-body text-text-primary focus:outline-none focus:ring-1 focus:ring-accent-primary cursor-pointer"
          style={inputStyle}
        >
          {(setting.options ?? []).map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      )}

      {setting.type === "toggle" && (
        <button
          type="button"
          onClick={() => onChange(!value)}
          className="relative w-10 h-5 rounded-full transition-colors"
          style={{
            background: value
              ? "var(--accent-primary)"
              : "var(--surface-overlay)",
          }}
        >
          <div
            className="absolute top-0.5 w-4 h-4 rounded-full transition-transform"
            style={{
              background: "var(--text-primary)",
              transform: value ? "translateX(22px)" : "translateX(2px)",
            }}
          />
        </button>
      )}
    </div>
  );
}
