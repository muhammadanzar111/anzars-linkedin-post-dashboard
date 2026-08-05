import { memo, useCallback, useEffect, useState } from "react";

export type ColorTheme = "midnight" | "slate" | "indigo" | "light";

export const COLOR_THEMES: {
  id: ColorTheme;
  label: string;
  dark: boolean;
  swatch: string;
}[] = [
  { id: "light", label: "Clean Light", dark: false, swatch: "linear-gradient(135deg,#ffffff,#c7d2fe)" },
  { id: "midnight", label: "Midnight Dark", dark: true, swatch: "linear-gradient(135deg,#020617,#4f46e5)" },
  { id: "slate", label: "Slate", dark: true, swatch: "linear-gradient(135deg,#1e293b,#64748b)" },
  { id: "indigo", label: "Indigo Purple", dark: true, swatch: "linear-gradient(135deg,#1e1b4b,#a855f7)" },
];

const STORAGE_KEY = "studio-color-theme";
const DEFAULT_THEME: ColorTheme = "light";

function applyTheme(theme: ColorTheme) {
  if (typeof document === "undefined") return;
  const preset = COLOR_THEMES.find((t) => t.id === theme) ?? COLOR_THEMES[0];
  const root = document.documentElement;
  root.setAttribute("data-theme", preset.id);
  root.classList.toggle("dark", preset.dark);
}

/**
 * Single source of truth for the app colour theme. The value is written to
 * <html data-theme="..."> (plus the `dark` class) so every semantic token
 * switches instantly, with no reload.
 */
export function useColorTheme() {
  const [theme, setTheme] = useState<ColorTheme>(DEFAULT_THEME);

  // Read the persisted choice after hydration to avoid SSR mismatches.
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY) as ColorTheme | null;
    const next = COLOR_THEMES.some((t) => t.id === saved) ? (saved as ColorTheme) : DEFAULT_THEME;
    setTheme(next);
  }, []);

  useEffect(() => {
    applyTheme(theme);
    localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  const change = useCallback((next: ColorTheme) => {
    // Apply synchronously so the click feels instant, then commit to state.
    applyTheme(next);
    setTheme(next);
  }, []);

  return [theme, change] as const;
}

export const ThemePicker = memo(function ThemePicker({
  theme,
  onChange,
}: {
  theme: ColorTheme;
  onChange: (t: ColorTheme) => void;
}) {
  return (
    <div className="flex items-center gap-1.5 rounded-full border border-border bg-card/80 p-1">
      {COLOR_THEMES.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => onChange(t.id)}
          title={t.label}
          aria-label={`Theme: ${t.label}`}
          aria-pressed={theme === t.id}
          className={`h-6 w-6 rounded-full border transition-transform ${
            theme === t.id
              ? "scale-110 border-transparent ring-2 ring-primary ring-offset-1 ring-offset-background"
              : "border-border/60 hover:scale-105"
          }`}
          style={{ background: t.swatch }}
        />
      ))}
    </div>
  );
});

/**
 * Static, GPU-cheap backdrop: a couple of themed radial gradients painted once.
 * No blur filters, no keyframes — the colours come from the active theme.
 */
export const ThemeBackdrop = memo(function ThemeBackdrop() {
  return <div aria-hidden className="theme-backdrop pointer-events-none fixed inset-0 -z-10" />;
});
