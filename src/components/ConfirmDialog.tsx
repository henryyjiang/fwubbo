/**
 * App-level confirmation dialog — replaces window.confirm() which is
 * silently blocked in production Tauri WebView builds.
 *
 * Usage:
 *   import { appConfirm } from "@/components/ConfirmDialog";
 *   if (await appConfirm("Are you sure?")) { ... }
 *
 * Render <ConfirmDialog /> once at the app root.
 */

import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";

interface PendingConfirm {
  message: string;
  resolve: (value: boolean) => void;
}

// Module-level singleton so appConfirm() can be called from anywhere
let pending: PendingConfirm | null = null;
let triggerRender: (() => void) | null = null;

export function appConfirm(message: string): Promise<boolean> {
  return new Promise((resolve) => {
    pending = { message, resolve };
    triggerRender?.();
  });
}

export function ConfirmDialog() {
  const [current, setCurrent] = useState<PendingConfirm | null>(null);

  useEffect(() => {
    triggerRender = () => setCurrent(pending);
    return () => {
      triggerRender = null;
    };
  }, []);

  const answer = (value: boolean) => {
    current?.resolve(value);
    pending = null;
    setCurrent(null);
  };

  return createPortal(
    <AnimatePresence>
      {current && (
        <motion.div
          key="confirm-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-[999] flex items-center justify-center"
          style={{ background: "rgba(0,0,0,0.5)" }}
          onClick={() => answer(false)}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 8 }}
            transition={{ duration: 0.15 }}
            className="rounded-xl px-5 py-4 max-w-sm w-full mx-4"
            style={{
              background: "var(--surface-raised)",
              border: "1px solid var(--border-subtle)",
              boxShadow: "0 16px 48px rgba(0,0,0,0.35)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <p
              className="text-sm leading-relaxed mb-4"
              style={{ color: "var(--text-primary)" }}
            >
              {current.message}
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => answer(false)}
                className="px-3 py-1.5 rounded text-xs font-medium transition-colors"
                style={{
                  background: "var(--surface-overlay)",
                  color: "var(--text-secondary)",
                  border: "1px solid var(--border-subtle)",
                }}
                autoFocus
              >
                Cancel
              </button>
              <button
                onClick={() => answer(true)}
                className="px-3 py-1.5 rounded text-xs font-medium transition-colors"
                style={{
                  background: "var(--status-error)",
                  color: "#fff",
                }}
              >
                Confirm
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}
