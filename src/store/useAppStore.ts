import { create } from "zustand";
import { invoke, listen, message } from "../ipc";
import type {
  AppState, FsChangeEvent, Settings, Tab,
} from "./types";
import {
  SETTINGS_KEY, WORKSPACE_KEY, SESSION_KEY,
  DEFAULT_SETTINGS, safeReadLocal, safeWriteLocal,
  detectInitialTheme, parentDirOf, normalizePath, genId, getActiveTab,
} from "./helpers";
import { SESSION_RESTORE } from "../shared/constants";
import { aiSlice } from "./slices/aiSlice";
import { fileSlice } from "./slices/fileSlice";
import { uiSlice } from "./slices/uiSlice";
import { workspaceSlice } from "./slices/workspaceSlice";
import { createWatcherManager } from "./slices/watcher";
import { openedFilesWithCooling, pendingPromptTabs } from "./slices/sharedState";
import { tt } from "./slices/tt";

// Re-export 类型和辅助函数，保持外部导入路径不变
export type {
  ThemeMode, FileKind, Tab, CodeEditorApi, PendingConfirm,
  DirEntry, FsChangeEvent, Settings, AppState, ChatSession,
} from "./types";
export { getActiveTab };

/** Validate persisted session entries before asking the main process to open them. */
export function isValidSessionPath(value: unknown, workspaceRoot: string | null): value is string {
  if (typeof value !== "string" || value.trim() === "" || value.includes("app.asar")) return false;
  if (!workspaceRoot) return true;
  const root = normalizePath(workspaceRoot).replace(/\/+$/, "").toLowerCase();
  const candidate = normalizePath(value).toLowerCase();
  return candidate === root || candidate.startsWith(`${root}/`);
}

type UnlistenFn = () => void;

