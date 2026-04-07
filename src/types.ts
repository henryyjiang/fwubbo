// ─── Module Contract ───────────────────────────────────────────────

export interface SettingField {
  key: string;
  type: "text" | "number" | "select" | "toggle" | "password";
  label: string;
  default?: string | number | boolean;
  description?: string;
  options?: string[];
}

export interface ModuleManifest {
  id: string;
  name: string;
  description?: string;
  icon?: string; // lucide icon name
  refresh_interval: number; // seconds
  requires: string[]; // secret key names
  permissions: {
    network: string[]; // allowed domains
    python_imports?: string[]; // allowed non-stdlib imports
  };
  settings?: SettingField[];
  api_stats: {
    calls_per_refresh: number;
    llm_tokens_per_refresh: number;
  };
  notifications: {
    supported: boolean;
    default_enabled: boolean;
  };
  widget: {
    min_w: number; // grid units
    min_h: number;
    default_w: number;
    default_h: number;
    resizable: boolean;
  };
  // Theme interaction hints — tells the theme engine what the widget supports
  theme_hints?: {
    supports_transparency?: boolean; // widget can render over animated backgrounds
    accent_regions?: string[]; // CSS selector hints for accent-colorable areas
    animation_density?: "none" | "subtle" | "full"; // how much motion the widget tolerates
  };
}

export interface ModuleNotification {
  id: string; // dedup key
  title: string;
  body: string;
  priority: "low" | "medium" | "high";
  timestamp: string;
}

export interface ModuleFetchResult {
  status: "ok" | "error" | "cached";
  data: Record<string, unknown>;
  notifications: ModuleNotification[];
  cached_at?: string; // ISO timestamp if serving cached data
  fetch_ms?: number; // execution time
}

// ─── Widget Props ──────────────────────────────────────────────────

export type WidgetStatus = "online" | "offline-cached" | "offline-no-cache" | "loading" | "error";

export interface WidgetProps {
  moduleId: string;
  data: Record<string, unknown> | null;
  loading: boolean;
  error: string | null;
  lastUpdated: string | null;
  status: WidgetStatus;
  theme: ThemeContext;
  onRequestRefresh: () => void;
}

export interface WidgetInfoStats {
  api_calls_hour: number;
  api_calls_day: number;
  api_calls_month: number;
  llm_tokens_hour: number;
  llm_tokens_day: number;
  llm_tokens_month: number;
  last_fetch: string | null;
  last_fetch_ms: number | null;
  declared_domains: string[];
  secret_names: string[];
}

// ─── Theme System ──────────────────────────────────────────────────

export interface ThemeDefinition {
  id: string;
  name: string;
  description: string;
  author?: string;

  // Core CSS variables
  variables: Record<string, string>;

  // Font imports (Google Fonts URLs)
  fonts: string[];

  // Background layer — this is where the magic happens
  background: ThemeBackground;

  // Grid layout behavior — controls how widgets compact/snap
  // Omit (or set compact: null) for free placement (widgets stay where dropped)
  grid_behavior?: {
    compact: "vertical" | "horizontal" | null;
  };

  // Widget glass/card styling
  widget_style: {
    blur: string;
    opacity: number;
    border: string;
    shadow: string;
    shadow_hover: string;
    radius: string;
  };
}

export type ThemeBackground =
  | { type: "solid"; color: string }
  | { type: "gradient"; css: string }
  | { type: "animated"; component: string } // React component name for animated backgrounds
  | { type: "canvas"; setup: string } // Canvas/WebGL shader code for 3D backgrounds
  | { type: "particle"; config: ParticleConfig }; // Particle system config

export interface ParticleConfig {
  count: number;
  shape: "circle" | "square" | "triangle" | "custom";
  custom_svg?: string;
  size_range: [number, number];
  speed_range: [number, number];
  opacity_range: [number, number];
  colors: string[]; // use CSS var references
  behavior: "float" | "orbit" | "swarm" | "rain" | "snow" | "firefly";
  mouse_interact?: boolean;
  blur?: boolean;
  connect_lines?: boolean;
  connect_distance?: number;
}

export interface ThemeContext {
  id: string;
  variables: Record<string, string>;
  getVar: (name: string) => string;
  widgetClass: string; // pre-computed class string for widget cards
}

// ─── Layout ────────────────────────────────────────────────────────

export interface WidgetLayout {
  i: string; // module id
  x: number;
  y: number;
  w: number;
  h: number;
  minW?: number;
  minH?: number;
}

export interface DashboardState {
  layouts: WidgetLayout[];
  enabled_modules: string[];
  notification_settings: Record<
    string,
    {
      enabled: boolean;
      when_open: boolean;
      when_minimized: boolean;
      min_priority: "low" | "medium" | "high";
    }
  >;
}

// ─── Profile ───────────────────────────────────────────────────────

export interface UserProfile {
  name: string;
  location?: string;
  timezone?: string;
  interests: string[];
  watchlist: string[];
  keywords: string[];
  custom: Record<string, unknown>;
}
