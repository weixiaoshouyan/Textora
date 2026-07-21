/**
 * Milkdown 数学公式装饰器：
 *  - 块级公式：$$ ... $$   整段独占一行
 *  - 行内公式：$ ... $
 *  使用 KaTeX 渲染为 HTML，覆盖在原 Markdown 文本之上。
 */
import katex from "katex";
import { Plugin, PluginKey } from "@milkdown/prose/state";
import { Decoration, DecorationSet } from "@milkdown/prose/view";
import { $prose } from "@milkdown/utils";

interface PluginState {
  set: DecorationSet;
  bump: number;
}

export const mathKey = new PluginKey<PluginState>("textora-math");

const INLINE_RE = /(?<!\$)\$(?!\$)((?:[^$\\]|\\.)+?)(?<!\$)\$(?!\$)/g;
const BLOCK_RE = /^\s*\$\$([\s\S]+?)\$\$\s*$/;

function findMathBlocks(
  doc: any
): Array<{ pos: number; to: number; kind: "inline" | "block"; tex: string; node: any }> {
  const out: Array<{ pos: number; to: number; kind: "inline" | "block"; tex: string; node: any }> = [];
  doc.descendants((node: any, pos: number, parent: any) => {
    if (!node.isText) return true;
    if (!node.text) return true;
    // 跳过代码块内的文本
    if (parent && parent.type && parent.type.name === "code_block") return true;
    // 跳过带有 code mark 的行内代码
    if (node.marks && node.marks.some((m: any) => m.type.name === "code")) return true;
    const text: string = node.text;

    // 整段是块级公式
    const blockMatch = text.match(BLOCK_RE);
    if (blockMatch) {
      out.push({
        pos,
        to: pos + text.length,
        kind: "block",
        tex: blockMatch[1].trim(),
        node,
      });
      return true;
    }

    // 行内公式
    let m: RegExpExecArray | null;
    INLINE_RE.lastIndex = 0;
    while ((m = INLINE_RE.exec(text)) !== null) {
      out.push({
        pos: pos + m.index,
        to: pos + m.index + m[0].length,
        kind: "inline",
        tex: m[1],
        node,
      });
    }
    return true;
  });
  return out;
}

function renderKatex(tex: string, kind: "inline" | "block"): string {
  try {
    return katex.renderToString(tex, {
      throwOnError: false,
      displayMode: kind === "block",
      output: "html",
    });
  } catch (e) {
    return `<span style="color:#d4380d">[公式错误: ${(e as Error).message}]</span>`;
  }
}

export const mathPlugin = $prose(() => {
  return new Plugin<PluginState>({
    key: mathKey,
    state: {
      init: () => ({ set: DecorationSet.empty, bump: 0 }),
      apply(tr, prev) {
        const meta = tr.getMeta(mathKey);
        const bump = meta && typeof meta.bump === "number" ? meta.bump : prev.bump;
        if (!tr.docChanged && bump === prev.bump) return prev;

        const items = findMathBlocks(tr.doc);
        const decos: Decoration[] = [];
        for (const item of items) {
          const html = renderKatex(item.tex, item.kind);
          const wrapper = document.createElement(item.kind === "block" ? "div" : "span");
          wrapper.className = item.kind === "block" ? "textora-math-block" : "textora-math-inline";
          wrapper.setAttribute("data-tex", item.tex);
          wrapper.innerHTML = html;
          decos.push(
            (Decoration as any).replace(item.pos, item.to, {
              widget: wrapper,
            })
          );
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

export function bumpMath(view: any) {
  if (!view) return;
  const { state, dispatch } = view;
  const tr = state.tr.setMeta(mathKey, { bump: Date.now() });
  dispatch(tr);
}
