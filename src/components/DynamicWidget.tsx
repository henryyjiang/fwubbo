/**
 * Dynamic Widget Loader
 *
 * Loads LLM-generated widget.tsx at runtime:
 *   1. Fetch TSX source from backend
 *   2. Transpile TSX → CJS with Sucrase (in-browser, fast)
 *   3. Resolve all `require()` calls against a pre-imported module map
 *   4. Evaluate in a sandboxed function scope
 *   5. Cache the resulting React component
 *
 * Why CJS? Sucrase's `imports` transform converts ES imports to require() calls,
 * which we intercept with a custom require function. This avoids needing
 * blob URLs or import maps, and works reliably in all browsers.
 */

import React, { useState, useEffect } from "react";
import { transform } from "sucrase";
import * as ReactModule from "react";
import * as LucideReact from "lucide-react";
import * as Recharts from "recharts";

const API_BASE = "http://localhost:9120";

// ─── Pre-resolved module map ─────────────────────────────────────
// Every library a generated widget might import must be here.
// Sucrase will convert `import { X } from "react"` into `var _react = require("react")`
// and our custom require() resolves from this map.

const MODULE_MAP: Record<string, unknown> = {
  react: ReactModule,
  "lucide-react": LucideReact,
  recharts: Recharts,
};

// ─── Component cache ─────────────────────────────────────────────
const componentCache = new Map<string, React.ComponentType<WidgetRenderProps>>();
// Tracks modules that failed to load — don't retry indefinitely
const failedModules = new Map<string, string>();

interface WidgetRenderProps {
  moduleId: string;
  data: Record<string, unknown> | null;
  loading: boolean;
  error: string | null;
  lastUpdated: string | null;
}

/**
 * Transpile TSX source → CommonJS-style JS using Sucrase.
 */
function transpileTsx(tsxSource: string): string {
  const result = transform(tsxSource, {
    transforms: ["typescript", "jsx", "imports"],
    jsxRuntime: "classic",
    production: true,
  });
  return result.code;
}

/**
 * Evaluate transpiled JS and extract the default export.
 *
 * Creates a function scope with:
 *   - require() → resolves from MODULE_MAP
 *   - module.exports / exports → captures the default export
 *   - React → injected directly (many widgets use React.createElement via JSX)
 */
function evaluateModule(jsSource: string): React.ComponentType<WidgetRenderProps> {
  const customRequire = (specifier: string): unknown => {
    const mod = MODULE_MAP[specifier];
    if (mod) return mod;
    // Some Sucrase output uses require("react/jsx-runtime") — map to react
    if (specifier.startsWith("react/") || specifier.startsWith("react\\")) {
      return MODULE_MAP["react"];
    }
    throw new Error(`Widget requires unknown module: "${specifier}"`);
  };

  const moduleObj: { exports: Record<string, unknown> } = { exports: {} };

  // The IIFE wrapper gives the evaluated code its own scope with CJS globals.
  // Tauri IPC globals are shadowed to undefined so widget code cannot access
  // the native bridge via bare identifier references.
  const wrappedSource = `
    (function(require, module, exports,
              __TAURI__, __TAURI_IPC__, __TAURI_INTERNALS__, __TAURI_INVOKE_HANDLER__) {
      ${jsSource}
    })
  `;

  // eslint-disable-next-line no-eval
  const factory = (0, eval)(wrappedSource);
  factory(customRequire, moduleObj, moduleObj.exports,
          undefined, undefined, undefined, undefined);

  // Sucrase puts the default export on exports.default
  const defaultExport = moduleObj.exports.default ?? moduleObj.exports;

  if (typeof defaultExport !== "function") {
    // Try to find any exported function (sometimes named exports)
    const funcExport = Object.values(moduleObj.exports).find(
      (v) => typeof v === "function"
    );
    if (funcExport) {
      return funcExport as React.ComponentType<WidgetRenderProps>;
    }
    throw new Error(
      "Widget module has no default export function. " +
        `Found exports: [${Object.keys(moduleObj.exports).join(", ")}]`
    );
  }

  return defaultExport as React.ComponentType<WidgetRenderProps>;
}

/**
 * Full pipeline: fetch source → transpile → evaluate → cache.
 */
async function loadWidgetComponent(
  moduleId: string
): Promise<React.ComponentType<WidgetRenderProps>> {
  // Check cache
  const cached = componentCache.get(moduleId);
  if (cached) return cached;

  // Check failure cache
  const failReason = failedModules.get(moduleId);
  if (failReason) {
    throw new Error(failReason);
  }

  // Fetch source from backend
  let res: Response;
  try {
    res = await fetch(
      `${API_BASE}/api/generate/module/${moduleId}/widget-source`,
      { signal: AbortSignal.timeout(5000) }
    );
  } catch (e) {
    const msg = `Backend unreachable for "${moduleId}"`;
    failedModules.set(moduleId, msg);
    // Allow retry after 30 seconds
    setTimeout(() => failedModules.delete(moduleId), 30000);
    throw new Error(msg);
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    const msg = `Failed to fetch widget source for "${moduleId}": ${res.status} ${detail}`;
    failedModules.set(moduleId, msg);
    setTimeout(() => failedModules.delete(moduleId), 30000);
    throw new Error(msg);
  }

  const { source } = (await res.json()) as { source: string };

  if (!source || typeof source !== "string") {
    throw new Error(`Empty or invalid source returned for "${moduleId}"`);
  }

  // Transpile TSX → CJS
  let jsSource: string;
  try {
    jsSource = transpileTsx(source);
  } catch (e) {
    throw new Error(`TSX transpilation failed for "${moduleId}": ${e}`);
  }

  // Evaluate
  let Component: React.ComponentType<WidgetRenderProps>;
  try {
    Component = evaluateModule(jsSource);
  } catch (e) {
    throw new Error(`Widget evaluation failed for "${moduleId}": ${e}`);
  }

  // Cache
  componentCache.set(moduleId, Component);
  return Component;
}

