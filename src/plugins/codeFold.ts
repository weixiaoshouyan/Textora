/**
 * Milkdown Code Folding Plugin
 * 
 * Adds fold/unfold icons to code blocks and headings in the Milkdown editor.
 * Uses DOM-based approach (MutationObserver) similar to codeHighlight plugin.
 */
import type { EditorView } from "@milkdown/prose/view";

const FOLD_ATTR = "data-textora-foldable";
const FOLDED_ATTR = "data-textora-folded";
const FOLD_BTN_CLASS = "textora-fold-btn";

/**
 * Attach code folding to Milkdown editor view
 */
export function attachCodeFolding(view: EditorView): () => void {
  const dom = view.dom as HTMLElement;

  // Add base styles
  const styleId = "textora-fold-styles";
  if (!document.getElementById(styleId)) {
    const style = document.createElement("style");
    style.id = styleId;
    style.textContent = `
      .${FOLD_BTN_CLASS} {
        position: absolute;
        left: -20px;
        top: 2px;
        width: 16px;
        height: 16px;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        font-size: 10px;
        color: var(--textora-fg-muted);
        border-radius: 3px;
        user-select: none;
        z-index: 10;
      }
      .${FOLD_BTN_CLASS}:hover {
        background: var(--textora-bg-muted);
        color: var(--textora-fg);
      }
      [${FOLDED_ATTR}="true"] > .textora-fold-content {
        display: none;
      }
      [${FOLDED_ATTR}="true"]::after {
        content: " ...";
        color: var(--textora-fg-muted);
        font-style: italic;
      }
      .milkdown h1, .milkdown h2, .milkdown h3,
      .milkdown h4, .milkdown h5, .milkdown h6,
      .milkdown pre {
        position: relative;
      }
    `;
    document.head.appendChild(style);
  }

  function processNode(node: Element) {
    if (node.hasAttribute(FOLD_ATTR)) return;
    
    const tagName = node.tagName.toLowerCase();
    const isHeading = /^h[1-6]$/.test(tagName);
    const isCodeBlock = tagName === "pre" && node.classList.contains("milkdown-code-block");

    if (!isHeading && !isCodeBlock) return;

    node.setAttribute(FOLD_ATTR, "true");
    (node as HTMLElement).style.position = "relative";

    // Create fold button
    const btn = document.createElement("span");
    btn.className = FOLD_BTN_CLASS;
    btn.textContent = "▼";
    btn.title = "折叠/展开";
    btn.setAttribute("data-textora-fold-btn", "true");
    // 使用绝对定位，避免影响 heading 的 textContent
    btn.style.position = "absolute";
    btn.style.left = "-20px";
    node.appendChild(btn);

    // For headings: track sibling nodes that will be hidden (CSS-based, no DOM wrapping)
    if (isHeading) {
      const level = parseInt(tagName[1]);
      const contentNodes: Element[] = [];
      let sibling = node.nextElementSibling;
      while (sibling) {
        const sibTag = sibling.tagName.toLowerCase();
        if (/^h[1-6]$/.test(sibTag)) {
          const sibLevel = parseInt(sibTag[1]);
          if (sibLevel <= level) break;
        }
        contentNodes.push(sibling);
        sibling = sibling.nextElementSibling;
      }
      // 暂存待隐藏的兄弟节点，供 click 处理器使用（不移动 DOM）
      (node as any)._textoraFoldSiblings = contentNodes;
    }

    // Click handler
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const isFolded = node.getAttribute(FOLDED_ATTR) === "true";
      if (isFolded) {
        // Unfold
        node.removeAttribute(FOLDED_ATTR);
        btn.textContent = "▼";
        // 恢复 heading 兄弟节点显示
        if (isHeading) {
          const hidden = (node as any)._textoraHiddenNodes as HTMLElement[] | undefined;
          if (hidden) {
            hidden.forEach(n => { n.style.display = ""; });
            (node as any)._textoraHiddenNodes = undefined;
          }
        }
        // 恢复代码块显示
        if (isCodeBlock) {
          const code = node.querySelector("code");
          if (code) {
            code.style.maxHeight = "";
            code.style.overflow = "";
          }
        }
      } else {
        // Fold
        node.setAttribute(FOLDED_ATTR, "true");
        btn.textContent = "▶";
        // 隐藏 heading 兄弟节点（仅设置 display，不移动 DOM）
        if (isHeading) {
          const siblings = (node as any)._textoraFoldSiblings as Element[] | undefined;
          if (siblings && siblings.length > 0) {
            const hiddenNodes: HTMLElement[] = [];
            siblings.forEach(s => {
              if (s instanceof HTMLElement) {
                hiddenNodes.push(s);
                s.style.display = "none";
              }
            });
            (node as any)._textoraHiddenNodes = hiddenNodes;
          }
        }
        // 折叠代码块：使用 max-height + overflow，不包裹 DOM
        if (isCodeBlock) {
          const code = node.querySelector("code");
          if (code) {
            code.style.maxHeight = "0";
            code.style.overflow = "hidden";
          }
        }
      }
    });
  }

  // Process existing nodes
  function processAll() {
    dom.querySelectorAll("h1, h2, h3, h4, h5, h6, pre.milkdown-code-block").forEach(processNode);
  }

  // Observe DOM changes
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      mutation.addedNodes.forEach((n) => {
        if (n instanceof Element) {
          const tag = n.tagName.toLowerCase();
          if (/^h[1-6]$/.test(tag) || (tag === "pre" && n.classList.contains("milkdown-code-block"))) {
            processNode(n);
          }
          n.querySelectorAll("h1, h2, h3, h4, h5, h6, pre.milkdown-code-block").forEach(processNode);
        }
      });
    }
  });

  observer.observe(dom, { childList: true, subtree: true });

  // Initial processing
  processAll();

  // Re-process on theme change
  const themeObserver = new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (m.type === "attributes" && m.attributeName === "class") {
        const target = m.target as HTMLElement;
        // 只在根元素或主题相关 class 变化时重新处理
        if (target === dom || target.hasAttribute("data-theme")) {
          setTimeout(processAll, 100);
        }
      }
    }
  });
  themeObserver.observe(dom, { attributes: true, attributeFilter: ["class"], subtree: true });

  // Cleanup function
  return () => {
    observer.disconnect();
    themeObserver.disconnect();
    dom.querySelectorAll(`[${FOLD_ATTR}]`).forEach(node => {
      const btn = node.querySelector(`.${FOLD_BTN_CLASS}`);
      btn?.remove();
      node.removeAttribute(FOLD_ATTR);
      node.removeAttribute(FOLDED_ATTR);
    });
  };
}
