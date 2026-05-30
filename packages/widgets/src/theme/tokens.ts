export const typography = {
  fontFamily:
    '"Noto Sans KR", "Apple SD Gothic Neo", "Malgun Gothic", "Segoe UI", sans-serif',
  sizes: {
    caption: "0.75rem",
    small: "0.875rem",
    body: "1rem",
    title: "1.125rem",
    heading: "1.375rem"
  },
  weights: {
    regular: "400",
    medium: "500",
    semibold: "600",
    bold: "700"
  }
} as const;

export const spacing = {
  0: "0",
  1: "4px",
  2: "8px",
  3: "12px",
  4: "16px",
  5: "20px",
  6: "24px",
  8: "32px",
  10: "40px",
  12: "48px"
} as const;

export const radii = {
  sm: "8px",
  md: "12px",
  lg: "18px",
  pill: "999px"
} as const;

export const shadows = {
  sm: "0 1px 2px rgba(15, 23, 42, 0.08)",
  md: "0 10px 30px rgba(15, 23, 42, 0.12)",
  glow: "0 0 0 1px rgba(61, 108, 255, 0.18), 0 16px 40px rgba(61, 108, 255, 0.16)"
} as const;

export const lightTheme = {
  primary: "#2F5BFF",
  primaryText: "#FFFFFF",
  secondary: "#14B8A6",
  secondaryText: "#052E2B",
  surface: "#FFFFFF",
  surfaceMuted: "#F6F8FC",
  surfaceRaised: "#FBFCFF",
  text: "#172033",
  textMuted: "#667085",
  border: "#D9E0EC",
  error: "#D92D20",
  errorSurface: "#FFF1F0",
  success: "#079455",
  successSurface: "#ECFDF3",
  synthetic: "#6D3CEB",
  syntheticSurface: "#F2EDFF",
  focus: "#84A2FF"
} as const;

export const darkTheme = {
  primary: "#84A2FF",
  primaryText: "#071022",
  secondary: "#45E3D0",
  secondaryText: "#031F1D",
  surface: "#111827",
  surfaceMuted: "#182235",
  surfaceRaised: "#1D293D",
  text: "#F8FAFC",
  textMuted: "#AAB4C5",
  border: "#344054",
  error: "#FDA29B",
  errorSurface: "#3B1411",
  success: "#6CE9A6",
  successSurface: "#103B25",
  synthetic: "#B9A3FF",
  syntheticSurface: "#271A4D",
  focus: "#AFC0FF"
} as const;

export const cssVariables = {
  "--ssw-font-family": typography.fontFamily,
  "--ssw-font-caption": typography.sizes.caption,
  "--ssw-font-small": typography.sizes.small,
  "--ssw-font-body": typography.sizes.body,
  "--ssw-font-title": typography.sizes.title,
  "--ssw-font-heading": typography.sizes.heading,
  "--ssw-weight-regular": typography.weights.regular,
  "--ssw-weight-medium": typography.weights.medium,
  "--ssw-weight-semibold": typography.weights.semibold,
  "--ssw-weight-bold": typography.weights.bold,
  "--ssw-space-0": spacing[0],
  "--ssw-space-1": spacing[1],
  "--ssw-space-2": spacing[2],
  "--ssw-space-3": spacing[3],
  "--ssw-space-4": spacing[4],
  "--ssw-space-5": spacing[5],
  "--ssw-space-6": spacing[6],
  "--ssw-space-8": spacing[8],
  "--ssw-space-10": spacing[10],
  "--ssw-space-12": spacing[12],
  "--ssw-radius-sm": radii.sm,
  "--ssw-radius-md": radii.md,
  "--ssw-radius-lg": radii.lg,
  "--ssw-radius-pill": radii.pill,
  "--ssw-shadow-sm": shadows.sm,
  "--ssw-shadow-md": shadows.md,
  "--ssw-shadow-glow": shadows.glow
} as const;

export const themeVariables = {
  light: lightTheme,
  dark: darkTheme
} as const;

export type WidgetThemeMode = keyof typeof themeVariables;
