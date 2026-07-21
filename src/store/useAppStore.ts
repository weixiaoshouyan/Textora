import { create } from "zustand";
import { invoke, listen, openDialog, saveDialog, message } from "../ipc";
import { useLocale, tFor } from "../i18n";
import { loadProviderConfigs, saveProviderConfigs, loadAllApiKeys, getActiveProviderId, setActiveProviderId, getActiveProvider, getTemplate, type ProviderConfig } from "../ai/config";
import type {
  ThemeMode, FileKind, Tab, CodeEditorApi, PendingConfirm,
  RecentFile, DirEntry, FsChangeEvent, Settings, AppState,
} from "./types";
import {
  THEME_KEY, RECENT_KEY, SETTINGS_KEY, WORKSPACE_KEY, SESSION_KEY,
  DEFAULT_SETTINGS, safeReadLocal, safeWriteLocal,
  detectInitialTheme, applyThemeToDom,
  basenameOf, parentDirOf, normalizePath, genId, getActiveTab,
} from "./helpers";

// Re-export 类型和辅助函数，保持外部导入路径不变
export type { ThemeMode, FileKind, Tab, CodeEditorApi, PendingConfirm, RecentFile, DirEntry, FsChangeEvent, Settings, AppState };
export { getActiveTab };

type UnlistenFn = () => void;

function tt(key: string): string {
  return tFor(useLocale.getState().locale)(key);
}


export interface ChatSession {
  id: string;
  title: string;
  messages: import("../ai/aiService").ChatMessage[];
  projectDir: string;
  createdAt: number;
  updatedAt: number;
}

