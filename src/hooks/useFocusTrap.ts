import { useEffect, type RefObject } from "react";

/**
 * 模态焦点陷阱：当容器可见时，Tab/Shift+Tab 在容器内的可聚焦元素间循环，
 * 防止焦点跑到背景内容。容器挂载时自动聚焦第一个可聚焦元素。
 */
export function useFocusTrap(
  containerRef: RefObject<HTMLElement | null>,
  active: boolean
) {
  useEffect(() => {
    if (!active) return;
    const el = containerRef.current;
    if (!el) return;

    // 聚焦第一个可聚焦元素
    const focusables = getFocusables(el);
    if (focusables.length > 0) {
      focusables[0].focus();
    } else {
      el.tabIndex = -1;
      el.focus();
    }

    const handler = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const list = getFocusables(el);
      if (list.length === 0) {
        e.preventDefault();
        return;
      }
      const first = list[0];
      const last = list[list.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first || !el.contains(document.activeElement)) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last || !el.contains(document.activeElement)) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    el.addEventListener("keydown", handler);
    return () => {
      el.removeEventListener("keydown", handler);
    };
  }, [active, containerRef]);
}

function getFocusables(root: HTMLElement): HTMLElement[] {
  const sel = 'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';
  return Array.from(root.querySelectorAll<HTMLElement>(sel)).filter(
    (el) => el.offsetParent !== null || el === document.activeElement
  );
}
