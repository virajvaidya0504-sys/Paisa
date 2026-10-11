import { useEffect, useRef, useState } from "react";
import { api } from "./api";

/**
 * Fetch `path` with `params` and refetch whenever they change.
 * Keeps the previous data on screen while reloading. `reload()` forces a refetch.
 */
export function useApi(path, params, enabled = true) {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  const [tick, setTick] = useState(0);
  const key = JSON.stringify([path, params]);

  useEffect(() => {
    if (!enabled) return;
    let live = true; // ignore answers that arrive after the params changed
    setState((s) => ({ ...s, loading: true }));
    api.get(path, params)
      .then((data) => live && setState({ data, error: null, loading: false }))
      .catch((e) => live && setState({ data: null, error: e.message, loading: false }));
    return () => { live = false; };
  }, [key, tick, enabled]); // eslint-disable-line react-hooks/exhaustive-deps

  return { ...state, reload: () => setTick((t) => t + 1) };
}

export const useTags = () => useApi("/tags");

/** True when the OS asks for less motion; charts check this before animating. */
export const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Animate a number up to `target`. Jumps straight there if the user prefers reduced motion. */
export function useCountUp(target, ms = 800) {
  const [value, setValue] = useState(target ?? 0);
  const from = useRef(target ?? 0);
  useEffect(() => {
    if (target == null) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { setValue(target); from.current = target; return; }
    const start = performance.now(), a = from.current;
    let raf;
    const tick = (t) => {
      const p = Math.min(1, (t - start) / ms);
      const cur = a + (target - a) * (1 - Math.pow(1 - p, 3)); // ease-out
      setValue(cur); from.current = cur;
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return value;
}
