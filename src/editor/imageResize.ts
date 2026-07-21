/**
 * 图片缩放：单击编辑器中的图片，在右下角显示拖拽句柄，
 * 用户拖拽可调整图片显示尺寸（修改 img 的 width/height style）。
 *
 * 功能：
 *  - 单击图片显示缩放句柄（右下角小方块，cursor: nwse-resize）
 *  - 拖拽句柄调整图片 width/height（像素值）
 *  - 按住 Shift 等比缩放（保持 aspect-ratio）
 *  - 释放鼠标时尝试写回 ProseMirror 节点（若 schema 支持 width attr）
 *  - 点击图片外部 / Escape / 双击打开 lightbox 时移除句柄
 *
 * 注意：Milkdown 默认 image schema 仅有 src/alt/title，无 width attr。
 * 若 schema 不支持 width，则仅修改 DOM style，下次内容更新时会丢失（可接受）。
 * 与 attachImageLightbox 兼容：单击选中/缩放，双击打开 lightbox。
 */
import type { EditorView } from "@milkdown/prose/view";

let handleEl: HTMLDivElement | null = null;
let activeImg: HTMLImageElement | null = null;
let viewRef: EditorView | null = null;
let resizing = false;
let justResized = false;
let startX = 0;
let startY = 0;
let startWidth = 0;
let startHeight = 0;
let aspect = 1;

function updateHandlePosition() {
  if (!handleEl || !activeImg) return;
  // 图片已不在 DOM 中（被撤销 / 内容替换）：移除句柄
  if (!document.body.contains(activeImg)) {
    removeHandle();
    return;
  }
  const rect = activeImg.getBoundingClientRect();
  // 句柄居中在图片右下角顶点上（12px 句柄向左上偏移 6px）
  handleEl.style.left = `${rect.right - 6}px`;
  handleEl.style.top = `${rect.bottom - 6}px`;
}

function removeHandle() {
  if (handleEl) {
    handleEl.remove();
    handleEl = null;
  }
  activeImg = null;
}

function showHandle(img: HTMLImageElement) {
  removeHandle();
  activeImg = img;
  const handle = document.createElement("div");
  handle.className = "textora-image-resize-handle";
  handle.style.cssText = `
    position: fixed;
    width: 12px; height: 12px;
    background: #3b82f6;
    border: 2px solid #fff;
    border-radius: 2px;
    cursor: nwse-resize;
    z-index: 1000;
    box-shadow: 0 1px 3px rgba(0,0,0,0.4);
    user-select: none;
  `;
  document.body.appendChild(handle);
  handleEl = handle;
  updateHandlePosition();
  handle.addEventListener("mousedown", onHandleMouseDown);
}

function onHandleMouseDown(e: MouseEvent) {
  // 阻止默认行为（图片拖拽 / 文本选区），避免与缩放冲突
  e.preventDefault();
  e.stopPropagation();
  if (!activeImg) return;
  resizing = true;
  startX = e.clientX;
  startY = e.clientY;
  startWidth = activeImg.offsetWidth || activeImg.naturalWidth || 100;
  startHeight = activeImg.offsetHeight || activeImg.naturalHeight || 100;
  aspect = startHeight > 0 ? startWidth / startHeight : 1;
  // 拖拽时高亮图片
  activeImg.style.outline = "2px solid #3b82f6";
  window.addEventListener("mousemove", onMouseMove);
  window.addEventListener("mouseup", onMouseUp);
}

function onMouseMove(e: MouseEvent) {
  if (!resizing || !activeImg) return;
  e.preventDefault();
  const dx = e.clientX - startX;
  const dy = e.clientY - startY;
  const newWidth = Math.max(20, startWidth + dx);
  if (e.shiftKey) {
    // 等比缩放：按 width / aspect 计算 height
    const newHeight = newWidth / aspect;
    activeImg.style.width = `${newWidth}px`;
    activeImg.style.height = `${newHeight}px`;
  } else {
    // 自由缩放：dx 控制 width，dy 控制 height
    const newHeight = Math.max(20, startHeight + dy);
    activeImg.style.width = `${newWidth}px`;
    activeImg.style.height = `${newHeight}px`;
  }
  updateHandlePosition();
}

