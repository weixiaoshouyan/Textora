/**
 * wikiLink.ts - 双向链接 [[WikiLink]] DOM 代理与跳转处理器
 *
 * 监听 Milkdown ProseMirror 编辑器 DOM 点击事件，
 * 当用户按住 Ctrl / Cmd 或直接点击 [[文件名]] 格式链接时，
 * 解析目标文件名并调用 store 打开或自动创建对应 Markdown 文档。
 */
import type { EditorView } from "prosemirror-view";
import { useAppStore } from "../store/useAppStore";

export function attachWikiLinkHandler(view: EditorView): () => void {
  if (!view || !view.dom) return () => {};

  const handleClick = (e: MouseEvent) => {
    const target = e.target as HTMLElement;
    if (!target) return;

    // 获取点击位置的字符上下文
    const pos = view.posAtCoords({ left: e.clientX, top: e.clientY });
    if (!pos) return;

    const doc = view.state.doc;
    // ProseMirror 没有 lineAt API：向上回溯到最近的块级节点作为"行"的近似
    const $pos = doc.resolve(pos.pos);
    let depth = $pos.depth;
    let node = $pos.node(depth);
    while (depth > 0 && (node.isText || node.isInline)) {
      depth--;
      node = $pos.node(depth);
    }
    if (!node || node.isText || !node.isBlock) return;

    const blockStart = $pos.start(depth);
    // 块内文本；blockSeparator 与 leafText 用占位字符避免位置漂移
    const lineText = node.textBetween(0, node.content.size, "\n", "\uffff");

    // 检索块内所有的 [[WikiLink]] 模式
    const wikiRe = /\[\[([^\]]+)\]\]/g;
    let match: RegExpExecArray | null;

    while ((match = wikiRe.exec(lineText)) !== null) {
      const startInDoc = blockStart + match.index;
      const endInDoc = startInDoc + match[0].length;

      if (pos.pos >= startInDoc && pos.pos <= endInDoc) {
        const rawTarget = match[1].trim();
        if (!rawTarget) break;

        // 如果用户按住 Ctrl/Cmd 点击，或者是常规点击
        if (e.ctrlKey || e.metaKey || target.classList.contains("textora-wikilink")) {
          e.preventDefault();
          e.stopPropagation();

          const store = useAppStore.getState();
          const targetFilename = rawTarget.endsWith(".md") ? rawTarget : `${rawTarget}.md`;

          // 在已打开 tabs 中寻找
          const existingTab = store.tabs.find(
            (t) => t.name.toLowerCase() === targetFilename.toLowerCase()
          );

          if (existingTab && existingTab.path) {
            void store.openPath(existingTab.path);
          } else if (store.workspaceRoot) {
            // 在工作区根目录下查找或新建
            const fullPath = `${store.workspaceRoot.replace(/[\\/]+$/, "")}/${targetFilename}`;
            void store.checkBeforeOpen(fullPath).then((exists) => {
              if (exists) {
                void store.openPath(fullPath);
              } else {
                // 自动创建 WikiLink 目标文件
                void store.createNewFile(store.workspaceRoot!, targetFilename).then((createdPath) => {
                  if (createdPath) {
                    void store.openPath(createdPath);
                  }
                });
              }
            });
          }
          break;
        }
      }
    }
  };

  view.dom.addEventListener("click", handleClick);
  return () => {
    view.dom?.removeEventListener("click", handleClick);
  };
}
