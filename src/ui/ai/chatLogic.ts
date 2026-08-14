/**
 * AI 聊天逻辑（纯函数）：文档上下文提取与项目上下文构建。
 *
 * 与组件解耦，便于单测与复用：
 *  - extractDocumentContext：优先选区 → 光标前后 ±2000 字符 → 文档开头
 *  - buildProjectContext：项目根 / 工作目录信息
 */
import { useAppStore, getActiveTab } from "../../store/useAppStore";

/**
 * 提取当前文档上下文，优先「选区内容」→「光标附近 ±2000 字符」→ 文档开头。
 * 整篇长文档直接截断前 4000 字符往往丢失 AI 真正需要关心的部分；
 * 基于光标位置裁剪让模型看到正在编辑的上下文。
 */
export function extractDocumentContext(content: string): string {
  const s = useAppStore.getState();
  if (!getActiveTab(s)) return "";
  // WYSIWYG（Milkdown）：从 ProseMirror 文档取选区/光标
  const view = s.editorView;
  if (view?.state) {
    const { from, to } = view.state.selection;
    const doc = view.state.doc;
    const size = doc.content.size;
    if (from !== to) {
      const sel = doc.textBetween(from, to, "\n", "\n");
      if (sel.trim()) return `[选中内容]\n${sel.slice(0, 4000)}`;
    }
    const before = doc.textBetween(Math.max(0, from - 2000), from, "\n", "\n");
    const after = doc.textBetween(to, Math.min(size, to + 2000), "\n", "\n");
    return `[光标前 2000 字符]\n${before}\n[光标后 2000 字符]\n${after}`;
  }
  // 源码/代码模式：textarea
  const ta = document.querySelector(".textora-code-textarea") as HTMLTextAreaElement | null;
  if (ta) {
    const pos = ta.selectionStart;
    const end = ta.selectionEnd;
    const text = ta.value;
    if (pos !== end) {
      const sel = text.slice(pos, end);
      if (sel.trim()) return `[选中内容]\n${sel.slice(0, 4000)}`;
    }
    const before = text.slice(Math.max(0, pos - 2000), pos);
    const after = text.slice(end, end + 2000);
    return `[光标前 2000 字符]\n${before}\n[光标后 2000 字符]\n${after}`;
  }
  // 回退：文档开头
  return content.slice(0, 4000);
}

/** 项目上下文（项目根 / 工作目录），供 AI 了解所处项目 */
export function buildProjectContext(projectDir: string, workspaceRoot: string): string {
  if (!projectDir) return "";
  const parts: string[][] = [];
  if (workspaceRoot) parts.push(["Project root:", workspaceRoot]);
  if (projectDir) parts.push(["Selected project directory:", projectDir]);
  return parts.map(([k, v]) => k + "\n" + v).join("\n\n");
}
