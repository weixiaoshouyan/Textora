import { useEffect, RefObject } from "react";

/**
 * Hook that fires a callback when a click occurs outside the referenced element.
 *
 * @param ref      - Ref of the element to watch.
 * @param active   - Whether the listener is active (e.g. dropdown open).
 * @param onOutside - Callback invoked on outside click.
 */
export function useClickOutside<T extends HTMLElement>(
  ref: RefObject<T | null>,
  active: boolean,
  onOutside: () => void
): void {
  useEffect(() => {
    if (!active) return;
    const handler = (e: MouseEvent) => {
      const el = ref.current;
      if (el && !el.contains(e.target as Node)) {
        onOutside();
      }
    };
    // Use capture + rAF so the listener is registered before the click
    // that opened the dropdown can propagate.
    const raf = requestAnimationFrame(() => {
      document.addEventListener("mousedown", handler, { capture: true });
    });
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("mousedown", handler, { capture: true });
    };
  }, [ref, active, onOutside]);
}
