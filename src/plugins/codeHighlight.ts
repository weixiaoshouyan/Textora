/**
 * Shiki 高亮（DOM 注入版）。
 *
 * 为什么不走 ProseMirror Decoration：
 *  PM widget 是 inline 元素，作为块级装饰无法与 code_block 节点完美对齐。
 *
 * 这里采用更稳的策略：
 *  1) 编辑器挂载后启动一个 MutationObserver，监听 view DOM 变化。
 *  2) 找到所有 <pre class="milkdown-code-block">，用 Shiki 渲染出高亮结果，
 *     插入到 pre 之前；通过 CSS 把 pre 内容透明、但保留可编辑能力。
 *  3) 主题切换时强制重渲染。
 *
 * 这种 DOM 级装饰的好处：
 *  - 不破坏 ProseMirror 的 schema 与序列化
 *  - 编辑/撤销/复制等行为完全不受影响
 *  - 渲染失败的代码块不会影响其他节点
 */
import { codeToHtmlSafe } from "./shikiClient";
import type { EditorView } from "@milkdown/prose/view";
import type { Node as PMNode } from "@milkdown/prose/model";

const RENDER_ATTR = "data-textora-rendered";
const WRAP_CLASS = "textora-codeblock-wrap";

// 友好语言标签列表
const LANG_LABELS: { label: string; value: string }[] = [
  { label: "Auto", value: "" },
  { label: "Bash", value: "bash" },
  { label: "C", value: "c" },
  { label: "C++", value: "cpp" },
  { label: "C#", value: "csharp" },
  { label: "CSS", value: "css" },
  { label: "Dart", value: "dart" },
  { label: "Dockerfile", value: "dockerfile" },
  { label: "Go", value: "go" },
  { label: "HTML", value: "html" },
  { label: "Java", value: "java" },
  { label: "JavaScript", value: "javascript" },
  { label: "JSON", value: "json" },
  { label: "Kotlin", value: "kotlin" },
  { label: "LaTeX", value: "latex" },
  { label: "Markdown", value: "markdown" },
  { label: "PHP", value: "php" },
  { label: "Plain Text", value: "plaintext" },
  { label: "Python", value: "python" },
  { label: "Ruby", value: "ruby" },
  { label: "Rust", value: "rust" },
  { label: "SCSS", value: "scss" },
  { label: "Shell", value: "shell" },
  { label: "SQL", value: "sql" },
  { label: "Swift", value: "swift" },
  { label: "TypeScript", value: "typescript" },
  { label: "TSX", value: "tsx" },
  { label: "Vue", value: "vue" },
  { label: "XML", value: "xml" },
  { label: "YAML", value: "yaml" },
];

function getLangLabel(value: string): string {
  const found = LANG_LABELS.find((l) => l.value === value);
  return found ? found.label : value || "Auto";
}

function getLangFromPre(pre: HTMLPreElement): string {
  // Milkdown 渲染 <pre><code class="language-xxx"> 或 <code class="language-xxx">
  const code = pre.querySelector("code");
  if (!code) return "plaintext";
  const cls = (code.className || "").match(/language-([\w-]+)/);
  return cls ? cls[1] : "plaintext";
}

function getCodeFromPre(pre: HTMLPreElement): string {
  // 编辑时从 ProseMirror 节点的 textContent 读取最新文本
  return pre.textContent || "";
}