export const useAppStore = create<AppState>()((set, get) => {
  /** 把活动标签的内容同步到顶层镜像字段 */
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

  /** 持久化当前会话（仅保存有 path 的标签 + 活动 path） */
  function persistSession() {
    const state = get();
    const tabs = state.tabs
      .filter((t) => t.path)
      .map((t) => ({ path: t.path as string }));
    const activeTab = state.tabs.find((t) => t.id === state.activeTabId);
    const activePath = activeTab?.path ?? null;
    safeWriteLocal(SESSION_KEY, { tabs, activePath });
  }

  /** 页面卸载（reload/关闭）前，把未保存的修改写入会话缓存，防止数据丢失。
   *  仅持久化文本型内容，并受大小限制（超大文件不写入，避免 localStorage 溢出）。
   *  窗口正常关闭走 close-request 流程：dirty 标签先被保存或关闭，此处自然无事可写。 */
  function persistDirtySession() {
    const state = get();
    const dirtyTabs = state.tabs
      .filter(
        (t): t is Tab & { path: string; content: string } =>
          !!t.path &&
          !!t.dirty &&
          typeof t.content === "string" &&
          t.content.length <= SESSION_RESTORE.MAX_FILE_SIZE,
      )
      .map((t) => ({
        path: t.path,
        content: t.content,
        encoding: t.encoding,
        lineEnding: t.lineEnding,
      }));
    if (dirtyTabs.length === 0) return;
    const session = safeReadLocal<
      { tabs: Array<{ path: string }>; activePath: string | null } | null
    >(SESSION_KEY, null);
    safeWriteLocal(SESSION_KEY, {
      tabs: session?.tabs ?? [],
      activePath: session?.activePath ?? null,
      dirtyTabs,
    });
  }

  // 防止 StrictMode 双调用导致并发恢复
  let restoring = false;

  /** 启动时恢复上次会话：重新打开有 path 的标签。静默失败（文件可能已删除/移动）。
   *  安全限制：最多恢复 MAX_RESTORE_TABS 个标签，跳过 >RESTORE_MAX_SIZE 的文件，
   *  避免恢复大文件或过多标签导致启动卡死。 */
  async function restoreSession() {
    if (restoring) return;
    restoring = true;
    try {
      const data = safeReadLocal<
        | {
            tabs: Array<{ path: string }>;
            activePath: string | null;
            dirtyTabs?: Array<{
              path: string;
              content: string;
              encoding?: string;
              lineEnding?: "lf" | "crlf";
            }>;
          }
        | null
      >(SESSION_KEY, null);
      if (!data || !Array.isArray(data.tabs) || data.tabs.length === 0) return;

      const workspaceRoot = get().workspaceRoot;
      const sessionTabs = data.tabs.filter(
        (entry): entry is { path: string } =>
          !!entry && typeof entry === "object" && isValidSessionPath((entry as { path?: unknown }).path, workspaceRoot),
      );
      if (sessionTabs.length === 0) return;

      // 上次卸载（reload/崩溃）前未保存的修改：恢复时覆盖磁盘内容，避免数据丢失
      const dirtyMap = new Map<
        string,
        { content: string; encoding?: string; lineEnding?: "lf" | "crlf" }
      >();
      if (Array.isArray(data.dirtyTabs)) {
        for (const dt of data.dirtyTabs) {
          if (dt && typeof dt.path === "string" && typeof dt.content === "string") {
            dirtyMap.set(normalizePath(dt.path), dt);
          }
        }
      }

      let restoredCount = 0;
      for (const { path } of sessionTabs) {
        // 限制恢复数量，避免一次打开过多标签导致卡顿
        if (restoredCount >= SESSION_RESTORE.MAX_TABS) break;

        // 跳过打包应用内部路径（app.asar），这些文件不应作为用户文件恢复
        if (path.includes("app.asar")) continue;

        // 去重：若该路径已打开（如 StrictMode 双调用），跳过
        const existing = get().tabs.find(
          (t) => t.path && normalizePath(t.path) === normalizePath(path)
        );
        if (existing) continue;
        try {
          const res = await invoke("open_file", { path });
          // 跳过大文件恢复，避免渲染卡死（用户可手动重新打开）
          if (res.size && res.size > SESSION_RESTORE.MAX_FILE_SIZE && res.kind !== "image") {
            continue;
          }
          const id = genId();
          // 若上次卸载前该标签有未保存修改，用缓存内容覆盖磁盘读取结果并保持 dirty
          const dirty = dirtyMap.get(normalizePath(path));
          const tab: Tab = {
            id,
            path: res.path,
            name: res.name,
            kind: res.kind,
            language: res.language,
            content: dirty ? dirty.content : (res.text ?? ""),
            encoding: dirty?.encoding ?? res.encoding ?? "utf-8",
            lineEnding: (dirty?.lineEnding ?? res.line_ending) === "crlf" ? "crlf" : "lf",
            dirty: !!dirty,
            revision: 0,
            imageData: res.data_base64
              ? `data:${res.mime};base64,${res.data_base64}`
              : undefined,
            imageMime: res.mime,
            size: res.size,
            hexPreview: res.hex_preview,
          };
          set((s) => ({ tabs: [...s.tabs, tab] }));
          restoredCount++;
        } catch (err) {
          // 文件可能已删除/移动/权限不足
          console.warn(`[Session] Failed to reload tab: ${path} —`, err);
        }
      }

      // 恢复完成后，用实际成功打开的标签回写 session，清除无效路径
      // 这样下次启动不会再尝试打开已删除/无效的文件
      persistSession();

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
      // 兜底：若活动标签未恢复成功，则激活第一个标签
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

  // 文件监听事件批量重载管理器（工作区边界校验由 loadDir 兜底）
  const watchers = createWatcherManager((dir) => get().loadDir(dir));

  return {
    // ===== 核心状态 =====
    tabs: [],
    activeTabId: null,

    currentPath: null,
    currentName: tt("common.untitled"),
    content: "",
    dirty: false,
    editing: false,
    theme: detectInitialTheme(),
    workspaceRoot: safeReadLocal<string | null>(WORKSPACE_KEY, null, (v) => v === null || typeof v === "string"),
    entriesByDir: {},
    expanded: {},
    selectedPath: null,
    watchId: null,
    autoSaveTimer: null,
    settings: { ...DEFAULT_SETTINGS, ...safeReadLocal<Partial<Settings>>(SETTINGS_KEY, {}, (v) => v !== null && typeof v === "object" && !Array.isArray(v)) },
    externalChanges: {},

    // ===== 领域切片（文件/工作区/AI/UI） =====
    ...fileSlice(set, get, syncFromActive),
    ...workspaceSlice(set, get, watchers),
    ...aiSlice(set, get),
    ...uiSlice(set, get),

    // ===== 初始化 =====
    init: async () => {
      // 1. 恢复上次会话的标签页（在恢复工作区之前，避免 watcher 事件干扰）
      await restoreSession();

      const ws = get().workspaceRoot;
      // 2. 恢复工作区改为非阻塞：watch_dir 和 loadDir 在大目录上可能很慢，
      //    不阻塞 UI 渲染。失败时清空 workspaceRoot，下次不再尝试。
      if (ws) {
        void get()
          .openWorkspace(ws)
          .catch(() => {
            // openWorkspace 内部意外异常：清理到一致状态（停 watcher、复位主进程 root），
            // 避免 workspaceRoot 为 null 但 watcher/主进程 root 残留
            get().resetWorkspaceState();
          });
      }
      const unlisten: UnlistenFn[] = [];

      // 3. 文件监听事件：总是注册，在回调里动态获取 watchId 过滤
      //    （openWorkspace 是非阻塞的，watchId 此时可能还未设置）
      {
        const fn = await listen<FsChangeEvent>(`watch-event`, async (e) => {
          const raw = e.payload;
          // 工作区已关闭：忽略所有残留 watcher 事件，避免更新 externalChanges
          // 或触发 loadDir 弹出"读取目录失败"对话框
          if (!get().workspaceRoot) return;
          // 过滤掉非当前 watcher 的事件（旧 watcher 残留事件）
          if (raw.id && get().watchId && raw.id !== get().watchId) return;
          const ev: FsChangeEvent = {
            kind: raw.eventType || raw.kind || "change",
            path: raw.path,
            source: raw.source || "external",
          };
          if (ev.source === "self") return;
          set((s) => ({ externalChanges: { ...s.externalChanges, [ev.path]: ev } }));
          const tab = get().tabs.find(
            (t) => t.path && normalizePath(t.path) === normalizePath(ev.path)
          );
          if (tab) {
            // 同一文件短时间多次变动只弹一次对话框，避免事件排队弹一堆窗口
            const tabKey = normalizePath(ev.path);
            if (pendingPromptTabs.has(tabKey)) {
              // 已有对话框在等待，跳过本次（externalChanges 已标记最新状态）
            } else {
              // 检查文件打开冷却期：如果文件刚被打开，跳过弹窗
              // 顺带清理过期的冷却记录，防止 Map 无限增长（长期运行内存泄漏）
              if (openedFilesWithCooling.size > 100) {
                const now = Date.now();
                for (const [k, openedAt] of openedFilesWithCooling) {
                  if (now - openedAt > 2000) openedFilesWithCooling.delete(k);
                }
              }
              const cooled = Date.now() - (openedFilesWithCooling.get(tabKey) || 0) > 2000;
              if (!cooled) {
                // 冷却期内忽略变更事件
                set((s) => {
                  const next = { ...s.externalChanges };
                  delete next[ev.path];
                  return { externalChanges: next };
                });
                return;
              }

              pendingPromptTabs.add(tabKey);
              try {
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
              } finally {
                pendingPromptTabs.delete(tabKey);
              }
            }
          } else if (get().workspaceRoot) {
            // 非 tab 文件变动：只重载该文件所在的父目录（而非整个 workspaceRoot），
            // 并做防抖 + 高频目录过滤，避免大目录事件洪流卡死界面。
            if (watchers.isHighFreqPath(ev.path)) {
              // node_modules/.git 等目录的变动不触发文件树重载
            } else {
              const parent = parentDirOf(ev.path);
              watchers.scheduleBatchReload(parent);
            }
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
        /* 非 desktop 环境或插件未注册，忽略 */
      }

      // 5. 会话持久化：tabs / activeTabId 变化时写 localStorage
      const unsubSession = useAppStore.subscribe((s, prev) => {
        if (s.tabs !== prev.tabs || s.activeTabId !== prev.activeTabId) {
          persistSession();
        }
      });

      // 6. 页面卸载（reload/崩溃恢复路径）前缓存未保存修改，防止 reload 丢失数据
      window.addEventListener("beforeunload", persistDirtySession);
      unlisten.push(() =>
        window.removeEventListener("beforeunload", persistDirtySession),
      );

      return () => {
        unsubSession();
        unlisten.forEach((u) => u());
      };
    },
  } as AppState;
});

// Theme init delegated to useThemeStore.
