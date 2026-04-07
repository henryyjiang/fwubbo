import type { ThemeDefinition } from "@/types";

export const THEMES: Record<string, ThemeDefinition> = {
  // ─── Deep Ocean ──────────────────────────────────────────────
  "deep-ocean": {
    id: "deep-ocean",
    name: "Frutiger Aero",
    description: "Bright aquatic gloss with interactive draggable bubbles",
    fonts: [
      "https://fonts.googleapis.com/css2?family=Nunito:wght@300;400;500;600;700&family=Space+Mono:wght@400;700&display=swap",
    ],
    variables: {
      "--font-display": "Nunito",
      "--font-body": "Nunito",
      "--font-mono": "Space Mono",
      "--surface-base": "rgba(255, 255, 255, 0.18)",
      "--surface-raised": "rgba(255, 255, 255, 0.28)",
      "--surface-overlay": "rgba(255, 255, 255, 0.38)",
      "--accent-primary": "#00c8f0",
      "--accent-secondary": "#0077cc",
      "--accent-glow": "rgba(0, 200, 240, 0.45)",
      "--text-primary": "#ffffff",
      "--text-secondary": "#c8eeff",
      "--text-muted": "#85c8e8",
      "--border-subtle": "rgba(255, 255, 255, 0.25)",
      "--border-strong": "rgba(255, 255, 255, 0.6)",
      "--status-ok": "#00e676",
      "--status-warn": "#ffab40",
      "--status-error": "#ff5252",
    },
    background: {
      type: "canvas",
      setup: "frutiger-aero",
    },
    widget_style: {
      blur: "14px",
      opacity: 0.88,
      border: "1px solid rgba(255, 255, 255, 0.35)",
      shadow: "0 4px 28px rgba(0, 80, 160, 0.22), inset 0 1px 0 rgba(255, 255, 255, 0.4)",
      shadow_hover: "0 8px 44px rgba(0, 150, 220, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.5)",
      radius: "18px",
    },
  },

  // ─── Matrix Terminal ───────────────────────────────────────────────────────
  "matrix-terminal": {
    id: "matrix-terminal",
    name: "Matrix Terminal",
    description: "Cascading green code rain with CRT-inspired terminal aesthetic",
    fonts: [
      "https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;500;700&family=Inconsolata:wght@400;700&display=swap",
    ],
    variables: {
      "--font-display": "JetBrains Mono",
      "--font-body": "JetBrains Mono",
      "--font-mono": "JetBrains Mono",
      "--surface-base": "#0a0a0a",
      "--surface-raised": "rgba(18, 18, 18, 0.95)",
      "--surface-overlay": "rgba(28, 28, 28, 0.95)",
      "--accent-primary": "#39ff14",
      "--accent-secondary": "#ff6600",
      "--accent-glow": "rgba(57, 255, 20, 0.2)",
      "--text-primary": "#39ff14",
      "--text-secondary": "#88cc44",
      "--text-muted": "#557733",
      "--border-subtle": "rgba(57, 255, 20, 0.15)",
      "--border-strong": "#39ff14",
      "--status-ok": "#39ff14",
      "--status-warn": "#ff6600",
      "--status-error": "#ff0033",
    },
    background: {
      type: "canvas",
      setup: "matrix-terminal", // references a built-in canvas renderer
    },
    widget_style: {
      blur: "0px",
      opacity: 1,
      border: "1px solid var(--accent-primary)",
      shadow: "0 0 8px rgba(57, 255, 20, 0.15), inset 0 0 60px rgba(57, 255, 20, 0.02)",
      shadow_hover: "0 0 20px rgba(57, 255, 20, 0.3)",
      radius: "0px",
    },
  },

  // ─── Paper & Ink ─────────────────────────────────────────────
  "paper-ink": {
    id: "paper-ink",
    name: "Paper & Ink",
    description: "Warm editorial with textured paper feel",
    fonts: [
      "https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600;700;900&family=Source+Serif+4:wght@300;400;500;600&family=Fira+Code:wght@400;500&display=swap",
    ],
    variables: {
      "--font-display": "Playfair Display",
      "--font-body": "Source Serif 4",
      "--font-mono": "Fira Code",
      "--surface-base": "#f4f0e8",
      "--surface-raised": "rgba(255, 252, 245, 0.9)",
      "--surface-overlay": "rgba(240, 235, 225, 0.95)",
      "--accent-primary": "#c0392b",
      "--accent-secondary": "#2c3e50",
      "--accent-glow": "rgba(192, 57, 43, 0.15)",
      "--text-primary": "#1a1a1a",
      "--text-secondary": "#4a4a4a",
      "--text-muted": "#8a8a7a",
      "--border-subtle": "rgba(0, 0, 0, 0.08)",
      "--border-strong": "rgba(0, 0, 0, 0.2)",
      "--status-ok": "#27ae60",
      "--status-warn": "#f39c12",
      "--status-error": "#c0392b",
    },
    background: { type: "solid", color: "#f4f0e8" },
    widget_style: {
      blur: "0px",
      opacity: 1,
      border: "1px solid var(--border-subtle)",
      shadow: "2px 3px 12px rgba(0, 0, 0, 0.06)",
      shadow_hover: "2px 4px 20px rgba(0, 0, 0, 0.1)",
      radius: "4px",
    },
  },

  // ─── Windows XP ──────────────────────────────────────────────
  "windows-xp": {
    id: "windows-xp",
    name: "Windows XP",
    description: "Classic Luna theme with iconic Bliss wallpaper",
    fonts: [],
    variables: {
      "--font-display": "Tahoma, Trebuchet MS, sans-serif",
      "--font-body": "Tahoma, Trebuchet MS, sans-serif",
      "--font-mono": "Lucida Console, Courier New, monospace",
      "--surface-base": "#ECE9D8",
      "--surface-raised": "#FFFFFF",
      "--surface-overlay": "#F5F4EA",
      "--accent-primary": "#0A246A",
      "--accent-secondary": "#316AC5",
      "--accent-glow": "rgba(10, 36, 106, 0.2)",
      "--text-primary": "#000000",
      "--text-secondary": "#222222",
      "--text-muted": "#666666",
      "--border-subtle": "rgba(0, 0, 0, 0.12)",
      "--border-strong": "#0A3796",
      "--status-ok": "#008000",
      "--status-warn": "#CC6600",
      "--status-error": "#CC0000",
      "--widget-header-bg": "linear-gradient(to right, #0A246A 0%, #0C52BA 25%, #3A8EE6 65%, #84B8E8 90%, #6AAEE0 100%)",
      "--widget-title-color": "#FFFFFF",
      "--widget-header-icon": "rgba(255,255,255,0.9)",
    },
    background: {
      type: "canvas",
      setup: "xp-bliss",
    },
    widget_style: {
      blur: "0px",
      opacity: 1,
      border: "2px solid #0A3796",
      shadow: "2px 2px 8px rgba(0,0,0,0.35)",
      shadow_hover: "3px 4px 14px rgba(0,0,0,0.45)",
      radius: "8px",
    },
  },

  // ─── J.A.R.V.I.S. HUD ───────────────────────────────────────────────────────
  "jarvis-hud": {
    id: "jarvis-hud",
    name: "J.A.R.V.I.S.",
    description: "Futuristic AI interface with holographic sphere and HUD overlays",
    fonts: [
      "https://fonts.googleapis.com/css2?family=Orbitron:wght@400;500;700;900&family=Exo+2:wght@300;400;500;600&family=Share+Tech+Mono&display=swap",
    ],
    variables: {
      "--font-display": "Orbitron",
      "--font-body": "Exo 2",
      "--font-mono": "Share Tech Mono",
      "--surface-base": "rgba(1, 8, 20, 0.93)",
      "--surface-raised": "rgba(3, 14, 32, 0.90)",
      "--surface-overlay": "rgba(5, 20, 46, 0.93)",
      "--accent-primary": "#00e5ff",
      "--accent-secondary": "#0055ff",
      "--accent-glow": "rgba(0, 229, 255, 0.45)",
      "--text-primary": "#d0f4ff",
      "--text-secondary": "#00b8d4",
      "--text-muted": "#006880",
      "--border-subtle": "rgba(0, 229, 255, 0.18)",
      "--border-strong": "rgba(0, 229, 255, 0.55)",
      "--status-ok": "#00e676",
      "--status-warn": "#ffab40",
      "--status-error": "#ff4444",
    },
    background: {
      type: "canvas",
      setup: "jarvis-hud",
    },
    widget_style: {
      blur: "10px",
      opacity: 1,
      border: "1px solid rgba(0, 229, 255, 0.28)",
      shadow: "0 0 22px rgba(0, 229, 255, 0.08), inset 0 0 60px rgba(0, 229, 255, 0.03), 0 2px 14px rgba(0, 0, 0, 0.65)",
      shadow_hover: "0 0 34px rgba(0, 229, 255, 0.22), inset 0 0 60px rgba(0, 229, 255, 0.06), 0 4px 22px rgba(0, 0, 0, 0.75)",
      radius: "4px",
    },
  },
};

export const DEFAULT_THEME = "paper-ink";

export function getTheme(id: string): ThemeDefinition {
  return THEMES[id] ?? THEMES[DEFAULT_THEME];
}

/**
 * Merge built-in themes with custom themes from the store.
 * Custom themes override built-in ones if IDs collide (unlikely).
 */
export function getAllThemes(customThemes: Record<string, ThemeDefinition>): Record<string, ThemeDefinition> {
  return { ...THEMES, ...customThemes };
}

/**
 * Get a theme by ID, checking custom themes first then built-in.
 */
export function getThemeWithCustom(id: string, customThemes: Record<string, ThemeDefinition>): ThemeDefinition {
  return customThemes[id] ?? THEMES[id] ?? THEMES[DEFAULT_THEME];
}