export const useAppStore = create<AppState>((set, get) => {
  /** 把活动标签的内容同步到顶层镜像字段�?*/
  function syncFromActive() {
    const tab = getActiveTab(get());
    if (tab) {
      set({
        currentPath: tab.path,
        currentName: tab.name,
        content: tab.content,
        dirty: tab.dirty,
        editing: true,
      });
    } else {
      set({
        currentPath: null,
        currentName: tt("common.untitled"),
        content: "",
        dirty: false,
        editing: false,
      });
    }
  }

  function clearAutoSave() {
    const t = get().autoSaveTimer;
    if (t) window.clearTimeout(t);
    set({ autoSaveTimer: null });
  }

  function scheduleAutoSave() {
    clearAutoSave();
    const { settings, autoSaveTimer } = get();
    const active = getActiveTab(get());
    if (settings.autoSaveSeconds > 0 && active?.path) {
      const id = window.setTimeout(() => {
        void get().saveFile();
      }, settings.autoSaveSeconds * 1000);
      set({ autoSaveTimer: id });
      void autoSaveTimer;
    }
  }

  /** 持久化当前会话（仅保存有 path 的标�?+ 活动 path）�?*/
  function persistSession() {
    const state = get();
    const tabs = state.tabs
      .filter((t) => t.path)
      .map((t) => ({ path: t.path as string }));
    const activeTab = state.tabs.find((t) => t.id === state.activeTabId);
    const activePath = activeTab?.path ?? null;
    safeWriteLocal(SESSION_KEY, { tabs, activePath });
  }

  // 防止 StrictMode 双调用导致并发恢复
  let restoring = false;

  /** 启动时恢复上次会话：重新打开�?path 的标签。静默失败（文件可能已删�?移动）�?*/
  async function restoreSession() {
    if (restoring) return;
    restoring = true;
    try {
      const data = safeReadLocal<
        { tabs: Array<{ path: string }>; activePath: string | null } | null
      >(SESSION_KEY, null);
      if (!data || !Array.isArray(data.tabs) || data.tabs.length === 0) return;

      for (const { path } of data.tabs) {
        // 去重：若该路径已打开（如 StrictMode 双调用），跳�?
        const existing = get().tabs.find(
          (t) => t.path && normalizePath(t.path) === normalizePath(path)
        );
        if (existing) continue;
        try {
          const res = await invoke("open_file", { path });
          const id = genId();
          const tab: Tab = {
            id,
            path: res.path,
            name: res.name,
            kind: res.kind,
            language: res.language,
            content: res.text ?? "",
            encoding: res.encoding ?? "utf-8",
            lineEnding: res.line_ending === "crlf" ? "crlf" : "lf",
            dirty: false,
            imageData: res.data_base64
              ? `data:${res.mime};base64,${res.data_base64}`
              : undefined,
            imageMime: res.mime,
            size: res.size,
            hexPreview: res.hex_preview,
          };
          set((s) => ({ tabs: [...s.tabs, tab] }));
        } catch (err) {
          // 文件可能已删�?移动/权限不足，记录日�?
          console.warn(`[Session] Failed to reload tab: ${path} —`, err);
          try {
            window.textora.emit("log", { level: "warn", message: `Failed to reload tab: ${path}` });
          } catch { /* ignore */ }
        }
      }

      // 恢复活动标签
      const state = get();
      if (data.activePath) {
        const tab = state.tabs.find(
          (t) => t.path && normalizePath(t.path) === normalizePath(data.activePath!)
        );
        if (tab) {
          set({ activeTabId: tab.id });
        }
      }
      // 兜底：若活动标签未恢复成功，则激活第一个标�?
      if (!get().activeTabId && get().tabs.length > 0) {
        const first = get().tabs[0];
        set({ activeTabId: first.id });
      }
      if (get().activeTabId) {
        syncFromActive();
      }
    } finally {
      restoring = false;
    }
  }

  return {
    tabs: [],
    activeTabId: null,

    currentPath: null,
    currentName: tt("common.untitled"),
    content: "",
    dirty: false,
    editing: false,
    theme: detectInitialTheme(),
    recentFiles: safeReadLocal<RecentFile[]>(RECENT_KEY, []),
    workspaceRoot: safeReadLocal<string | null>(WORKSPACE_KEY, null),
    entriesByDir: {},
    expanded: {},
    selectedPath: null,
    watchId: null,
    autoSaveTimer: null,
    settings: { ...DEFAULT_SETTINGS, ...safeReadLocal<Partial<Settings>>(SETTINGS_KEY, {}) },
    externalChanges: {},
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
    pendingConfirm: null,
    clearPendingConfirm: () => set({ pendingConfirm: null }),
    settingsPanelOpen: false,
    splitViewOpen: false,
    setSettingsPanelOpen: (open) => set({ settingsPanelOpen: open }),
    editorView: null,
    setEditorView: (v) => set({ editorView: v }),

    aiProviders: loadProviderConfigs(),
    aiActiveProviderId: getActiveProviderId(),
    aiSessions: [] as ChatSession[],
    aiActiveSessionId: null as string | null,
    aiAssistantOpen: false,
    setAiAssistantOpen: (open) => set({ aiAssistantOpen: open }),
    codeEditorApi: null,
    setCodeEditorApi: (api) => set({ codeEditorApi: api }),

    isCodeEditorActive: () => {
      const s = get();
      const tab = getActiveTab(s);
      // 源码模式下的 markdown，或 code 类型标签 �?CodeEditor
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

    // ===== 文件 =====
    newFile: () => {
      clearAutoSave();
      const id = genId();
      const tab: Tab = {
        id,
        path: null,
        name: tt("common.untitled"),
        kind: "markdown",
        language: "markdown",
        content: "",
        encoding: "utf-8",
        lineEnding: "lf",
        dirty: false,
      };
      set((s) => ({ tabs: [...s.tabs, tab], activeTabId: id }));
      syncFromActive();
    },

    openFile: async () => {
      const selected = await openDialog({
        multiple: false,
        directory: false,
        title: tt("dialog.openFile"),
      });
      if (typeof selected === "string") {
        await get().openPath(selected);
      }
    },

    openPath: async (path: string) => {
      const ok = await get().checkBeforeOpen(path);
      if (!ok) return;
      try {
        const res = await invoke("open_file", { path });
        // 大文件警告：>5MB 的文本文件提示用�?
        if (res.size && res.size > 5 * 1024 * 1024 && res.kind !== "image" && res.kind !== "binary") {
          void message(
            tt("dialog.largeFileMsg").replace("{size}", `${(res.size / 1024 / 1024).toFixed(1)} MB`),
            { title: tt("dialog.largeFileTitle"), kind: "warning" }
          );
        }
        const id = genId();
        const tab: Tab = {
          id,
          path: res.path,
          name: res.name,
          kind: res.kind,
          language: res.language,
          content: res.text ?? "",
          encoding: res.encoding ?? "utf-8",
          lineEnding: res.line_ending === "crlf" ? "crlf" : "lf",
          dirty: false,
          imageData: res.data_base64 ? `data:${res.mime};base64,${res.data_base64}` : undefined,
          imageMime: res.mime,
          size: res.size,
          hexPreview: res.hex_preview,
        };
        set((s) => ({ tabs: [...s.tabs, tab], activeTabId: id }));
        syncFromActive();
        get().pushRecent(path);
      } catch (err) {
        await message(String(err), { title: tt("dialog.openFailed"), kind: "error" });
      }
    },

    openPathAtLine: async (path: string, line: number) => {
      // 若已打开则直接激活并跳转
      const existing = get().tabs.find((t) => t.path && normalizePath(t.path) === normalizePath(path));
      if (existing) {
        set({ activeTabId: existing.id });
        syncFromActive();
        get().requestJumpLine(line);
        return;
      }
      const ok = await get().checkBeforeOpen(path);
      if (!ok) return;
      try {
        const res = await invoke("open_file", { path });
        const id = genId();
        const tab: Tab = {
          id,
          path: res.path,
          name: res.name,
          kind: res.kind,
          language: res.language,
          content: res.text ?? "",
          encoding: res.encoding ?? "utf-8",
          lineEnding: res.line_ending === "crlf" ? "crlf" : "lf",
          dirty: false,
          imageData: res.data_base64 ? `data:${res.mime};base64,${res.data_base64}` : undefined,
          imageMime: res.mime,
          size: res.size,
          hexPreview: res.hex_preview,
        };
        set((s) => ({ tabs: [...s.tabs, tab], activeTabId: id }));
        syncFromActive();
        get().requestJumpLine(line);
        get().pushRecent(path);
      } catch (err) {
        await message(String(err), { title: tt("dialog.openFailed"), kind: "error" });
      }
    },

    saveFile: async () => {
      const active = getActiveTab(get());
      if (!active) return;
      await get().saveTab(active.id);
    },

    saveTab: async (id: string) => {
      const tab = get().tabs.find((t) => t.id === id);
      if (!tab) return;
      if (!tab.path) {
        await get().saveTabAs(id);
        return;
      }
      clearAutoSave();
      try {
        await invoke("write_file", {
          path: tab.path,
          text: tab.content,
          encoding: tab.encoding,
          line_ending: tab.lineEnding,
        });
        set((s) => ({
          tabs: s.tabs.map((t) => (t.id === id ? { ...t, dirty: false } : t)),
        }));
        if (get().activeTabId === id) {
          set({ dirty: false });
          syncFromActive();
        }
        get().pushRecent(tab.path);
      } catch (err) {
        await message(String(err), { title: tt("dialog.saveFailed"), kind: "error" });
      }
    },

    saveFileAs: async () => {
      const active = getActiveTab(get());
      if (!active) return;
      await get().saveTabAs(active.id);
    },

    saveTabAs: async (id: string) => {
      const tab = get().tabs.find((t) => t.id === id);
      if (!tab) return;
      clearAutoSave();
      const defaultName =
        tab.name && (tab.name.endsWith(".md") || tab.kind !== "markdown")
          ? tab.name
          : `${tab.name}.md`;
      const target = await saveDialog({
        title: tt("dialog.saveAs"),
        defaultPath: defaultName,
        filters: [{ name: "All Files", extensions: ["*"] }],
      });
      if (!target) return;
      try {
        await invoke("write_file", {
          path: target,
          text: tab.content,
          encoding: tab.encoding,
          line_ending: tab.lineEnding,
        });
        const name = basenameOf(target);
        set((s) => ({
          tabs: s.tabs.map((t) =>
            t.id === id ? { ...t, path: target, name, dirty: false } : t
          ),
        }));
        if (get().activeTabId === id) {
          set({ currentPath: target, currentName: name, dirty: false });
          syncFromActive();
        }
        get().pushRecent(target);
      } catch (err) {
        await message(String(err), { title: tt("dialog.saveFailed"), kind: "error" });
      }
    },

    setContent: (content: string) => {
      const active = getActiveTab(get());
      if (!active) return;
      set((s) => ({
        tabs: s.tabs.map((t) =>
          t.id === active.id ? { ...t, content, dirty: true } : t
        ),
        content,
        dirty: true,
      }));
      scheduleAutoSave();
    },

    markClean: () => {
      const active = getActiveTab(get());
      if (!active) return;
      set((s) => ({
        tabs: s.tabs.map((t) => (t.id === active.id ? { ...t, dirty: false } : t)),
        dirty: false,
      }));
    },

    closeTab: (id: string) => {
      const tab = get().tabs.find((t) => t.id === id);
      if (!tab) return;
      if (tab.dirty) {
        set({
          pendingConfirm: {
            title: tt("unsaved.title"),
            message: tt("unsaved.message").replace("{name}", tab.name),
            onSave: () => {
              get().clearPendingConfirm();
              void get().saveTab(id).then(() => get()._removeTab(id));
            },
            onDiscard: () => {
              get().clearPendingConfirm();
              get()._removeTab(id);
            },
            onCancel: () => get().clearPendingConfirm(),
          },
        });
        return;
      }
      get()._removeTab(id);
    },

    _removeTab: (id: string) => {
      const oldTabs = get().tabs;
      const tabs = oldTabs.filter((t) => t.id !== id);
      let activeTabId = get().activeTabId;
      if (activeTabId === id) {
        const idx = oldTabs.findIndex((t) => t.id === id);
        const neighbor = tabs[idx] ?? tabs[idx - 1] ?? null;
        activeTabId = neighbor ? neighbor.id : null;
      }
      set({ tabs, activeTabId });
      if (activeTabId) {
        syncFromActive();
      } else {
        clearAutoSave();
        set({
          currentPath: null,
          currentName: tt("common.untitled"),
          content: "",
          dirty: false,
          editing: false,
        });
      }
    },

    setActiveTab: (id: string) => {
      // 切换前保存当前标签的光标和滚动位�?      get().saveCursorState();
      set({ activeTabId: id });
      syncFromActive();
    },

    reorderTabs: (fromId: string, toId: string) => {
      if (fromId === toId) return;
      const tabs = [...get().tabs];
      const fromIdx = tabs.findIndex((t) => t.id === fromId);
      const toIdx = tabs.findIndex((t) => t.id === toId);
      if (fromIdx === -1 || toIdx === -1) return;
      const [moved] = tabs.splice(fromIdx, 1);
      tabs.splice(toIdx, 0, moved);
      set({ tabs });
    },

    closeOtherTabs: (id: string) => {
      // 保留 id 标签，其�?dirty 的标签走确认流程
      const others = get().tabs.filter((t) => t.id !== id && t.dirty);
      if (others.length === 0) {
        const keep = get().tabs.find((t) => t.id === id);
        set({ tabs: keep ? [keep] : [], activeTabId: id });
        syncFromActive();
        return;
      }
      // 链式确认：依次弹�?
      const confirmOne = (idx: number) => {
        if (idx >= others.length) {
          // 全部处理完，移除其他
          const keep = get().tabs.find((t) => t.id === id);
          set({ tabs: keep ? [keep] : [], activeTabId: id });
          syncFromActive();
          return;
        }
        const tab = others[idx];
        set({
          pendingConfirm: {
            title: tt("unsaved.title"),
            message: tt("unsaved.message").replace("{name}", tab.name),
            onSave: () => {
              get().clearPendingConfirm();
              void get().saveTab(tab.id).then(() => confirmOne(idx + 1));
            },
            onDiscard: () => {
              get().clearPendingConfirm();
              confirmOne(idx + 1);
            },
            onCancel: () => get().clearPendingConfirm(),
          },
        });
      };
      confirmOne(0);
    },

    closeAllTabs: () => {
      const dirtyTabs = get().tabs.filter((t) => t.dirty);
      if (dirtyTabs.length === 0) {
        set({ tabs: [], activeTabId: null });
        clearAutoSave();
        set({
          currentPath: null,
          currentName: tt("common.untitled"),
          content: "",
          dirty: false,
          editing: false,
        });
        return;
      }
      const confirmOne = (idx: number) => {
        if (idx >= dirtyTabs.length) {
          set({ tabs: [], activeTabId: null });
          clearAutoSave();
          set({
            currentPath: null,
            currentName: tt("common.untitled"),
            content: "",
            dirty: false,
            editing: false,
          });
          return;
        }
        const tab = dirtyTabs[idx];
        set({
          pendingConfirm: {
            title: tt("unsaved.title"),
            message: tt("unsaved.message").replace("{name}", tab.name),
            onSave: () => {
              get().clearPendingConfirm();
              void get().saveTab(tab.id).then(() => confirmOne(idx + 1));
            },
            onDiscard: () => {
              get().clearPendingConfirm();
              confirmOne(idx + 1);
            },
            onCancel: () => get().clearPendingConfirm(),
          },
        });
      };
      confirmOne(0);
    },

    // ===== 主题 =====
    setTheme: (theme: ThemeMode) => {
      applyThemeToDom(theme);
      safeWriteLocal(THEME_KEY, theme);
      set({ theme });
    },

    toggleTheme: () => {
      const order: ThemeMode[] = ["light", "dark", "sepia", "nord"];
      const cur = get().theme;
      const idx = order.indexOf(cur);
      const next = order[(idx + 1) % order.length];
      get().setTheme(next);
    },

    pushRecent: (path: string) => {
      const list = [
        { path, name: basenameOf(path), openedAt: Date.now() },
        ...get().recentFiles.filter((r) => r.path !== path),
      ].slice(0, 10);
      safeWriteLocal(RECENT_KEY, list);
      set({ recentFiles: list });
    },

    // ===== 工作�?=====
    openWorkspace: async (dir: string) => {
      const { watchId } = get();
      if (watchId) {
        try {
          await invoke("stop_watch", { id: watchId });
        } catch {
          /* ignore */
        }
      }
      await invoke("set_workspace_root", { path: dir }).catch(() => {});
      const id = `ws-${Date.now()}`;
      try {
        await invoke("watch_dir", { id, path: dir });
      } catch (e) {
        await message(String(e), { title: tt("dialog.watchFailed"), kind: "error" });
      }
      set({
        workspaceRoot: dir,
        watchId: id,
        entriesByDir: {},
        expanded: { [normalizePath(dir)]: true },
        externalChanges: {},
      });
      safeWriteLocal(WORKSPACE_KEY, dir);
      await get().loadDir(dir);
    },

    closeWorkspace: () => {
      const { watchId } = get();
      if (watchId) {
        void invoke("stop_watch", { id: watchId }).catch(() => {});
      }
      void invoke("set_workspace_root", { path: null }).catch(() => {});
      set({
        workspaceRoot: null,
        watchId: null,
        entriesByDir: {},
        expanded: {},
        externalChanges: {},
      });
      safeWriteLocal(WORKSPACE_KEY, null);
    },

    toggleExpanded: async (path: string) => {
      const key = normalizePath(path);
      const expanded = { ...get().expanded, [key]: !get().expanded[key] };
      set({ expanded });
      if (expanded[key]) {
        await get().loadDir(path);
      }
    },

    loadDir: async (path: string) => {
      const key = normalizePath(path);
      try {
        const entries = await invoke<DirEntry[]>("list_dir", { path });
        set((s) => ({ entriesByDir: { ...s.entriesByDir, [key]: entries } }));
      } catch (e) {
        await message(String(e), { title: tt("dialog.readDirFailed"), kind: "error" });
      }
    },

    selectPath: (path: string) => set({ selectedPath: path }),

    // ===== 文件操作 =====
    createNewFile: async (dir: string, name: string) => {
      if (!name) return null;
      const fullPath = `${dir.replace(/[\\/]+$/, "")}/${name}`;
      try {
        await invoke("create_file", { path: fullPath });
        await get().loadDir(dir);
        await get().openPath(fullPath);
        return fullPath;
      } catch (e) {
        await message(String(e), { title: tt("dialog.createFailed"), kind: "error" });
        return null;
      }
    },

    createNewFolder: async (dir: string, name: string) => {
      if (!name) return;
      const fullPath = `${dir.replace(/[\\/]+$/, "")}/${name}`;
      try {
        await invoke("create_dir", { path: fullPath });
        await get().loadDir(dir);
      } catch (e) {
        await message(String(e), { title: tt("dialog.createFailed"), kind: "error" });
      }
    },

    renameItem: async (from: string, to: string) => {
      const toPath = `${parentDirOf(from).replace(/[\\/]+$/, "")}/${to}`;
      try {
        await invoke("rename_path", { from, to: toPath });
        // 同步打开中的标签
        const tab = get().tabs.find((t) => t.path && normalizePath(t.path) === normalizePath(from));
        if (tab) {
          set((s) => ({
            tabs: s.tabs.map((t) =>
              t.id === tab.id ? { ...t, path: toPath, name: basenameOf(toPath) } : t
            ),
          }));
          if (get().activeTabId === tab.id) syncFromActive();
        }
        const ws = get().workspaceRoot;
        if (ws) await get().loadDir(ws);
      } catch (e) {
        await message(String(e), { title: tt("dialog.renameFailed"), kind: "error" });
      }
    },

    // 切换文件前检查：三态确认（保存 / 不保�?/ 取消�?
    checkBeforeOpen: (path: string) =>
      new Promise<boolean>((resolve) => {
        const active = getActiveTab(get());
        const target = normalizePath(path);
        if (active && active.path && normalizePath(active.path) === target) {
          return;
        }
        if (!active || !active.dirty) {
          resolve(true);
          return;
        }
        set({
          pendingConfirm: {
            title: tt("unsaved.title"),
            message: tt("unsaved.openMessage").replace("{name}", active.name).replace("{name2}", basenameOf(path)),
            onSave: () => {
              get().clearPendingConfirm();
              void get().saveTab(active.id).then(() => resolve(true));
            },
            onDiscard: () => {
              get().clearPendingConfirm();
              resolve(true);
            },
            onCancel: () => {
              get().clearPendingConfirm();
              resolve(false);
            },
          },
        });
      }),

    removeItem: async (path: string) => {
      const yes = await message(tt("dialog.deleteConfirm").replace("{name}", basenameOf(path)), {
        title: tt("dialog.deleteTitle"),
        kind: "warning",
      });
      if (!yes) return;
      try {
        await invoke("remove_path", { path });
        // 关闭对应标签
        const tab = get().tabs.find((t) => t.path && normalizePath(t.path) === normalizePath(path));
        if (tab) get()._removeTab(tab.id);
        const ws = get().workspaceRoot;
        if (ws) await get().loadDir(ws);
      } catch (e) {
        await message(String(e), { title: tt("dialog.deleteFailed"), kind: "error" });
      }
    },

    // ===== 编码 / 行尾 =====
    setActiveEncoding: async (enc: string, reload = false) => {
      const active = getActiveTab(get());
      if (!active) return;
      if (reload && active.path) {
        try {
          const res = await invoke("open_file", {
            path: active.path,
            force_encoding: enc,
          });
          set((s) => ({
            tabs: s.tabs.map((t) =>
              t.id === active.id
                ? { ...t, content: res.text ?? "", encoding: enc, dirty: false }
                : t
            ),
          }));
          if (get().activeTabId === active.id) syncFromActive();
          return;
        } catch {
          /* 回退到仅修改保存编码 */
        }
      }
      set((s) => ({
        tabs: s.tabs.map((t) => (t.id === active.id ? { ...t, encoding: enc } : t)),
      }));
      if (get().activeTabId === active.id) syncFromActive();
    },

    setActiveLineEnding: (le) => {
      const active = getActiveTab(get());
      if (!active) return;
      set((s) => ({
        tabs: s.tabs.map((t) => (t.id === active.id ? { ...t, lineEnding: le } : t)),
      }));
      if (get().activeTabId === active.id) syncFromActive();
    },


    // ===== AI 供应商管理 =====
    loadAiProviders: async () => {
      const configs = await loadAllApiKeys(loadProviderConfigs());
      set({ aiProviders: configs });
    },
    addAiProvider: (templateId, label, apiKey, model) => {
      const template = getTemplate(templateId);
      const id = templateId + "_" + Date.now().toString(36);
      const config: ProviderConfig = {
        id,
        templateId,
        label: label || (template?.label ?? "Custom"),
        endpoint: template?.endpoint ?? "",
        apiKey,
        model: (model || template?.defaultModel) ?? "",
        enabled: true,
        createdAt: Date.now(),
      };
      const next = [...get().aiProviders, config];
      set({ aiProviders: next });
      void saveProviderConfigs(next);
      // Auto-select if first provider
      if (next.length === 1) {
        setActiveProviderId(id);
        set({ aiActiveProviderId: id });
      }
    },
    removeAiProvider: (id) => {
      const next = get().aiProviders.filter((p) => p.id !== id);
      const currentActive = get().aiActiveProviderId;
      set({ aiProviders: next });
      if (currentActive === id) {
        const fallback = next[0]?.id ?? null;
        setActiveProviderId(fallback);
        set({ aiActiveProviderId: fallback });
      }
      void saveProviderConfigs(next);
    },
    updateAiProvider: (id, patch) => {
      const next = get().aiProviders.map((p) => p.id === id ? { ...p, ...patch } : p);
      set({ aiProviders: next });
      void saveProviderConfigs(next);
    },
    setAiActiveProvider: (id: string | null) => {
      setActiveProviderId(id);
      set({ aiActiveProviderId: id });
    },
    getActiveAiProvider: () => {
      const { aiProviders, aiActiveProviderId } = get();
      return aiProviders.find((p) => p.id === aiActiveProviderId) || aiProviders.find((p) => p.apiKey) || null;
    },

    // ===== AI 聊天会话管理 =====
    createAiSession: (projectDir) => {
      const id = "session_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      const session: ChatSession = {
        id,
        title: "新对话",
        messages: [],
        projectDir: projectDir ?? "",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      set((s) => ({ aiSessions: [session, ...s.aiSessions], aiActiveSessionId: id }));
      return id;
    },
    deleteAiSession: (id) => {
      set((s) => ({
        aiSessions: s.aiSessions.filter((ses) => ses.id !== id),
        aiActiveSessionId: s.aiActiveSessionId === id ? (s.aiSessions[0]?.id ?? null) : s.aiActiveSessionId,
      }));
    },
    setAiActiveSession: (id) => {
      set({ aiActiveSessionId: id });
    },

    // ===== 设置 =====
    updateSettings: (patch) => {
      const next = { ...get().settings, ...patch };
      safeWriteLocal(SETTINGS_KEY, next);
      set({ settings: next });
    },

    toggleFocus: () => get().updateSettings({ focusMode: !get().settings.focusMode }),
    toggleTypewriter: () => get().updateSettings({ typewriterMode: !get().settings.typewriterMode }),
    toggleSource: () => get().updateSettings({ sourceMode: !get().settings.sourceMode }),
    toggleReading: () => get().updateSettings({ readingMode: !get().settings.readingMode }),
    toggleSpellcheck: () => get().updateSettings({ spellcheck: !get().settings.spellcheck }),
    toggleSidebar: () => get().updateSettings({ sidebarVisible: !get().settings.sidebarVisible }),
    toggleOutline: () => get().updateSettings({ outlineVisible: !get().settings.outlineVisible }),
    toggleSplitView: () => set({ splitViewOpen: !get().splitViewOpen }),

    // ===== 初始�?=====
    init: async () => {
      // 0. 异步加载 API Key（从 Electron safeStorage�?
try {
        // API keys now managed via aiProviders
      } catch { /* ignore */ }

      // 1. 恢复上次会话的标签页（在恢复工作区之前，避免 watcher 事件干扰�?
      await restoreSession();

      const ws = get().workspaceRoot;
      if (ws) {
        try {
          await get().openWorkspace(ws);
        } catch {
          set({ workspaceRoot: null });
        }
      }
      const { watchId } = get();
      const unlisten: UnlistenFn[] = [];

      // 3. 文件监听事件
      if (watchId) {
        const fn = await listen<FsChangeEvent>(`watch-event`, async (e) => {
          const raw = e.payload;
          const ev: FsChangeEvent = { kind: raw.eventType || raw.kind || "change", path: raw.path };
          set((s) => ({ externalChanges: { ...s.externalChanges, [ev.path]: ev } }));
          const tab = get().tabs.find(
            (t) => t.path && normalizePath(t.path) === normalizePath(ev.path)
          );
          if (tab) {
            const choice = await message(
              tt("dialog.fileChangedMsg").replace("{name}", tab.name),
              { title: tt("dialog.fileChangedTitle"), kind: "info" }
            );
            if (choice) {
              try {
                const res = await invoke("open_file", { path: tab.path! });
                set((s) => ({
                  tabs: s.tabs.map((t) =>
                    t.id === tab.id
                      ? {
                          ...t,
                          content: res.text ?? t.content,
                          encoding: res.encoding ?? t.encoding,
                          lineEnding: res.line_ending === "crlf" ? "crlf" : "lf",
                          dirty: false,
                        }
                      : t
                  ),
                }));
                if (get().activeTabId === tab.id) syncFromActive();
              } catch {
                /* ignore */
              }
            } else {
              set((s) => {
                const next = { ...s.externalChanges };
                delete next[ev.path];
                return { externalChanges: next };
              });
            }
          } else if (get().workspaceRoot) {
            const ws = get().workspaceRoot;
            if (ws) await get().loadDir(ws);
          }
        });
        unlisten.push(fn);
      }

      // 4. 单实例事件：第二个实例启动时若带了文件路径，则在此打开
try {
        const fn = await listen<string>("open-file", (e) => {
          if (e.payload && typeof e.payload === "string") {
            void get().openPath(e.payload);
          }
        });
        unlisten.push(fn);
      } catch {
        /* �?desktop 环境或插件未注册，忽�?*/
      }

      // 5. 会话持久化：tabs / activeTabId 变化时写 localStorage
      const unsubSession = useAppStore.subscribe((s, prev) => {
        if (s.tabs !== prev.tabs || s.activeTabId !== prev.activeTabId) {
          persistSession();
        }
      });

      return () => {
        unsubSession();
        unlisten.forEach((u) => u());
      };
    },
    } as AppState;
});

applyThemeToDom(useAppStore.getState().theme);