function onMouseUp() {
  if (!resizing) return;
  resizing = false;
  justResized = true;
  window.removeEventListener("mousemove", onMouseMove);
  window.removeEventListener("mouseup", onMouseUp);
  if (activeImg) {
    activeImg.style.outline = "";
    commitToProseMirror();
  }
  // 在下一个事件循环清除标志，避免拖拽后紧接的 click 误移除句柄
  setTimeout(() => {
    justResized = false;
  }, 0);
}

/** 查找 img 对应的 ProseMirror 节点位置（pos 指向节点前） */
function findImagePos(view: EditorView, img: HTMLImageElement): number | null {
  try {
    const pos = view.posAtDOM(img, 0);
    const node = view.state.doc.nodeAt(pos);
    if (node && node.type.name === "image") return pos;
    // posAtDOM 可能返回节点后的位置，尝试 pos - 1
    const prevNode = view.state.doc.nodeAt(pos - 1);
    if (prevNode && prevNode.type.name === "image") return pos - 1;
    return null;
  } catch {
    return null;
  }
}

function commitToProseMirror() {
  const view = viewRef;
  const img = activeImg;
  if (!view || !img) return;
  const width = img.style.width;
  const height = img.style.height;
  if (!width) return;
  const pos = findImagePos(view, img);
  if (pos == null) return;
  const node = view.state.doc.nodeAt(pos);
  if (!node || node.type.name !== "image") return;
  // 检查 schema 是否支持 width attr（Milkdown 默认不支持）
  const imageType = view.state.schema.nodes.image;
  if (imageType && "width" in (imageType as any).attrs) {
    const newAttrs: Record<string, unknown> = { ...node.attrs, width };
    if (height) newAttrs.height = height;
    try {
      view.dispatch(view.state.tr.setNodeMarkup(pos, undefined, newAttrs));
    } catch {
      /* 写入失败：忽略，DOM style 仍然保留 */
    }
  }
  // schema 不支持 width：保持 DOM style，不 dispatch（避免 re-render 丢失）
}

export function attachImageResize(view: EditorView): () => void {
  if (!view) return () => {};
  viewRef = view;
  const dom = view.dom as HTMLElement;

  const onClick = (e: MouseEvent) => {
    // 忽略拖拽结束紧接的 click（mouseup → click 序列）
    if (justResized) {
      justResized = false;
      return;
    }
    const target = e.target as HTMLElement;
    if (target.tagName === "IMG") {
      // 单击图片：显示/更新缩放句柄
      showHandle(target as HTMLImageElement);
    } else if (!resizing) {
      // 点击非图片（且不在拖拽中）：移除句柄
      removeHandle();
    }
  };

  const onDblClick = (e: MouseEvent) => {
    // 双击图片打开 lightbox 时，先移除句柄（避免与 lightbox 重叠）
    const target = e.target as HTMLElement;
    if (target.tagName === "IMG") {
      removeHandle();
    }
  };

  const onScroll = () => updateHandlePosition();
  const onResize = () => updateHandlePosition();
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape" && handleEl) {
      removeHandle();
    }
  };

  dom.addEventListener("click", onClick);
  dom.addEventListener("dblclick", onDblClick);
  // scroll 用捕获模式，监听任意层级的滚动容器
  window.addEventListener("scroll", onScroll, true);
  window.addEventListener("resize", onResize);
  window.addEventListener("keydown", onKeyDown);

  return () => {
    dom.removeEventListener("click", onClick);
    dom.removeEventListener("dblclick", onDblClick);
    window.removeEventListener("scroll", onScroll, true);
    window.removeEventListener("resize", onResize);
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("mousemove", onMouseMove);
    window.removeEventListener("mouseup", onMouseUp);
    removeHandle();
    viewRef = null;
  };
}
