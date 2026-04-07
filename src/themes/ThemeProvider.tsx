import React, { createContext, useContext, useEffect, useMemo } from "react";
import type { ThemeDefinition, ThemeContext } from "@/types";
import { getThemeWithCustom, DEFAULT_THEME } from "./definitions";
import { ThemeBackgroundRenderer } from "./backgrounds";
import { useDashboardStore } from "@/stores/dashboard";

const ThemeCtx = createContext<ThemeContext>({
  id: DEFAULT_THEME,
  variables: {},
  getVar: () => "",
  widgetClass: "",
});

export function useTheme() {
  return useContext(ThemeCtx);
}

export function ThemeProvider({
  themeId,
  children,
}: {
  themeId: string;
  children: React.ReactNode;
}) {
  const customThemes = useDashboardStore((s) => s.customThemes);
  const theme = getThemeWithCustom(themeId, customThemes);

  // Inject CSS variables onto :root
  useEffect(() => {
    const root = document.documentElement;
    for (const [key, value] of Object.entries(theme.variables)) {
      root.style.setProperty(key, value);
    }
    // Widget style vars
    root.style.setProperty("--widget-blur", theme.widget_style.blur);
    root.style.setProperty("--widget-radius", theme.widget_style.radius);
    root.style.setProperty("--widget-shadow", theme.widget_style.shadow);
    root.style.setProperty("--widget-shadow-hover", theme.widget_style.shadow_hover);
    root.style.setProperty("--widget-opacity", String(theme.widget_style.opacity));
    root.style.setProperty("--widget-border", theme.widget_style.border);

    return () => {
      for (const key of Object.keys(theme.variables)) {
        root.style.removeProperty(key);
      }
    };
  }, [theme]);

  // Load fonts
  useEffect(() => {
    const links: HTMLLinkElement[] = [];
    for (const url of theme.fonts) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = url;
      document.head.appendChild(link);
      links.push(link);
    }
    return () => links.forEach((l) => l.remove());
  }, [theme.fonts]);

  const ctx = useMemo<ThemeContext>(
    () => ({
      id: theme.id,
      variables: theme.variables,
      getVar: (name: string) => theme.variables[`--${name}`] ?? "",
      widgetClass: "widget-card",
    }),
    [theme]
  );

  return (
    <ThemeCtx.Provider value={ctx}>
      <ThemeBackgroundRenderer background={theme.background} />
      {children}
    </ThemeCtx.Provider>
  );
}
