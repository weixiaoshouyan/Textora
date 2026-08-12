/**
 * Store slice：UI 面板状态 / 主题 / 设置切换
 *
 * 从 useAppStore 拆分而来，保持对外 API 完全不变。
 */
import type { StoreApi } from "zustand";
import type { AppState } from "../types";
import { useSettingsStore } from "../useSettingsStore";
import { useThemeStore } from "../useThemeStore";

type SetFn = StoreApi<AppState>["setState"];
type GetFn = StoreApi<AppState>["getState"];

export function uiSlice(set: SetFn, get: GetFn): Partial<AppState> {
  return {
    findReplaceOpen: false,
    setFindReplaceOpen: (open) => set({ findReplaceOpen: open }),
    quickOpenOpen: false,
    setQuickOpenOpen: (open) => set({ quickOpenOpen: open }),
    searchInFilesOpen: false,
    setSearchInFilesOpen: (open) => set({ searchInFilesOpen: open }),
    commandPaletteOpen: false,
    setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),
    diffViewOpen: false,
    setDiffViewOpen: (open) => set({ diffViewOpen: open }),
    graphViewOpen: false,
    setGraphViewOpen: (open) => set({ graphViewOpen: open }),
    pendingConfirm: null,
    clearPendingConfirm: () => set({ pendingConfirm: null }),
    closeFlow: "idle",
    setCloseFlow: (v) => set({ closeFlow: v }),
    settingsPanelOpen: false,
    setSettingsPanelOpen: (open) => set({ settingsPanelOpen: open }),
    splitViewOpen: false,
    toggleSplitView: () => set({ splitViewOpen: !get().splitViewOpen }),

    // 编辑器
    editorView: null,
    setEditorView: (v) => set({ editorView: v }),
    insertMarkdownFn: null,
    setInsertMarkdownFn: (fn) => set({ insertMarkdownFn: fn }),
    insertMarkdownAtCursor: (markdown: string) => {
      const fn = get().insertMarkdownFn;
      if (fn) {
        // Milkdown 路径：仅解析新 markdown 并追加到文档末尾，避免全量 re-parse 卡死
        try {
          fn(markdown);
          return;
        } catch (err) {
          console.warn("[insertMarkdownAtCursor] milkdown insert failed, fallback to setContent:", err);
        }
      }
      // 回退：CodeEditor 或 Milkdown 未就绪
      const content = get().content;
      get().setContent(content + "\n\n" + markdown + "\n");
    },

    // CodeEditor 适配
    codeEditorApi: null,
    setCodeEditorApi: (api) => set({ codeEditorApi: api }),

    // ===== 主题 =====
    setTheme: (theme) => {
      useThemeStore.getState().setTheme(theme);
      set({ theme: useThemeStore.getState().theme });
    },
    toggleTheme: () => {
      useThemeStore.getState().toggleTheme();
      set({ theme: useThemeStore.getState().theme });
    },

    // ===== 设置 =====
    updateSettings: (patch) => {
      useSettingsStore.getState().updateSettings(patch);
      set({ settings: useSettingsStore.getState().settings });
    },
    toggleFocus: () => { useSettingsStore.getState().toggleFocus(); set({ settings: useSettingsStore.getState().settings }); },
    toggleTypewriter: () => { useSettingsStore.getState().toggleTypewriter(); set({ settings: useSettingsStore.getState().settings }); },
    toggleSource: () => { useSettingsStore.getState().toggleSource(); set({ settings: useSettingsStore.getState().settings }); },
    toggleReading: () => { useSettingsStore.getState().toggleReading(); set({ settings: useSettingsStore.getState().settings }); },
    toggleSpellcheck: () => { useSettingsStore.getState().toggleSpellcheck(); set({ settings: useSettingsStore.getState().settings }); },
    toggleSidebar: () => { useSettingsStore.getState().toggleSidebar(); set({ settings: useSettingsStore.getState().settings }); },
    toggleOutline: () => { useSettingsStore.getState().toggleOutline(); set({ settings: useSettingsStore.getState().settings }); },
    toggleVimMode: () => { useSettingsStore.getState().toggleVimMode(); set({ settings: useSettingsStore.getState().settings }); },
  };
}
