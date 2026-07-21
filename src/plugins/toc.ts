/**
 * [TOC] 支持：Typora 风格的内联目录。
 *
 * 当文档中出现单独一行 `[TOC]`（不区分大小写）时，
 * 把该段落替换为一个目录卡片，列出所有 H1-H6 标题，点击可跳转。
 */
import { Plugin, PluginKey } from "@milkdown/prose/state";
import { Decoration, DecorationSet } from "@milkdown/prose/view";
import { $prose } from "@milkdown/utils";

interface PluginState {
  set: DecorationSet;
  bump: number;
}

export const tocKey = new PluginKey<PluginState>("textora-toc");

const TOC_RE = /^\s*\[TOC\]\s*$/i;

interface HeadingInfo {
  level: number;
  text: string;
  pos: number;
}

function collectHeadings(doc: any): HeadingInfo[] {
  const out: HeadingInfo[] = [];
  doc.descendants((node: any, pos: number) => {
    const name = node.type.name;
    if (name === "heading") {
      out.push({
        level: node.attrs.level || 1,
        text: node.textContent || "",
        pos,
      });
    }
    return true;
  });
  return out;
}

function findTocBlocks(
  doc: any
): Array<{ pos: number; to: number }> {
  const out: Array<{ pos: number; to: number }> = [];
  doc.descendants((node: any, pos: number) => {
    if (node.type.name !== "paragraph") return true;
    if (TOC_RE.test(node.textContent)) {
      out.push({ pos, to: pos + node.nodeSize });
    }
    return true;
  });
  return out;
}

function buildTocDom(headings: HeadingInfo[]): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = "textora-toc";
  wrap.setAttribute("data-toc", "1");
  const title = document.createElement("div");
  title.className = "textora-toc-title";
  title.textContent = "目录";
  wrap.appendChild(title);
  if (headings.length === 0) {
    const empty = document.createElement("div");
    empty.className = "textora-toc-empty";
    empty.textContent = "（暂无标题）";
    wrap.appendChild(empty);
    return wrap;
  }
  const list = document.createElement("div");
  list.className = "textora-toc-list";
  for (const h of headings) {
    const item = document.createElement("div");
    item.className = "textora-toc-item";
    item.style.paddingLeft = `${(h.level - 1) * 12 + 8}px`;
    item.textContent = h.text;
    item.title = h.text;
    item.addEventListener("click", () => {
      // 通过自定义事件让外部跳转
      const ev = new CustomEvent("textora-toc-jump", {
        detail: { pos: h.pos },
        bubbles: true,
      });
      wrap.dispatchEvent(ev);
    });
    list.appendChild(item);
  }
  wrap.appendChild(list);
  return wrap;
}

export const tocPlugin = $prose(() => {
  return new Plugin<PluginState>({
    key: tocKey,
    state: {
      init: () => ({ set: DecorationSet.empty, bump: 0 }),
      apply(tr, prev) {
        const meta = tr.getMeta(tocKey);
        const bump = meta && typeof meta.bump === "number" ? meta.bump : prev.bump;
        if (!tr.docChanged && bump === prev.bump) return prev;

        const blocks = findTocBlocks(tr.doc);
        if (blocks.length === 0) {
          return { set: DecorationSet.empty, bump };
        }
        const headings = collectHeadings(tr.doc);
        const decos: Decoration[] = [];
        for (const b of blocks) {
          const widget = buildTocDom(headings);
          decos.push((Decoration as any).replace(b.pos, b.to, { widget }));
        }
        return { set: DecorationSet.create(tr.doc, decos), bump };
      },
    },
    props: {
      decorations(state) {
        return this.getState(state)?.set ?? null;
      },
    },
  });
});

export function bumpToc(view: any) {
  if (!view) return;
  const { state, dispatch } = view;
  const tr = state.tr.setMeta(tocKey, { bump: Date.now() });
  dispatch(tr);
}

/**
 * 监听 TOC 跳转事件，把 ProseMirror 位置滚动到视图中。
 * 在 MilkdownEditor 中调用一次。
 */
export function attachTocJump(view: any): () => void {
  const handler = (e: Event) => {
    const detail = (e as CustomEvent).detail as { pos: number };
    if (typeof detail?.pos !== "number") return;
    e.stopPropagation();
    const node = view.nodeDOM(detail.pos) as HTMLElement | null;
    if (node && typeof node.scrollIntoView === "function") {
      node.scrollIntoView({ block: "start", behavior: "smooth" });
    }
  };
  const dom = view.dom as HTMLElement;
  dom.addEventListener("textora-toc-jump", handler);
  return () => dom.removeEventListener("textora-toc-jump", handler);
}
