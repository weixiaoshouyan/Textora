/**
 * 在 Milkdown/ProseMirror 视图中执行查找替换。
 * 通过 view.state.doc 进行正则匹配，再用事务替换。
 *
 * 修复：
 *  1. 替换内容使用 Markdown 重新解析（通过 schema.text + marks），
 *     而非把 `**bar**` 当字面字符插入
 *  2. selectMatch 高亮当前匹配并滚动到可视区
 */
import type { EditorView } from "@milkdown/prose/view";
import { TextSelection } from "@milkdown/prose/state";
import { Mark } from "@milkdown/prose/model";

export interface FindResult {
  from: number;
  to: number;
}

export interface FindOpts {
  regex: boolean;
  caseSensitive: boolean;
}

export function findAllInDoc(
  view: EditorView,
  query: string,
  opts?: FindOpts
): FindResult[] {
  const out: FindResult[] = [];
  if (!query) return out;
  let re: RegExp;
  if (opts?.regex) {
    try {
      re = new RegExp(query, opts.caseSensitive ? "g" : "gi");
    } catch {
      return out;
    }
  } else {
    const flags = opts?.caseSensitive ? "g" : "gi";
    re = new RegExp(escapeRegExp(query), flags);
  }
  view.state.doc.descendants((node, pos, parent) => {
    if (!node.isText) return true;
    // 跳过代码块内的文本
    if (parent && parent.type) {
      const name = parent.type.name;
      if (name === "code_block") return false;
    }
    // 跳过带有 code mark 的文本（行内代码）
    if (node.marks && node.marks.some((m) => m.type.name === "code")) return true;
    const text: string = node.text || "";
    let m: RegExpExecArray | null;
    re.lastIndex = 0;
    while ((m = re.exec(text)) !== null) {
      out.push({ from: pos + m.index, to: pos + m.index + m[0].length });
      if (m.index === re.lastIndex) re.lastIndex++;
    }
    return true;
  });
  return out;
}

export function selectMatch(view: EditorView, from: number, to: number) {
  const tr = view.state.tr.setSelection(TextSelection.create(view.state.doc, from, to));
  view.dispatch(tr);
  // 滚动到可视区
  const dom = view.nodeDOM(from) as HTMLElement | null;
  if (dom && typeof (dom as any).scrollIntoView === "function") {
    (dom as any).scrollIntoView({ block: "center", behavior: "smooth" });
  }
}

/**
 * 把替换字符串解析为带 marks 的文本节点序列。
 * 简单支持 **粗体**、*斜体*、`代码`、~~删除线~~ 四种行内语法。
 * 其余字符作为纯文本插入。
 */
function parseInlineMarkdown(
  schema: any,
  text: string
): Array<{ text: string; marks: Mark[] }> {
  const out: Array<{ text: string; marks: Mark[] }> = [];
  const re = /(\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`|~~([^~]+)~~)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) {
      out.push({ text: text.slice(last, m.index), marks: [] });
    }
    if (m[2] != null) {
      const mark = schema.marks.strong.create();
      out.push({ text: m[2], marks: [mark] });
    } else if (m[3] != null) {
      const mark = schema.marks.em.create();
      out.push({ text: m[3], marks: [mark] });
    } else if (m[4] != null) {
      const mark = schema.marks.code.create();
      out.push({ text: m[4], marks: [mark] });
    } else if (m[5] != null) {
      const mark = schema.marks.strikethrough.create();
      out.push({ text: m[5], marks: [mark] });
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) {
    out.push({ text: text.slice(last), marks: [] });
  }
  return out;
}

export function replaceAllInDoc(
  view: EditorView,
  query: string,
  replacement: string,
  opts?: FindOpts
): number {
  if (!query) return 0;
  const matches = findAllInDoc(view, query, opts);
  if (!matches.length) return 0;
  let tr = view.state.tr;
  const schema = view.state.schema;
  // 从后往前替换避免位置偏移
  for (let i = matches.length - 1; i >= 0; i--) {
    const { from, to } = matches[i];
    if (replacement) {
      // 把替换文本解析为带 marks 的节点序列，保留 markdown 语义
      const parts = parseInlineMarkdown(schema, replacement);
      if (parts.length === 0) {
        tr = tr.delete(from, to);
      } else {
        const nodes = parts.map((p) =>
          p.marks.length
            ? schema.text(p.text, p.marks)
            : schema.text(p.text)
        );
        tr = tr.replaceWith(from, to, nodes);
      }
    } else {
      tr = tr.delete(from, to);
    }
  }
  view.dispatch(tr);
  return matches.length;
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
