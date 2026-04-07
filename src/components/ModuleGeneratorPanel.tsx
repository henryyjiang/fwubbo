import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  Sparkles,
  AlertTriangle,
  CheckCircle,
  Loader2,
  ChevronDown,
  ChevronUp,
  FileCode,
  Key,
} from "lucide-react";
import { generateModule } from "@/api/client";
import { useDashboardStore } from "@/stores/dashboard";
import { clearWidgetCache } from "./DynamicWidget";
import type { ModuleManifest } from "@/types";

export function ModuleGeneratorPanel({ onClose }: { onClose: () => void }) {
  const [description, setDescription] = useState("");
  const [apiDocs, setApiDocs] = useState("");
  const [apiKeyNames, setApiKeyNames] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);

  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<{
    success: boolean;
    moduleId?: string;
    moduleName?: string;
    warnings?: string[];
    error?: string;
  } | null>(null);

  const { registerModule, setLayouts, layouts } = useDashboardStore();

  const handleGenerate = async () => {
    if (!description.trim()) return;

    setGenerating(true);
    setResult(null);

    try {
      const res = await generateModule({
        description: description.trim(),
        api_docs: apiDocs.trim() || undefined,
        api_key_names: apiKeyNames
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean) || undefined,
      });

      // Register the new module in the frontend store
      const manifest = res.manifest as unknown as ModuleManifest;
      registerModule(manifest);

      // Clear any cached compilation for this module (in case of regeneration)
      clearWidgetCache(res.module_id);

      // Add to layout
      const maxY = layouts.reduce((max, l) => Math.max(max, l.y + l.h), 0);
      setLayouts([
        ...layouts,
        {
          i: res.module_id,
          x: 0,
          y: maxY,
          w: manifest.widget?.default_w ?? 4,
          h: manifest.widget?.default_h ?? 3,
          minW: manifest.widget?.min_w ?? 3,
          minH: manifest.widget?.min_h ?? 2,
        },
      ]);

      setResult({
        success: true,
        moduleId: res.module_id,
        moduleName: (manifest as Record<string, unknown>).name as string,
        warnings: res.warnings,
      });

      // Clear form on success
      setDescription("");
      setApiDocs("");
      setApiKeyNames("");
    } catch (e) {
      setResult({
        success: false,
        error: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setGenerating(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 300 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 300 }}
      transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
      className="fixed right-0 top-0 h-full w-[420px] z-50 flex flex-col overflow-hidden"
      style={{
        background: "var(--surface-base)",
        borderLeft: "1px solid var(--border-subtle)",
        boxShadow: "-8px 0 40px rgba(0,0,0,0.3)",
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-border-subtle shrink-0">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-accent-primary" />
          <h2 className="text-lg font-display font-semibold text-text-primary">
            Generate Module
          </h2>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-white/5 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Form */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
        {/* Description */}
        <div>
          <label className="block text-xs uppercase tracking-wider text-text-muted font-display mb-2">
            Describe your widget
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Show me local weather with temperature, humidity, and a 5-day forecast chart..."
            className="w-full h-32 px-3 py-2.5 rounded-lg text-sm font-body text-text-primary placeholder-text-muted resize-none focus:outline-none focus:ring-1"
            style={{
              background: "var(--surface-raised)",
              border: "1px solid var(--border-subtle)",
              focusRingColor: "var(--accent-primary)",
            }}
            disabled={generating}
          />
        </div>

        {/* Advanced toggle */}
        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="flex items-center gap-1.5 text-xs text-text-muted hover:text-text-secondary transition-colors"
        >
          {showAdvanced ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          Advanced options
        </button>

        <AnimatePresence>
          {showAdvanced && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="space-y-4 overflow-hidden"
            >
              {/* API Docs */}
              <div>
                <label className="flex items-center gap-1.5 text-xs uppercase tracking-wider text-text-muted font-display mb-2">
                  <FileCode className="w-3 h-3" />
                  API Documentation (optional)
                </label>
                <textarea
                  value={apiDocs}
                  onChange={(e) => setApiDocs(e.target.value)}
                  placeholder="Paste API docs, endpoint descriptions, or example responses..."
                  className="w-full h-24 px-3 py-2.5 rounded-lg text-xs font-mono text-text-secondary placeholder-text-muted resize-none focus:outline-none focus:ring-1"
                  style={{
                    background: "var(--surface-raised)",
                    border: "1px solid var(--border-subtle)",
                  }}
                  disabled={generating}
                />
              </div>

              {/* API Key Names */}
              <div>
                <label className="flex items-center gap-1.5 text-xs uppercase tracking-wider text-text-muted font-display mb-2">
                  <Key className="w-3 h-3" />
                  API Key Names (comma-separated)
                </label>
                <input
                  type="text"
                  value={apiKeyNames}
                  onChange={(e) => setApiKeyNames(e.target.value)}
                  placeholder="openweathermap_key, finnhub_token"
                  className="w-full px-3 py-2 rounded-lg text-sm font-mono text-text-secondary placeholder-text-muted focus:outline-none focus:ring-1"
                  style={{
                    background: "var(--surface-raised)",
                    border: "1px solid var(--border-subtle)",
                  }}
                  disabled={generating}
                />
                <p className="text-[11px] text-text-muted mt-1.5">
                  These become FWUBBO_SECRET_* env vars. Set actual values in Settings → Secrets.
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Generate Button */}
        <button
          onClick={handleGenerate}
          disabled={generating || !description.trim()}
          className="w-full py-2.5 rounded-lg text-sm font-semibold font-display transition-all flex items-center justify-center gap-2 disabled:opacity-40"
          style={{
            background: generating ? "var(--surface-overlay)" : "var(--accent-primary)",
            color: generating ? "var(--text-muted)" : "var(--surface-base)",
          }}
        >
          {generating ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Generating...
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4" />
              Generate Widget
            </>
          )}
        </button>

        {generating && (
          <p className="text-xs text-text-muted text-center">
            Claude is writing your module's fetch script, React component, and manifest...
          </p>
        )}

        {/* Result */}
        <AnimatePresence>
          {result && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className={`p-4 rounded-lg border ${
                result.success
                  ? "border-status-ok/30 bg-status-ok/5"
                  : "border-status-error/30 bg-status-error/5"
              }`}
            >
              <div className="flex items-start gap-2">
                {result.success ? (
                  <CheckCircle className="w-4 h-4 text-status-ok shrink-0 mt-0.5" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-status-error shrink-0 mt-0.5" />
                )}
                <div className="text-sm">
                  {result.success ? (
                    <>
                      <p className="text-text-primary font-medium">
                        {result.moduleName} created
                      </p>
                      <p className="text-text-muted text-xs mt-1">
                        Module <code className="font-mono">{result.moduleId}</code> is now live on
                        your dashboard.
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="text-text-primary font-medium">Generation failed</p>
                      <p className="text-text-muted text-xs mt-1 font-mono">
                        {result.error}
                      </p>
                    </>
                  )}

                  {/* Warnings */}
                  {result.warnings && result.warnings.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {result.warnings.map((w, i) => (
                        <p key={i} className="text-status-warn text-[11px] font-mono">
                          ⚠ {w}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