/**
 * Clear cache — call when a module is regenerated.
 */
export function clearWidgetCache(moduleId?: string) {
  if (moduleId) {
    componentCache.delete(moduleId);
    failedModules.delete(moduleId);
  } else {
    componentCache.clear();
    failedModules.clear();
  }
}

// ─── DynamicWidget React Component ───────────────────────────────
// This is what gets rendered in the WidgetGrid for LLM-generated modules.

export function DynamicWidget({
  moduleId,
  data,
  loading: dataLoading,
  error: dataError,
  lastUpdated,
}: {
  moduleId: string;
  data: Record<string, unknown> | null;
  loading: boolean;
  error: string | null;
  lastUpdated: string | null;
}) {
  const [Component, setComponent] =
    useState<React.ComponentType<WidgetRenderProps> | null>(null);
  const [compileError, setCompileError] = useState<string | null>(null);
  const [compiling, setCompiling] = useState(true);

  useEffect(() => {
    let cancelled = false;

    setCompiling(true);
    setCompileError(null);

    loadWidgetComponent(moduleId)
      .then((Comp) => {
        if (!cancelled) {
          setComponent(() => Comp);
          setCompiling(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          console.error(`[DynamicWidget:${moduleId}]`, err);
          setCompileError(err.message ?? String(err));
          setCompiling(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [moduleId]);

  // ── Compiling state ──────────────────────────────────────────
  if (compiling) {
    return (
      <div className="flex flex-col gap-3 animate-pulse h-full justify-center">
        <div className="h-4 bg-surface-overlay rounded w-2/3" />
        <div className="h-3 bg-surface-overlay rounded w-1/2" />
        <div className="h-3 bg-surface-overlay rounded w-1/3" />
        <p className="text-text-muted text-[11px] mt-2 font-mono">
          Compiling widget...
        </p>
      </div>
    );
  }

  // ── Compile error ────────────────────────────────────────────
  if (compileError) {
    return (
      <div className="no-drag flex flex-col gap-2 h-full justify-center">
        <p className="text-status-error text-sm font-semibold">
          Widget failed to compile
        </p>
        <pre className="text-[11px] text-text-muted font-mono whitespace-pre-wrap break-all leading-relaxed p-2 rounded bg-surface-overlay max-h-40 overflow-auto select-text cursor-text">
          {compileError}
        </pre>
        <button
          onClick={(e) => {
            navigator.clipboard.writeText(compileError);
            const btn = e.currentTarget;
            btn.textContent = "Copied!";
            setTimeout(() => { btn.textContent = "Copy error"; }, 1500);
          }}
          className="text-xs text-accent-primary hover:underline self-start"
        >
          Copy error
        </button>
      </div>
    );
  }

  if (!Component) return null;

  // ── Render the widget ────────────────────────────────────────
  // Wrap in an error boundary so a runtime crash doesn't kill the whole grid
  return (
    <WidgetRuntimeBoundary moduleId={moduleId}>
      <Component
        moduleId={moduleId}
        data={data}
        loading={dataLoading}
        error={dataError}
        lastUpdated={lastUpdated}
      />
    </WidgetRuntimeBoundary>
  );
}

// ─── Runtime Error Boundary ──────────────────────────────────────
// Catches errors INSIDE the dynamically loaded widget during render/effects.

interface BoundaryProps {
  moduleId: string;
  children: React.ReactNode;
}
interface BoundaryState {
  error: string | null;
}

class WidgetRuntimeBoundary extends React.Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error: error.message };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error(`[Widget:${this.props.moduleId} runtime]`, error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="no-drag flex flex-col gap-2 h-full justify-center">
          <p className="text-status-error text-sm font-semibold">
            Widget crashed at runtime
          </p>
          <pre className="text-[11px] text-text-muted font-mono whitespace-pre-wrap break-all leading-relaxed p-2 rounded bg-surface-overlay max-h-40 overflow-auto select-text cursor-text">
            {this.state.error}
          </pre>
          <div className="flex items-center gap-3">
            <button
              onClick={(e) => {
                navigator.clipboard.writeText(this.state.error || "");
                const btn = e.currentTarget;
                btn.textContent = "Copied!";
                setTimeout(() => { btn.textContent = "Copy error"; }, 1500);
              }}
              className="text-xs text-accent-primary hover:underline"
            >
              Copy error
            </button>
            <button
              onClick={() => {
                clearWidgetCache(this.props.moduleId);
                this.setState({ error: null });
              }}
              className="text-xs text-accent-primary hover:underline"
            >
              Recompile and retry
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
