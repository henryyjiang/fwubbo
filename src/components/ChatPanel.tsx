import React, { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  Sparkles,
  Send,
  Loader2,
  CheckCircle,
  AlertTriangle,
  RotateCcw,
  Bot,
  User,
  Pencil,
  RefreshCw,
} from "lucide-react";
import { streamChat, resetChat, fetchModuleData } from "@/api/client";
import { useDashboardStore } from "@/stores/dashboard";
import { clearWidgetCache } from "./DynamicWidget";
import type { ModuleManifest } from "@/types";

interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
  moduleEvent?: {
    type: "module_created" | "module_updated" | "error";
    moduleId?: string;
    manifest?: Record<string, unknown>;
    warnings?: string[];
    error?: string;
  };
}

export function ChatPanel({ onClose }: { onClose: () => void }) {
  const {
    registerModule,
    setLayouts,
    modules,
    editModuleId,
    setEditModuleId,
  } = useDashboardStore();

  // The module this chat session is bound to (for iteration)
  const [boundModuleId, setBoundModuleId] = useState<string | null>(editModuleId);
  // Whether we've sent the first message with module_id context
  const sentInitialContext = useRef(false);

  const editingModule = boundModuleId ? modules[boundModuleId] : null;
  const editingName = editingModule?.manifest.name ?? boundModuleId;

  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    if (editModuleId && modules[editModuleId]) {
      return [
        {
          role: "system",
          content: `Editing **${modules[editModuleId].manifest.name}**. Describe what you'd like to change — colors, layout, data, features — and I'll update it.`,
        },
      ];
    }
    return [
      {
        role: "system",
        content:
          "Hi! I'm Fwubbo. Tell me what kind of widget you'd like to build, and I'll help you create it. I can make weather displays, data trackers, charts, news feeds, and more.",
      },
    ];
  });
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [sessionId] = useState(
    () => `session-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (ta) {
      ta.style.height = "auto";
      ta.style.height = Math.min(ta.scrollHeight, 120) + "px";
    }
  }, [input]);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || streaming) return;

    setInput("");
    setStreaming(true);

    // Add user message
    const userMsg: ChatMessage = { role: "user", content: text };
    setMessages((prev) => [...prev, userMsg]);

    // Add placeholder for assistant
    const assistantMsg: ChatMessage = { role: "assistant", content: "" };
    setMessages((prev) => [...prev, assistantMsg]);

    // Pass module_id on the first message to bind this session to the module.
    // After binding, the backend injects fresh source on every subsequent message
    // automatically via _session_modules — no need to keep sending module_id.
    let moduleIdForRequest: string | undefined;
    if (boundModuleId && !sentInitialContext.current) {
      moduleIdForRequest = boundModuleId;
      sentInitialContext.current = true;
    }

    try {
      for await (const event of streamChat(sessionId, text, moduleIdForRequest)) {
        if (event.type === "text" && event.content) {
          // Append text to the last assistant message
          setMessages((prev) => {
            const updated = [...prev];
            const last = updated[updated.length - 1];
            if (last.role === "assistant") {
              updated[updated.length - 1] = {
                ...last,
                content: last.content + event.content,
              };
            }
            return updated;
          });
        } else if (event.type === "module_created") {
          // Brand new module — register + add to layout
          const manifest = event.manifest as unknown as ModuleManifest;
          registerModule(manifest);
          clearWidgetCache(event.module_id);

          // Add to layout
          const maxY = useDashboardStore
            .getState()
            .layouts.reduce((max, l) => Math.max(max, l.y + l.h), 0);
          useDashboardStore.getState().setLayouts([
            ...useDashboardStore.getState().layouts,
            {
              i: event.module_id!,
              x: 0,
              y: maxY,
              w: manifest.widget?.default_w ?? 4,
              h: manifest.widget?.default_h ?? 3,
              minW: manifest.widget?.min_w ?? 3,
              minH: manifest.widget?.min_h ?? 2,
            },
          ]);

          // Bind this session to the new module for iteration
          if (event.session_module_id) {
            setBoundModuleId(event.session_module_id);
          }

          // Add module event to message
          setMessages((prev) => {
            const updated = [...prev];
            const last = updated[updated.length - 1];
            if (last.role === "assistant") {
              updated[updated.length - 1] = {
                ...last,
                moduleEvent: {
                  type: "module_created",
                  moduleId: event.module_id,
                  manifest: event.manifest,
                  warnings: event.warnings,
                },
              };
            }
            return updated;
          });
        } else if (event.type === "module_updated") {
          // Existing module updated in place — re-register manifest, clear cache, NO new layout
          const manifest = event.manifest as unknown as ModuleManifest;
          registerModule(manifest);
          clearWidgetCache(event.module_id);

          // Re-fetch data so the updated widget renders with fresh data
          if (event.module_id) {
            fetchModuleData(event.module_id).then((result) => {
              useDashboardStore.getState().updateModuleData(event.module_id!, result);
            }).catch(() => {});
          }

          // Update bound module id (should already be the same)
          if (event.session_module_id) {
            setBoundModuleId(event.session_module_id);
          }

          setMessages((prev) => {
            const updated = [...prev];
            const last = updated[updated.length - 1];
            if (last.role === "assistant") {
              updated[updated.length - 1] = {
                ...last,
                moduleEvent: {
                  type: "module_updated",
                  moduleId: event.module_id,
                  manifest: event.manifest,
                  warnings: event.warnings,
                },
              };
            }
            return updated;
          });
        } else if (event.type === "error") {
          setMessages((prev) => {
            const updated = [...prev];
            const last = updated[updated.length - 1];
            if (last.role === "assistant") {
              updated[updated.length - 1] = {
                ...last,
                content: last.content || "Something went wrong.",
                moduleEvent: { type: "error", error: event.error },
              };
            }
            return updated;
          });
        }
        // "done" event — just stop streaming
      }
    } catch (err) {
      setMessages((prev) => {
        const updated = [...prev];
        const last = updated[updated.length - 1];
        if (last.role === "assistant" && !last.content) {
          updated[updated.length - 1] = {
            ...last,
            content: "Connection error — is the backend running?",
            moduleEvent: {
              type: "error",
              error: err instanceof Error ? err.message : String(err),
            },
          };
        }
        return updated;
      });
    } finally {
      setStreaming(false);
    }
  }, [input, streaming, sessionId, registerModule, boundModuleId]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleReset = async () => {
    await resetChat(sessionId).catch(() => {});
    setBoundModuleId(null);
    setEditModuleId(null);
    sentInitialContext.current = false;
    setMessages([
      {
        role: "system",
        content: "Chat reset! What would you like to build?",
      },
    ]);
  };

  const handleClose = () => {
    setEditModuleId(null);
    onClose();
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 300 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 300 }}
      transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
      className="fixed right-0 top-0 h-full w-[460px] z-50 flex flex-col overflow-hidden"
      style={{
        background: "var(--surface-base)",
        borderLeft: "1px solid var(--border-subtle)",
        boxShadow: "-8px 0 40px rgba(0,0,0,0.3)",
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-border-subtle shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          {boundModuleId ? (
            <Pencil className="w-4 h-4 text-accent-primary shrink-0" />
          ) : (
            <Sparkles className="w-5 h-5 text-accent-primary shrink-0" />
          )}
          <div className="min-w-0">
            <h2 className="text-lg font-display font-semibold text-text-primary truncate">
              {boundModuleId ? "Edit Widget" : "Build a Widget"}
            </h2>
            {boundModuleId && (
              <p className="text-[11px] text-text-muted font-mono truncate -mt-0.5">
                {editingName}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={handleReset}
            className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-overlay transition-colors"
            title="New conversation"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
          <button
            onClick={handleClose}
            className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-overlay transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {messages.map((msg, i) => (
          <MessageBubble key={i} message={msg} />
        ))}
        {streaming && (
          <div className="flex items-center gap-2 text-text-muted text-xs px-2">
            <Loader2 className="w-3 h-3 animate-spin" />
            <span className="font-mono">Fwubbo is thinking...</span>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="shrink-0 border-t border-border-subtle px-4 py-3">
        <div
          className="flex items-end gap-2 rounded-xl px-3 py-2"
          style={{
            background: "var(--surface-raised)",
            border: "1px solid var(--border-subtle)",
          }}
        >
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              boundModuleId
                ? "Describe what to change..."
                : "Describe a widget, ask a question, or request changes..."
            }
            className="flex-1 bg-transparent text-sm font-body text-text-primary placeholder-text-muted resize-none focus:outline-none"
            style={{ minHeight: "20px", maxHeight: "120px" }}
            rows={1}
            disabled={streaming}
          />
          <button
            onClick={handleSend}
            disabled={streaming || !input.trim()}
            className="p-1.5 rounded-lg transition-all shrink-0 disabled:opacity-30"
            style={{
              color: input.trim() ? "var(--accent-primary)" : "var(--text-muted)",
            }}
          >
            {streaming ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </button>
        </div>
        <p className="text-[10px] text-text-muted mt-1.5 px-1">
          Shift+Enter for new line
          {boundModuleId && " · Editing mode — changes update the existing widget"}
        </p>
      </div>
    </motion.div>
  );
}

// ─── Message Bubble ─────────────────────────────────────────────

function MessageBubble({ message }: { message: ChatMessage }) {
  if (message.role === "system") {
    return (
      <div className="flex items-start gap-2.5 px-1">
        <div
          className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
          style={{ background: "var(--accent-primary)", opacity: 0.15 }}
        >
          <Bot className="w-4 h-4 text-accent-primary" />
        </div>
        <div className="text-sm text-text-secondary leading-relaxed pt-1">
          <FormattedContent content={message.content} />
        </div>
      </div>
    );
  }

  if (message.role === "user") {
    return (
      <div className="flex items-start gap-2.5 justify-end px-1">
        <div
          className="rounded-2xl rounded-br-md px-3.5 py-2 text-sm leading-relaxed max-w-[85%]"
          style={{
            background: "var(--accent-primary)",
            color: "var(--surface-base)",
          }}
        >
          {message.content}
        </div>
      </div>
    );
  }

  // Assistant message
  return (
    <div className="flex items-start gap-2.5 px-1">
      <div
        className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
        style={{ background: "var(--accent-primary)", opacity: 0.15 }}
      >
        <Bot className="w-4 h-4 text-accent-primary" />
      </div>
      <div className="flex-1 min-w-0 space-y-2">
        {message.content && (
          <div className="text-sm text-text-primary leading-relaxed whitespace-pre-wrap break-words">
            <FormattedContent content={message.content} />
          </div>
        )}

        {/* Module creation event */}
        {message.moduleEvent?.type === "module_created" && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-3 rounded-lg border"
            style={{
              borderColor: "var(--status-ok)",
              background: "color-mix(in srgb, var(--status-ok) 8%, transparent)",
            }}
          >
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-status-ok shrink-0" />
              <span className="text-sm font-medium text-text-primary">
                Widget created!
              </span>
            </div>
            <p className="text-xs text-text-muted mt-1 font-mono">
              {message.moduleEvent.moduleId}
            </p>
            {message.moduleEvent.warnings && message.moduleEvent.warnings.length > 0 && (
              <div className="mt-2 space-y-0.5">
                {message.moduleEvent.warnings.map((w, i) => (
                  <p key={i} className="text-[10px] text-status-warn font-mono">
                    ⚠ {w}
                  </p>
                ))}
              </div>
            )}
          </motion.div>
        )}

        {/* Module updated event */}
        {message.moduleEvent?.type === "module_updated" && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-3 rounded-lg border"
            style={{
              borderColor: "var(--accent-primary)",
              background: "color-mix(in srgb, var(--accent-primary) 8%, transparent)",
            }}
          >
            <div className="flex items-center gap-2">
              <RefreshCw className="w-4 h-4 text-accent-primary shrink-0" />
              <span className="text-sm font-medium text-text-primary">
                Widget updated!
              </span>
            </div>
            <p className="text-xs text-text-muted mt-1 font-mono">
              {message.moduleEvent.moduleId}
            </p>
            {message.moduleEvent.warnings && message.moduleEvent.warnings.length > 0 && (
              <div className="mt-2 space-y-0.5">
                {message.moduleEvent.warnings.map((w, i) => (
                  <p key={i} className="text-[10px] text-status-warn font-mono">
                    ⚠ {w}
                  </p>
                ))}
              </div>
            )}
          </motion.div>
        )}

        {/* Error event */}
        {message.moduleEvent?.type === "error" && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-3 rounded-lg border"
            style={{
              borderColor: "var(--status-error)",
              background: "color-mix(in srgb, var(--status-error) 8%, transparent)",
            }}
          >
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-status-error shrink-0" />
              <span className="text-sm font-medium text-text-primary">Error</span>
            </div>
            <p className="text-xs text-text-muted mt-1 font-mono">
              {message.moduleEvent.error}
            </p>
          </motion.div>
        )}
      </div>
    </div>
  );
}

// ─── Simple Markdown-ish Formatter ──────────────────────────────
// Handles **bold**, `code`, and code blocks in assistant responses

function FormattedContent({ content }: { content: string }) {
  // Strip out the <FWUBBO_MODULE> blocks from display
  const cleaned = content.replace(/<FWUBBO_MODULE>[\s\S]*?<\/FWUBBO_MODULE>/g, "").trim();
  if (!cleaned) return null;

  // Split by code blocks first
  const parts = cleaned.split(/(```[\s\S]*?```)/g);

  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith("```")) {
          // Code block
          const lines = part.slice(3, -3).split("\n");
          const lang = lines[0]?.trim();
          const code = (lang && !lang.includes(" ") ? lines.slice(1) : lines).join("\n").trim();
          return (
            <pre
              key={i}
              className="text-[11px] font-mono p-2.5 rounded-lg my-1.5 overflow-x-auto"
              style={{
                background: "var(--surface-overlay)",
                border: "1px solid var(--border-subtle)",
              }}
            >
              {code}
            </pre>
          );
        }
        // Inline formatting
        return <InlineFormatted key={i} text={part} />;
      })}
    </>
  );
}

function InlineFormatted({ text }: { text: string }) {
  // Bold and inline code
  const tokens = text.split(/(\*\*.*?\*\*|`[^`]+`)/g);
  return (
    <>
      {tokens.map((token, i) => {
        if (token.startsWith("**") && token.endsWith("**")) {
          return <strong key={i} className="font-semibold">{token.slice(2, -2)}</strong>;
        }
        if (token.startsWith("`") && token.endsWith("`")) {
          return (
            <code
              key={i}
              className="text-[12px] font-mono px-1 py-0.5 rounded"
              style={{ background: "var(--surface-overlay)" }}
            >
              {token.slice(1, -1)}
            </code>
          );
        }
        return <React.Fragment key={i}>{token}</React.Fragment>;
      })}
    </>
  );
}
