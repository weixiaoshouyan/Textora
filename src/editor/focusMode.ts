/**
 * 专注模式：淡化非光标所在段落，突出当前编辑内容。
 *
 * 实现：监听 selection 变化，找到光标所在顶层块级节点对应的 DOM，
 * 给它加 `textora-focused` 类，其余顶层块加 `textora-dimmed` 类。
 * 专注模式关闭时移除所有标记类。
 *
 * 与 Typora 的专注模式行为一致：仅影响 WYSIWYG Markdown 编辑器。
 */
import type { EditorView } from "@milkdown/prose/view";

export function attachFocusMode(view: EditorView, enable: () => boolean) {
  if (!view) return () => {};

  const dom = view.dom as HTMLElement;

  /** 清除所有专注模式标记类 */
  function clearMarks() {
    dom.querySelectorAll(".textora-focused, .textora-dimmed").forEach((el) => {
      el.classList.remove("textora-focused", "textora-dimmed");
    });
  }

  /** 根据当前 selection 标记焦点段落 */
  function markFocus() {
    clearMarks();
    if (!enable()) return;

    const { from } = view.state.selection;
    // 找到光标所在的顶层块节点位置
    let pos = from;
    let depth: number;
    try {
      depth = view.state.doc.resolve(pos).depth;
    } catch {
      return;
    }
    // 向上回溯到 depth=1（即 doc 的直接子节点）
    while (depth > 1) {
      pos = view.state.doc.resolve(pos).before(depth);
      depth = view.state.doc.resolve(pos).depth;
    }
    // 获取顶层块的位置
    const topFrom = depth === 1 ? view.state.doc.resolve(pos).before(1) : 0;
    const correctedFrom = topFrom < 0 ? 0 : topFrom;

    // 遍历 dom 的直接子节点，标记焦点和非焦点
    const children = dom.children;
    // 通过 ProseMirror 的 posAtDom 找到 dom 子节点对应的 doc 位置
    let focusedDom: HTMLElement | null = null;
    try {
      // 用 nodeDOM 从 pos 获取对应 DOM
      const nodePos = correctedFrom;
      let nodeDom = view.nodeDOM(nodePos) as HTMLElement | null;
      if (nodeDom && nodeDom !== view.dom) {
        // 光标位于嵌套节点（如列表项内的段落）时，nodeDOM 返回的可能是嵌套节点，
        // 需要向上回溯到 dom 的直接子节点，否则无法匹配 children 导致整篇变暗
        while (nodeDom.parentElement && nodeDom.parentElement !== dom) {
          nodeDom = nodeDom.parentElement;
        }
        if (nodeDom !== view.dom) {
          focusedDom = nodeDom;
        }
      }
    } catch {
      /* ignore */
    }

    for (let i = 0; i < children.length; i++) {
      const child = children[i] as HTMLElement;
      if (child === focusedDom) {
        child.classList.add("textora-focused");
      } else {
        child.classList.add("textora-dimmed");
      }
    }
  }

  const onSelChange = () => {
    if (!enable()) {
      clearMarks();
      return;
    }
    markFocus();
  };

  // 延迟一帧执行，确保 DOM 已更新
  let rafId: number | null = null;
  const scheduleMark = () => {
    if (rafId != null) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(onSelChange);
  };

  dom.addEventListener("keyup", scheduleMark);
  dom.addEventListener("click", scheduleMark);

  // 初始标记
  scheduleMark();

  return () => {
    if (rafId != null) cancelAnimationFrame(rafId);
    dom.removeEventListener("keyup", scheduleMark);
    dom.removeEventListener("click", scheduleMark);
    clearMarks();
  };
}
