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
import { isDangerousRegex } from "../shared/safeRegex";

export interface FindResult {
  from: number;
  to: number;
}

export interface FindOpts {
  regex: boolean;
  caseSensitive: boolean;
}

const CODE_NODE_TYPES = new Set(["code_block", "fence", "math_block", "mermaid", "code_inline"]);

/**
 * 对纯文本执行一次性的多处替换（CodeEditor 路径）。
 * 从后往前拼装避免偏移；必须基于同一份初始文本一次性计算，
 * 不能在循环里逐次调用 setState（React 批处理会让每次替换都基于旧文本，
 * 最终只有第一处生效）。
 */
export function replaceAllInText(
  text: string,
  matches: FindResult[],
  replacement: string
): string {
  let out = text;
  for (let i = matches.length - 1; i >= 0; i--) {
    out = out.slice(0, matches[i].from) + replacement + out.slice(matches[i].to);
  }
  return out;
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
    // ReDoS 防护：拒绝危险正则在渲染进程主线程上执行（灾难性回溯会卡死整个界面）
    if (isDangerousRegex(query)) return out;
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
      if (CODE_NODE_TYPES.has(name)) return false;
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

/**
 * 异步版 findAll：把正则匹配循环按批让出主线程（每批后 await 宏任务），
 * 大文档 + 多匹配时不再一次性占用主线程导致界面卡死。
 * 期间文档可能被编辑：调用方需在完成后校验文档未变（或自行处理过期位置）。
 */
export async function findAllInDocAsync(
  view: EditorView,
  query: string,
  opts?: FindOpts
): Promise<FindResult[]> {
  const out: FindResult[] = [];
  if (!query) return out;
  // 编辑器可能已销毁（切换标签/关闭文件）：view.state 访问会抛错，
  // 全部路径统一返回空结果，避免 unhandled rejection
  let doc;
  try {
    doc = view.state.doc;
  } catch {
    return out;
  }
  let re: RegExp;
  if (opts?.regex) {
    // ReDoS 防护：拒绝危险正则在渲染进程主线程上执行（灾难性回溯会卡死整个界面）
    if (isDangerousRegex(query)) return out;
    try {
      re = new RegExp(query, opts.caseSensitive ? "g" : "gi");
    } catch {
      return out;
    }
  } else {
    const flags = opts?.caseSensitive ? "g" : "gi";
    re = new RegExp(escapeRegExp(query), flags);
  }
  // 先收集文本节点（引用快照），分批执行正则
  const textNodes: { text: string; from: number; skip: boolean }[] = [];
  doc.descendants((node, pos, parent) => {
    if (!node.isText) return true;
    let skip = false;
    if (parent && parent.type) {
      const name = parent.type.name;
      if (CODE_NODE_TYPES.has(name)) skip = true;
    }
    if (node.marks && node.marks.some((m) => m.type.name === "code")) skip = true;
    textNodes.push({ text: node.text || "", from: pos, skip });
    return true;
  });
  const CHUNK = 64; // 每批处理的文本节点数
  for (let i = 0; i < textNodes.length; i += CHUNK) {
    const chunk = textNodes.slice(i, i + CHUNK);
    for (const tn of chunk) {
      if (tn.skip) continue;
      const text = tn.text;
      let m: RegExpExecArray | null;
      re.lastIndex = 0;
      while ((m = re.exec(text)) !== null) {
        out.push({ from: tn.from + m.index, to: tn.from + m.index + m[0].length });
        if (m.index === re.lastIndex) re.lastIndex++;
      }
    }
    // 让出主线程（最后一批无需再让出）
    if (i + CHUNK < textNodes.length) {
      await new Promise<void>((r) => setTimeout(r, 0));
    }
  }
  return out;
}

export function selectMatch(view: EditorView, from: number, to: number) {
  try {
    const { state } = view;
    // 过期位置防护：matches 基于旧文档计算，若查找面板打开期间用户编辑了文档，
    // 位置可能越界，TextSelection.create 会抛 RangeError 导致整个界面崩溃。
    const docSize = state.doc.content.size;
    if (!Number.isFinite(from) || !Number.isFinite(to) || from < 0 || to > docSize || from > to) {
      return;
    }
    let tr = state.tr.setSelection(TextSelection.create(state.doc, from, to));
    tr = tr.scrollIntoView();
    view.dispatch(tr);
  } catch (err) {
    console.warn("[findReplace] selectMatch failed:", err);
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
      if (schema.marks.strong) out.push({ text: m[2], marks: [schema.marks.strong.create()] });
      else out.push({ text: m[2], marks: [] });
    } else if (m[3] != null) {
      if (schema.marks.em) out.push({ text: m[3], marks: [schema.marks.em.create()] });
      else out.push({ text: m[3], marks: [] });
    } else if (m[4] != null) {
      if (schema.marks.code) out.push({ text: m[4], marks: [schema.marks.code.create()] });
      else out.push({ text: m[4], marks: [] });
    } else if (m[5] != null) {
      const strikeMark = schema.marks.strike_through || schema.marks.strikethrough;
      if (strikeMark) out.push({ text: m[5], marks: [strikeMark.create()] });
      else out.push({ text: m[5], marks: [] });
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) {
    out.push({ text: text.slice(last), marks: [] });
  }
  return out;
}

/** 把匹配列表应用到文档（同步构建事务，matches 数量通常有限，很快） */
function applyReplacements(
  view: EditorView,
  matches: FindResult[],
  replacement: string,
): number {
  let tr = view.state.tr;
  const schema = view.state.schema;
  const docSize = view.state.doc.content.size;
  // 从后往前替换避免位置偏移
  for (let i = matches.length - 1; i >= 0; i--) {
    const { from, to } = matches[i];
    // 防御：位置越界（理论不会发生，matches 基于当前 doc 计算）直接跳过，
    // 避免 schema 操作抛 RangeError 中断整个替换
    if (from < 0 || to > docSize || from > to) continue;
    try {
      if (replacement) {
        // 把替换文本解析为带 marks 的节点序列，保留 markdown 语义
        const parts = parseInlineMarkdown(schema, replacement);
        if (parts.length === 0) {
          tr = tr.delete(from, to);
        } else {
          // 跳过空文本：ProseMirror text 节点不允许空内容，schema.text("") 会抛错
          const nodes = parts
            .filter((p) => p.text.length > 0)
            .map((p) =>
              p.marks.length
                ? schema.text(p.text, p.marks)
                : schema.text(p.text)
            );
          if (nodes.length === 0) {
            tr = tr.delete(from, to);
          } else {
            tr = tr.replaceWith(from, to, nodes);
          }
        }
      } else {
        tr = tr.delete(from, to);
      }
    } catch (err) {
      console.warn("[findReplace] replaceAll skipped a match:", err);
    }
  }
  view.dispatch(tr);
  return matches.length;
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
  return applyReplacements(view, matches, replacement);
}

/**
 * 异步版 replaceAll：匹配计算分片让出主线程（大文档不卡 UI）。
 * 分片期间文档若被编辑，本次替换放弃并返回 0（调用方重新触发）。
 */
export async function replaceAllInDocAsync(
  view: EditorView,
  query: string,
  replacement: string,
  opts?: FindOpts
): Promise<number> {
  if (!query) return 0;
  let docSnapshot;
  try {
    docSnapshot = view.state.doc;
  } catch {
    return 0; // 编辑器已销毁
  }
  const matches = await findAllInDocAsync(view, query, opts);
  if (!matches.length) return 0;
  try {
    // 分片匹配期间用户编辑了文档：位置已过期，放弃本次替换
    if (view.state.doc !== docSnapshot) return 0;
    return applyReplacements(view, matches, replacement);
  } catch {
    // 编辑器在异步匹配期间被销毁（切换标签/关闭文件）：放弃本次替换
    return 0;
  }
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
