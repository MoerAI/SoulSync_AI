import { useEffect } from "react";
import { cssVariables, themeVariables, type WidgetThemeMode } from "./tokens";

type GlobalStylesProps = {
  mode?: WidgetThemeMode;
};

const colorVariableNames = {
  primary: "--ssw-color-primary",
  primaryText: "--ssw-color-primary-text",
  secondary: "--ssw-color-secondary",
  secondaryText: "--ssw-color-secondary-text",
  surface: "--ssw-color-surface",
  surfaceMuted: "--ssw-color-surface-muted",
  surfaceRaised: "--ssw-color-surface-raised",
  text: "--ssw-color-text",
  textMuted: "--ssw-color-text-muted",
  border: "--ssw-color-border",
  error: "--ssw-color-error",
  errorSurface: "--ssw-color-error-surface",
  success: "--ssw-color-success",
  successSurface: "--ssw-color-success-surface",
  synthetic: "--ssw-color-synthetic",
  syntheticSurface: "--ssw-color-synthetic-surface",
  focus: "--ssw-color-focus"
} as const;

export function applyWidgetTheme(mode: WidgetThemeMode = "light") {
  if (typeof document === "undefined") {
    return;
  }

  const root = document.documentElement;
  Object.entries(cssVariables).forEach(([name, value]) => {
    root.style.setProperty(name, value);
  });

  Object.entries(themeVariables[mode]).forEach(([name, value]) => {
    root.style.setProperty(colorVariableNames[name as keyof typeof colorVariableNames], value);
  });
}

export function GlobalStyles({ mode = "light" }: GlobalStylesProps) {
  useEffect(() => {
    applyWidgetTheme(mode);
  }, [mode]);

  return null;
}