// 完整内容哈希：避免"前 32 字符不变 + 后续等长度替换"导致高亮不更新
function hashCode(code: string): string {
  // 简单 FNV-1a，足够区分内容变化
  let h = 0x811c9dc5;
  for (let i = 0; i < code.length; i++) {
    h ^= code.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return code.length.toString(36) + "-" + h.toString(36);
}

/**
 * 通过 ProseMirror 事务更新 code_block 节点的 language attr。
 * 找到 pre 对应的 code_block 节点后调用 setNodeMarkup；失败则返回 false。
 */
function tryUpdateCodeBlockLang(
  view: EditorView | null | undefined,
  pre: HTMLPreElement,
  newLang: string
): boolean {
  if (!view) return false;
  try {
    const pos = view.posAtDOM(pre, 0);
    const $pos = view.state.doc.resolve(pos);
    let target: { node: PMNode; pos: number } | null = null;
    for (let depth = $pos.depth; depth > 0; depth--) {
      const node = $pos.node(depth);
      if (node && node.type.name === "code_block") {
        target = { node, pos: $pos.before(depth) };
        break;
      }
    }
    if (!target) return false;
    const { node, pos: nodePos } = target;
    const nextAttrs = { ...node.attrs, language: newLang };
    const tr = view.state.tr.setNodeMarkup(nodePos, undefined, nextAttrs);
    view.dispatch(tr);
    return true;
  } catch (err) {
    console.warn("textora: 更新 code_block 语言失败，回退到 DOM 方案", err);
    return false;
  }
}

async function decorateOne(pre: HTMLPreElement, view?: EditorView | null) {
  if (pre.getAttribute(RENDER_ATTR) === "1") return;
  pre.setAttribute(RENDER_ATTR, "1");
  const lang = getLangFromPre(pre);
  const code = getCodeFromPre(pre);
  const wrap = document.createElement("div");
  wrap.className = WRAP_CLASS;
  wrap.setAttribute("data-lang", lang);
  wrap.setAttribute("data-code-hash", hashCode(code));

  // 语言切换按钮+下拉框：位于右下角（Typora 风格）
  const langContainer = document.createElement("div");
  langContainer.className = "textora-code-lang-selector";

  const langBtn = document.createElement("button");
  langBtn.className = "textora-code-lang-btn";
  langBtn.textContent = getLangLabel(lang);
  langBtn.title = "切换代码语言";

  const langDropdown = document.createElement("div");
  langDropdown.className = "textora-code-lang-dropdown";
  langDropdown.style.display = "none";
  LANG_LABELS.forEach((l) => {
    const item = document.createElement("div");
    item.className = "textora-code-lang-item";
    item.textContent = l.label;
    if (l.value === lang || (l.value === "" && (!lang || lang === "plaintext"))) {
      item.classList.add("active");
    }
    item.addEventListener("mousedown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const newLang = l.value || "plaintext";
      langDropdown.style.display = "none";
      const updated = tryUpdateCodeBlockLang(view, pre, newLang);
      if (updated) {
        return;
      }
      // 回退：直接改 DOM class 并重新渲染
      const codeEl = pre.querySelector("code");
      if (codeEl) {
        codeEl.className = `language-${newLang}`;
      }
      pre.removeAttribute(RENDER_ATTR);
      const oldWrap = pre.closest(`.${WRAP_CLASS}`) as HTMLElement | null;
      if (oldWrap) {
        const render = oldWrap.querySelector(".textora-code-render");
        if (render) render.remove();
        const parent = oldWrap.parentNode;
        if (parent) {
          parent.insertBefore(pre, oldWrap);
          oldWrap.remove();
        }
      }
      void decorateOne(pre, view);
    });
    langDropdown.appendChild(item);
  });
  langContainer.appendChild(langBtn);
  langContainer.appendChild(langDropdown);

  langBtn.addEventListener("mousedown", (e) => {
    e.preventDefault();
    e.stopPropagation();
    const isOpen = langDropdown.style.display === "block";
    document.querySelectorAll(".textora-code-lang-dropdown").forEach((d) => {
      (d as HTMLElement).style.display = "none";
    });
    langDropdown.style.display = isOpen ? "none" : "block";
  });

  // 复制按钮（右下角，语言选择器旁边）
  const copyBtn = document.createElement("button");
  copyBtn.className = "textora-code-copy-btn";
  copyBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
  </svg>`;
  copyBtn.title = "复制代码";
  copyBtn.onclick = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(code);
      copyBtn.classList.add("copied");
      copyBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="20 6 9 17 4 12"></polyline>
      </svg>`;
      setTimeout(() => {
        copyBtn.classList.remove("copied");
        copyBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
        </svg>`;
      }, 2000);
    } catch (err) {
      console.error("复制失败:", err);
    }
  };

  // 底部工具栏（Typora 风格：语言 + 复制都在右下角）
  const footer = document.createElement("div");
  footer.className = "textora-code-footer";
  footer.appendChild(langContainer);
  footer.appendChild(copyBtn);

  const render = document.createElement("div");
  render.className = "textora-code-render";
  wrap.appendChild(render);
  wrap.appendChild(pre);
  wrap.appendChild(footer);
  pre.parentNode?.insertBefore(wrap, pre);
  const html = await codeToHtmlSafe(code, lang);
  render.innerHTML = html;
  render
    .querySelector("pre")
    ?.classList.add("textora-shiki-pre");
  render
    .querySelector("pre > code")
    ?.classList.add("textora-shiki-code");
}

function collectAndDecorate(root: HTMLElement, view?: EditorView | null) {
  const pres = root.querySelectorAll<HTMLPreElement>("pre.milkdown-code-block");
  pres.forEach((pre) => {
    if (pre.closest(`.${WRAP_CLASS}`)) {
      // 已装饰的代码块：检查内容或语言是否变化
      const wrap = pre.closest(`.${WRAP_CLASS}`) as HTMLElement | null;
      if (wrap) {
        const oldHash = wrap.getAttribute("data-code-hash");
        const oldLang = wrap.getAttribute("data-lang");
        const newCode = getCodeFromPre(pre);
        const newHash = hashCode(newCode);
        const newLang = getLangFromPre(pre);
        if (oldHash !== newHash || oldLang !== newLang) {
          // 内容或语言已变化，移除旧装饰重新渲染
          pre.removeAttribute(RENDER_ATTR);
          const render = wrap.querySelector(".textora-code-render");
          if (render) render.remove();
          const parent = wrap.parentNode;
          if (parent) {
            parent.insertBefore(pre, wrap);
            wrap.remove();
          }
          void decorateOne(pre, view);
        }
      }
      return;
    }
    if (pre.getAttribute(RENDER_ATTR) === "1") return;
    void decorateOne(pre, view);
  });
}

export function attachCodeHighlighter(view: EditorView | null) {
  if (!view) return () => {};
  const root = view.dom as HTMLElement;

  const obs = new MutationObserver(() => {
    collectAndDecorate(root, view);
  });
  obs.observe(root, {
    childList: true,
    subtree: true,
    characterData: true,
  });

  // 全局点击关闭语言下拉框
  const globalClickHandler = (e: MouseEvent) => {
    const target = e.target as HTMLElement;
    if (!target.closest(".textora-code-lang-btn")) {
      root.querySelectorAll(".textora-code-lang-dropdown").forEach((d) => {
        (d as HTMLElement).style.display = "none";
      });
    }
  };
  document.addEventListener("mousedown", globalClickHandler);

  // 初次
  collectAndDecorate(root, view);

  // 暴露到 view 上方便主题切换时强制刷新
  (view as any).__textoraRefreshCode = () => {
    // 把所有已装饰的容器解包，然后重新走 collect
    root
      .querySelectorAll<HTMLElement>(`[data-textora-rendered="1"]`)
      .forEach((el) => {
        el.removeAttribute("data-textora-rendered");
        const parent = el.closest(`.${WRAP_CLASS}`);
        if (parent && parent.parentNode) {
          const pre = parent.querySelector("pre.milkdown-code-block");
          if (pre) {
            parent.parentNode.insertBefore(pre, parent);
            parent.remove();
          }
        }
      });
    collectAndDecorate(root, view);
  };

  return () => {
    obs.disconnect();
    document.removeEventListener("mousedown", globalClickHandler);
  };
}

export function refreshCodeHighlighter(view: EditorView | null) {
  if (!view) return;
  const fn = (view as any).__textoraRefreshCode;
  if (typeof fn === "function") fn();
}
