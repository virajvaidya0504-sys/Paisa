import { createContext, useCallback, useContext, useMemo, useState } from "react";

const Ctx = createContext(null);
const KEY = "paisa-theme";

function apply(theme) {
  document.documentElement.dataset.theme = theme; // set before children render so charts read the right colours
  try { localStorage.setItem(KEY, theme); } catch { /* private mode: just don't remember */ }
}

function initial() {
  let t = window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark"; // first visit follows the OS
  try { const s = localStorage.getItem(KEY); if (s === "light" || s === "dark") t = s; } catch { /* ignore */ }
  document.documentElement.dataset.theme = t;
  return t;
}

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(initial);
  const toggle = useCallback(() => setTheme((t) => { const n = t === "dark" ? "light" : "dark"; apply(n); return n; }), []);
  return <Ctx.Provider value={{ theme, toggle }}>{children}</Ctx.Provider>;
}

export const useTheme = () => useContext(Ctx);

/** Resolved colour values for SVG charts (Recharts needs real colours, not CSS variables). */
export function useChartColors() {
  const { theme } = useTheme();
  return useMemo(() => {
    const s = getComputedStyle(document.documentElement);
    const g = (n) => s.getPropertyValue(n).trim();
    return { spent: g("--spent"), received: g("--received"), accent: g("--accent"), gold: g("--gold"),
      grid: g("--grid"), axis: g("--faint"), heat: [g("--heat0"), g("--heat1"), g("--heat2"), g("--heat3"), g("--heat4")] };
  }, [theme]); // eslint-disable-line react-hooks/exhaustive-deps
}
