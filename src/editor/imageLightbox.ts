/**
 * 图片 Lightbox：双击 Markdown 编辑器中的图片，打开全屏查看器。
 *
 * 功能：
 *  - 双击图片打开 lightbox
 *  - 滚轮缩放（0.2x ~ 5x）
 *  - 拖拽平移
 *  - Escape / 点击背景关闭
 *  - 工具栏：放大 / 缩小 / 重置 / 关闭
 */
import type { EditorView } from "@milkdown/prose/view";

let lightboxEl: HTMLDivElement | null = null;
let lightboxImg: HTMLImageElement | null = null;
let scale = 1;
let translateX = 0;
let translateY = 0;
let isDragging = false;
let dragStartX = 0;
let dragStartY = 0;
let dragStartTX = 0;
let dragStartTY = 0;
let onKeyHandler: ((e: KeyboardEvent) => void) | null = null;

function applyTransform() {
  if (lightboxImg) {
    lightboxImg.style.transform = `translate(${translateX}px, ${translateY}px) scale(${scale})`;
  }
}

function resetView() {
  scale = 1;
  translateX = 0;
  translateY = 0;
  applyTransform();
}

function closeLightbox() {
  if (lightboxEl) {
    // 关闭时移除 window 级监听器，避免每次开关叠加导致内存泄漏
    window.removeEventListener("mousemove", onWindowMouseMove);
    window.removeEventListener("mouseup", onWindowMouseUp);
    if (onKeyHandler) {
      window.removeEventListener("keydown", onKeyHandler);
      onKeyHandler = null;
    }
    lightboxEl.remove();
    lightboxEl = null;
    lightboxImg = null;
    isDragging = false;
  }
}

function ensureLightbox(): { el: HTMLDivElement; img: HTMLImageElement } {
  if (lightboxEl && lightboxImg) {
    return { el: lightboxEl, img: lightboxImg };
  }
  closeLightbox();

  const el = document.createElement("div");
  el.className = "textora-lightbox";
  el.style.cssText = `
    position: fixed; inset: 0; z-index: 9999;
    background: rgba(0,0,0,0.88);
    display: flex; align-items: center; justify-content: center;
    cursor: grab;
  `;

  const img = document.createElement("img");
  img.style.cssText = `
    max-width: 90vw; max-height: 90vh;
    transition: transform 0.05s linear;
    user-select: none; -webkit-user-drag: none;
    pointer-events: none;
  `;
  el.appendChild(img);

  // 工具栏
  const toolbar = document.createElement("div");
  toolbar.style.cssText = `
    position: absolute; top: 16px; right: 16px;
    display: flex; gap: 6px; z-index: 1;
  `;
  const mkBtn = (label: string, title: string, onClick: () => void) => {
    const b = document.createElement("button");
    b.textContent = label;
    b.title = title;
    b.style.cssText = `
      width: 36px; height: 36px; border-radius: 6px;
      border: 1px solid rgba(255,255,255,0.2);
      background: rgba(255,255,255,0.1); color: #fff;
      font-size: 18px; cursor: pointer;
      display: flex; align-items: center; justify-content: center;
    `;
    b.onmouseenter = () => (b.style.background = "rgba(255,255,255,0.2)");
    b.onmouseleave = () => (b.style.background = "rgba(255,255,255,0.1)");
    b.onclick = (e) => { e.stopPropagation(); onClick(); };
    return b;
  };
  toolbar.appendChild(mkBtn("+", "放大", () => {
    scale = Math.min(scale * 1.25, 5);
    applyTransform();
  }));
  toolbar.appendChild(mkBtn("−", "缩小", () => {
    scale = Math.max(scale / 1.25, 0.2);
    applyTransform();
  }));
  toolbar.appendChild(mkBtn("↺", "重置", resetView));
  toolbar.appendChild(mkBtn("✕", "关闭", closeLightbox));
  el.appendChild(toolbar);

  // 事件
  el.addEventListener("click", (e) => {
    if (e.target === el || e.target === img) closeLightbox();
  });
  el.addEventListener("wheel", (e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 1 / 1.15 : 1.15;
    scale = Math.max(0.2, Math.min(scale * delta, 5));
    applyTransform();
  }, { passive: false });
  el.addEventListener("mousedown", (e) => {
    if (e.target === el) {
      isDragging = true;
      dragStartX = e.clientX;
      dragStartY = e.clientY;
      dragStartTX = translateX;
      dragStartTY = translateY;
      el.style.cursor = "grabbing";
    }
  });
  window.addEventListener("mousemove", onWindowMouseMove);
  window.addEventListener("mouseup", onWindowMouseUp);
  onKeyHandler = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      closeLightbox();
    }
  };
  window.addEventListener("keydown", onKeyHandler);

  document.body.appendChild(el);
  lightboxEl = el;
  lightboxImg = img;
  return { el, img };
}

function onWindowMouseMove(e: MouseEvent) {
  if (!isDragging || !lightboxEl) return;
  translateX = dragStartTX + (e.clientX - dragStartX);
  translateY = dragStartTY + (e.clientY - dragStartY);
  applyTransform();
}

function onWindowMouseUp() {
  if (isDragging && lightboxEl) {
    isDragging = false;
    lightboxEl.style.cursor = "grab";
  }
}

function openLightbox(src: string, alt: string) {
  const { img } = ensureLightbox();
  img.src = src;
  img.alt = alt;
  resetView();
}

export function attachImageLightbox(view: EditorView) {
  if (!view) return () => {};
  const dom = view.dom as HTMLElement;

  const onDblClick = (e: MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.tagName === "IMG") {
      e.preventDefault();
      e.stopPropagation();
      const img = target as HTMLImageElement;
      openLightbox(img.src, img.alt || "");
    }
  };

  dom.addEventListener("dblclick", onDblClick);
  return () => {
    dom.removeEventListener("dblclick", onDblClick);
    closeLightbox();
  };
}
