/**
 * 打字机模式：让光标所在的行/节点始终保持在编辑区垂直中央。
 *
 * 修复：
 *  1. 用 view.coordsAtPos 获取光标所在视觉行的坐标，而非 nodeDOM 整段外接矩形
 *     （多行段落时整段居中会偏离光标行）
 *  2. 用 rAF 合并连续滚动，避免 smooth 滚动互相打断
 *  3. cleanup 时清理 scrollTimer，避免卸载后仍触发
 *  4. 监听 resize，窗口缩放后重新居中
 */
import type { EditorView } from "@milkdown/prose/view";

function findScrollEl(view: EditorView): HTMLElement {
  let el: HTMLElement | null = view.dom as HTMLElement;
  while (el && el !== document.body) {
    const sh = el.scrollHeight;
    const ch = el.clientHeight;
    if (sh > ch + 20) return el;
    el = el.parentElement;
  }
  return view.dom as HTMLElement;
}

export function attachTypewriter(view: EditorView, enable: () => boolean) {
  if (!view) return () => {};
  let scrollEl = findScrollEl(view);
  let isUserScrolling = false;
  let scrollTimer: number | null = null;
  let rafScheduled = false;
  let rafId: number | null = null;

  const markUserScroll = () => {
    isUserScrolling = true;
    if (scrollTimer) window.clearTimeout(scrollTimer);
    scrollTimer = window.setTimeout(() => {
      isUserScrolling = false;
    }, 150);
  };

  const attachScrollListeners = (el: HTMLElement) => {
    el.addEventListener("wheel", markUserScroll, { passive: true });
    el.addEventListener("touchmove", markUserScroll, { passive: true });
  };
  const detachScrollListeners = (el: HTMLElement) => {
    el.removeEventListener("wheel", markUserScroll);
    el.removeEventListener("touchmove", markUserScroll);
  };

  attachScrollListeners(scrollEl);

  const onSelChange = () => {
    if (!enable()) return;
    if (isUserScrolling) return;
    const { from } = view.state.selection;
    // 用 coordsAtPos 获取光标所在视觉行的坐标，避免整段居中
    let coords: { top: number; bottom: number };
    try {
      coords = view.coordsAtPos(from);
    } catch {
      return;
    }
    const sRect = scrollEl.getBoundingClientRect();
    const cursorMid = (coords.top + coords.bottom) / 2;
    const delta = cursorMid - sRect.top - sRect.height / 2;
    if (Math.abs(delta) < 4) return;
    scrollEl.scrollTo({
      top: scrollEl.scrollTop + delta,
      behavior: "smooth",
    });
  };

  // 用 rAF 合并连续触发，避免多个 smooth 滚动互相打断
  const scheduleCenter = () => {
    if (rafScheduled) return;
    rafScheduled = true;
    rafId = requestAnimationFrame(() => {
      rafScheduled = false;
      rafId = null;
      onSelChange();
    });
  };

  const onKeyUp = () => scheduleCenter();
  const onClick = () => scheduleCenter();
  const onResize = () => {
    // 重新查找滚动容器（布局可能变化）；容器变更时先解绑旧容器再绑定新容器，避免监听泄漏
    const next = findScrollEl(view);
    if (next !== scrollEl) {
      detachScrollListeners(scrollEl);
      scrollEl = next;
      attachScrollListeners(scrollEl);
    }
    scheduleCenter();
  };
  const dom = view.dom as HTMLElement;
  dom.addEventListener("keyup", onKeyUp);
  dom.addEventListener("click", onClick);
  window.addEventListener("resize", onResize);

  return () => {
    if (scrollTimer) window.clearTimeout(scrollTimer);
    if (rafId != null) cancelAnimationFrame(rafId);
    detachScrollListeners(scrollEl);
    dom.removeEventListener("keyup", onKeyUp);
    dom.removeEventListener("click", onClick);
    window.removeEventListener("resize", onResize);
  };
}
