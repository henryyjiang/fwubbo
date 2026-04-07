import React, { useState, useRef, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import {
  X,
  Palette,
  Send,
  Loader2,
  CheckCircle,
  AlertTriangle,
  RotateCcw,
  Bot,
  Pencil,
  RefreshCw,
} from "lucide-react";
import { streamThemeChat, resetThemeChat } from "@/api/client";
import { useDashboardStore } from "@/stores/dashboard";
import type { ThemeDefinition } from "@/types";

interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
  themeEvent?: {
    type: "theme_created" | "theme_updated" | "error";
    themeId?: string;
    theme?: Record<string, unknown>;
    warnings?: string[];
    error?: string;
  };
}

export function ThemeChatPanel({ onClose }: { onClose: () => void }) {
  const {
    registerCustomTheme,
    setTheme,
    editThemeId,
    setEditThemeId,
    customThemes,
  } = useDashboardStore();

  const [boundThemeId, setBoundThemeId] = useState<string | null>(editThemeId);
  const sentInitialContext = useRef(false);

  const editingTheme = boundThemeId ? customThemes[boundThemeId] : null;
  const editingName = editingTheme?.name ?? boundThemeId;

  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    if (editThemeId && customThemes[editThemeId]) {
      return [
        {
          role: "system",
          content: `Editing **${customThemes[editThemeId].name}**. Describe what you'd like to change — colors, fonts, effects, mood — and I'll update it.`,
        },
      ];
    }
    return [
      {
        role: "system",
        content:
          "Hi! Let's design a custom theme for your dashboard. Describe the look and feel you want — dark and moody, bright and minimal, cyberpunk, cozy, anything goes.",
      },
    ];
  });
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [sessionId] = useState(
    () => `theme-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

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

    const userMsg: ChatMessage = { role: "user", content: text };
    setMessages((prev) => [...prev, userMsg]);

    const assistantMsg: ChatMessage = { role: "assistant", content: "" };
    setMessages((prev) => [...prev, assistantMsg]);

    let themeIdForRequest: string | undefined;
    if (boundThemeId && !sentInitialContext.current) {
      themeIdForRequest = boundThemeId;
      sentInitialContext.current = true;
    }

    try {
      for await (const event of streamThemeChat(sessionId, text, themeIdForRequest)) {
        if (event.type === "text" && event.content) {
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
        } else if (event.type === "theme_created" || event.type === "theme_updated") {
          const theme = event.theme as unknown as ThemeDefinition;
          registerCustomTheme(theme);
          setTheme(theme.id);

          if (event.session_theme_id) {
            setBoundThemeId(event.session_theme_id);
          }

          setMessages((prev) => {
            const updated = [...prev];
            const last = updated[updated.length - 1];
            if (last.role === "assistant") {
              updated[updated.length - 1] = {
                ...last,
                themeEvent: {
                  type: event.type as "theme_created" | "theme_updated",
                  themeId: event.theme_id,
                  theme: event.theme,
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
                themeEvent: { type: "error", error: event.error },
              };
            }
            return updated;
          });
        }
      }
    } catch (err) {
      setMessages((prev) => {
        const updated = [...prev];
        const last = updated[updated.length - 1];
        if (last.role === "assistant" && !last.content) {
          updated[updated.length - 1] = {
            ...last,
            content: "Connection error — is the backend running?",
            themeEvent: {
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
  }, [input, streaming, sessionId, registerCustomTheme, setTheme, boundThemeId]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleReset = async () => {
    await resetThemeChat(sessionId).catch(() => {});
    setBoundThemeId(null);
    setEditThemeId(null);
    sentInitialContext.current = false;
    setMessages([
      {
        role: "system",
        content: "Chat reset! What kind of theme would you like to create?",
      },
    ]);
  };

  const handleClose = () => {
    setEditThemeId(null);
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
          {boundThemeId ? (
            <Pencil className="w-4 h-4 text-accent-primary shrink-0" />
          ) : (
            <Palette className="w-5 h-5 text-accent-primary shrink-0" />
          )}
          <div className="min-w-0">
            <h2 className="text-lg font-display font-semibold text-text-primary truncate">
              {boundThemeId ? "Edit Theme" : "Create a Theme"}
            </h2>
            {boundThemeId && (
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
          <ThemeMessageBubble key={i} message={msg} />
        ))}
        {streaming && (
          <div className="flex items-center gap-2 text-text-muted text-xs px-2">
            <Loader2 className="w-3 h-3 animate-spin" />
            <span className="font-mono">Designing your theme...</span>
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
              boundThemeId
                ? "Describe what to change..."
                : "Describe a theme — mood, colors, style..."
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
          {boundThemeId && " · Editing mode — changes update the existing theme"}
        </p>
      </div>
    </motion.div>
  );
}

// ─── Theme Message Bubble ───────────────────────────────────────

function ThemeMessageBubble({ message }: { message: ChatMessage }) {
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

        {message.themeEvent?.type === "theme_created" && (
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
                Theme created & applied!
              </span>
            </div>
            <p className="text-xs text-text-muted mt-1 font-mono">
              {message.themeEvent.themeId}
            </p>
            {message.themeEvent.warnings && message.themeEvent.warnings.length > 0 && (
              <div className="mt-2 space-y-0.5">
                {message.themeEvent.warnings.map((w, i) => (
                  <p key={i} className="text-[10px] text-status-warn font-mono">
                    ⚠ {w}
                  </p>
                ))}
              </div>
            )}
          </motion.div>
        )}

        {message.themeEvent?.type === "theme_updated" && (
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
                Theme updated!
              </span>
            </div>
            <p className="text-xs text-text-muted mt-1 font-mono">
              {message.themeEvent.themeId}
            </p>
            {message.themeEvent.warnings && message.themeEvent.warnings.length > 0 && (
              <div className="mt-2 space-y-0.5">
                {message.themeEvent.warnings.map((w, i) => (
                  <p key={i} className="text-[10px] text-status-warn font-mono">
                    ⚠ {w}
                  </p>
                ))}
              </div>
            )}
          </motion.div>
        )}

        {message.themeEvent?.type === "error" && (
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
              {message.themeEvent.error}
            </p>
          </motion.div>
        )}
      </div>
    </div>
  );
}

// ─── Simple Markdown-ish Formatter ──────────────────────────────

function FormattedContent({ content }: { content: string }) {
  const cleaned = content.replace(/<FWUBBO_THEME>[\s\S]*?<\/FWUBBO_THEME>/g, "").trim();
  if (!cleaned) return null;

  const parts = cleaned.split(/(```[\s\S]*?```)/g);

  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith("```")) {
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
        return <InlineFormatted key={i} text={part} />;
      })}
    </>
  );
}

function InlineFormatted({ text }: { text: string }) {
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
