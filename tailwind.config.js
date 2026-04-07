/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        display: ["var(--font-display)", "sans-serif"],
        body: ["var(--font-body)", "sans-serif"],
        mono: ["var(--font-mono)", "monospace"],
      },
      colors: {
        surface: {
          base: "var(--surface-base)",
          raised: "var(--surface-raised)",
          overlay: "var(--surface-overlay)",
        },
        accent: {
          primary: "var(--accent-primary)",
          secondary: "var(--accent-secondary)",
          glow: "var(--accent-glow)",
        },
        text: {
          primary: "var(--text-primary)",
          secondary: "var(--text-secondary)",
          muted: "var(--text-muted)",
        },
        border: {
          subtle: "var(--border-subtle)",
          strong: "var(--border-strong)",
        },
        status: {
          ok: "var(--status-ok)",
          warn: "var(--status-warn)",
          error: "var(--status-error)",
        },
      },
      borderRadius: {
        widget: "var(--widget-radius)",
      },
      boxShadow: {
        widget: "var(--widget-shadow)",
        "widget-hover": "var(--widget-shadow-hover)",
      },
      backdropBlur: {
        widget: "var(--widget-blur)",
      },
    },
  },
  plugins: [],
};
