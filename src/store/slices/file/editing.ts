/**
 * 文件切片：光标 / 滚动状态与内容编辑。
 */
import type { AppState } from "../../types";
import { getActiveTab } from "../../helpers";
import type { SliceDeps } from "./types";

export function createEditingSlice({ set, get }: SliceDeps): Partial<AppState> {
  return {
    // ===== 光标 / 滚动状态 =====
    isCodeEditorActive: () => {
      const s = get();
      const tab = getActiveTab(s);
      // 源码模式下的 markdown，或 code 类型标签 → CodeEditor
      return (s.settings.sourceMode && tab?.kind === "markdown") || tab?.kind === "code";
    },

    saveCursorState: () => {
      const s = get();
      const tab = getActiveTab(s);
      if (!tab) return;
      let cursor: number | null = null;
      let scrollTop: number | undefined;
      if (s.isCodeEditorActive()) {
        // CodeEditor：通过 textarea 获取
        const ta = document.querySelector<HTMLTextAreaElement>(".textora-code-textarea");
        if (ta) {
          cursor = ta.selectionStart;
          scrollTop = ta.scrollTop;
        }
      } else {
        // Milkdown：通过 ProseMirror view 获取
        const view = s.editorView;
        if (view?.state) {
          cursor = view.state.selection.from;
          const dom = view.dom as HTMLElement;
          scrollTop = dom.parentElement?.scrollTop ?? dom.scrollTop;
        }
      }
      set({
        tabs: get().tabs.map((t) =>
          t.id === tab.id ? { ...t, cursor, scrollTop } : t
        ),
      });
    },

    pendingJumpLine: null,
    requestJumpLine: (line) => set({ pendingJumpLine: line }),
    clearJumpLine: () => set({ pendingJumpLine: null }),

    // ===== 内容编辑 =====
    setContent: (content: string) => {
      const active = getActiveTab(get());
      if (!active) return;
      set((s) => ({
        tabs: s.tabs.map((t) =>
          t.id === active.id
            ? { ...t, content, dirty: true, revision: (t.revision ?? 0) + 1 }
            : t
        ),
        content,
        dirty: true,
      }));
    },

    markClean: () => {
      const active = getActiveTab(get());
      if (!active) return;
      set((s) => ({
        tabs: s.tabs.map((t) => (t.id === active.id ? { ...t, dirty: false } : t)),
        dirty: false,
      }));
    },
  };
}
