/**
 * Store slice：工作区 / 文件树
 *
 * 从 useAppStore 拆分而来，保持对外 API 完全不变。
 * 文件监听重载的防抖调度由 watcher 管理器（WatcherManager）统一负责。
 */
import type { StoreApi } from "zustand";
import type { AppState, DirEntry } from "../types";
import { invoke, message } from "../../ipc";
import { normalizePath, safeWriteLocal } from "../helpers";
import { WORKSPACE_KEY } from "../helpers";
import { tt } from "./tt";
import type { WatcherManager } from "./watcher";

type SetFn = StoreApi<AppState>["setState"];
type GetFn = StoreApi<AppState>["getState"];

export function workspaceSlice(
  set: SetFn,
  get: GetFn,
  watchers: WatcherManager,
): Partial<AppState> {
  // openWorkspace 序列化：避免并发调用导致 workspaceRoot/watchId 指向不一致
  let openWorkspaceSeq = 0;
  // 进行中的 openWorkspace promise：新调用直接 await 它排队，避免忙等轮询
  let openWorkspaceInFlight: Promise<void> | null = null;
  // 工作区"代数"：closeWorkspace/resetWorkspaceState 递增，
  // openWorkspace 在每个 await 之后检查，发现代数变化即放弃，
  // 防止「关闭工作区」与「in-flight 打开工作区」竞态导致工作区复活/状态错乱。
  let workspaceEpoch = 0;

  return {
    // ===== 工作区 =====
    openWorkspace: async (dir: string) => {
      // 序列化：复用前一次 in-flight 的 promise 排队，避免并发 set 导致指向不一致
      const prev = openWorkspaceInFlight;
      if (prev) {
        try { await prev; } catch { /* 前一次失败不影响本次 */ }
        // 等待期间用户可能已打开同一目录（又选了别的目录），直接取消本次
        const current = get().workspaceRoot;
        if (current && current === dir) return;
      }
      const mySeq = ++openWorkspaceSeq;
      const myEpoch = workspaceEpoch;
      // 当前调用是否已过期（期间发生了新的 open/close）——过期时放弃并清理，避免状态错乱
      const isStale = () => mySeq !== openWorkspaceSeq || myEpoch !== workspaceEpoch;
      const run = (async () => {
        const { watchId } = get();
        // 切换工作区前先清除残留的批量重载队列，避免旧路径的 loadDir 在新 workspaceRoot 下失败弹窗
        watchers.clearPendingReloads();
        if (watchId) {
          try {
            await invoke("stop_watch", { id: watchId });
          } catch {
            /* ignore */
          }
        }
        if (isStale()) {
          get().resetWorkspaceState();
          return;
        }
        // set_workspace_root 失败时主进程会恢复 previousRoot，必须中止后续操作，
        // 否则 watch_dir/list_dir 会因 workspaceRoot 不一致而连锁失败
        try {
          await invoke("set_workspace_root", { path: dir });
        } catch (e) {
          await message(String(e), { title: tt("dialog.watchFailed"), kind: "error" });
          // 旧 watcher 已停止、主进程 root 已回滚：清理渲染层状态，回到"无工作区"的一致状态
          get().resetWorkspaceState();
          return;
        }
        // 在 await 之后检查序列号：如果期间有新的 openWorkspace/closeWorkspace 调用，放弃本次操作
        if (isStale()) {
          // 主进程 root 可能已被本次调用设置：主动复位，避免与渲染层状态不一致
          get().resetWorkspaceState();
          return;
        }
        const id = `ws-${Date.now()}`;
        try {
          await invoke("watch_dir", { id, path: dir });
        } catch (e) {
          await message(String(e), { title: tt("dialog.watchFailed"), kind: "error" });
          // watch_dir 失败（路径不可监听等）：主进程 root 已切换但无 watcher，
          // 清理状态避免"文件树存在但无实时监听"的不一致
          get().resetWorkspaceState();
          return;
        }
        if (isStale()) {
          // 新 watcher（id）刚注册成功但本次 open 已过期：
          // resetWorkspaceState 只停 get().watchId（旧的/为 null），必须显式停掉 id，
          // 否则主进程泄漏一个永远在跑的 fs.watch 句柄
          void invoke("stop_watch", { id }).catch(() => {});
          get().resetWorkspaceState();
          return;
        }
        set({
          workspaceRoot: dir,
          watchId: id,
          entriesByDir: {},
          expanded: { [normalizePath(dir)]: true },
          externalChanges: {},
        });
        // 清除 await 期间由旧 watcher 残留事件触发的 pending reload，
        // 避免旧路径的 loadDir 在新 workspaceRoot 下失败弹窗
        watchers.clearPendingReloads();
        safeWriteLocal(WORKSPACE_KEY, dir);
        await get().loadDir(dir);
      })();
      openWorkspaceInFlight = run;
      try {
        await run;
      } finally {
        if (openWorkspaceInFlight === run) openWorkspaceInFlight = null;
      }
    },

    closeWorkspace: () => {
      const { watchId, workspaceRoot, tabs } = get();
      // 关闭工作区前先清除批量重载队列，避免 300ms 后定时器触发 loadDir 弹出"读取目录失败"
      watchers.clearPendingReloads();

      /** 真正关闭工作区：停止监听、重置主进程根目录、清空渲染层状态 */
      const resetWorkspace = () => {
        // 确认对话框打开期间用户可能已打开新工作区：
        // 只清理仍指向旧工作区的状态；新工作区的 watcher/root/文件树保持不动
        const current = get();
        if (current.workspaceRoot === workspaceRoot) {
          // 递增代数：使所有 in-flight 的 openWorkspace 失效，防止其"复活"工作区
          workspaceEpoch++;
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
        } else {
          // 已切换到新工作区：仅停掉旧 watcher（新 watcher 由 openWorkspace 管理）
          if (watchId) {
            void invoke("stop_watch", { id: watchId }).catch(() => {});
          }
        }
      };

      /** 关闭所有属于该工作区的标签页（基于最新状态重新计算，兼容确认期间的变化） */
      const closeTabsInWorkspace = () => {
        if (!workspaceRoot) return;
        const normWs = normalizePath(workspaceRoot).toLowerCase().replace(/\/+$/, "");
        const tabsToClose = get().tabs.filter((t) => {
          if (!t.path) return false;
          const normPath = normalizePath(t.path).toLowerCase();
          return normPath === normWs || normPath.startsWith(normWs + "/");
        });
        tabsToClose.forEach((t) => get()._removeTab(t.id));
      };

      // 基于进入时的快照检查是否存在未保存修改（确认期间新产生的 dirty 由保存回调兜底）
      if (workspaceRoot) {
        const normWs = normalizePath(workspaceRoot).toLowerCase().replace(/\/+$/, "");
        const dirtyTabs = tabs.filter((t) => {
          if (!t.path) return false;
          const normPath = normalizePath(t.path).toLowerCase();
          return (normPath === normWs || normPath.startsWith(normWs + "/")) && t.dirty;
        });

        if (dirtyTabs.length > 0) {
          // 弹出确认对话框；用户取消时不做任何清理，保持工作区原状
          set({
            pendingConfirm: {
              title: tt("unsaved.title"),
              message: tt("unsaved.workspaceCloseMsg").replace("{count}", String(dirtyTabs.length)),
              onSave: () => {
                // 保存所有未保存的文件
                Promise.all(dirtyTabs.map((t) => get().saveTab(t.id)))
                  .then(() => {
                    // 关闭所有标签页
                    get().clearPendingConfirm();
                    closeTabsInWorkspace();
                    resetWorkspace();
                  })
                  .catch(() => {
                    get().clearPendingConfirm();
                  });
              },
              onDiscard: () => {
                // 直接关闭所有标签页
                get().clearPendingConfirm();
                closeTabsInWorkspace();
                resetWorkspace();
              },
              onCancel: () => {
                // 取消关闭工作区
                get().clearPendingConfirm();
              },
            },
          });
          return;
        }
      }

      // 没有未保存的修改，直接关闭所有标签页并重置工作区
      closeTabsInWorkspace();
      resetWorkspace();
    },

    resetWorkspaceState: () => {
      // 递增代数：使所有 in-flight 的 openWorkspace 失效，防止其"复活"工作区
      workspaceEpoch++;
      const { watchId } = get();
      if (watchId) {
        void invoke("stop_watch", { id: watchId }).catch(() => {});
      }
      void invoke("set_workspace_root", { path: null }).catch(() => {});
      watchers.clearPendingReloads();
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
      // 工作区已关闭：直接返回，避免主进程抛 WORKSPACE_NOT_SET 错误并弹出"读取目录失败"
      const ws = get().workspaceRoot;
      if (!ws) return;
      // 校验路径是否在当前工作区内：避免工作区切换后旧路径的 loadDir 失败弹窗
      const normPath = normalizePath(path).toLowerCase();
      const normWs = normalizePath(ws).toLowerCase().replace(/\/+$/, "");
      if (normPath !== normWs && !normPath.startsWith(normWs + "/")) return;
      const key = normalizePath(path);
      try {
        const entries = await invoke<DirEntry[]>("list_dir", { path });
        set((s) => ({ entriesByDir: { ...s.entriesByDir, [key]: entries } }));
      } catch (e) {
        // 工作区可能在 await 期间被关闭或切换，再次校验避免误报
        const curWs = get().workspaceRoot;
        if (!curWs) return;
        const curNormWs = normalizePath(curWs).toLowerCase().replace(/\/+$/, "");
        const curNormPath = normalizePath(path).toLowerCase();
        if (curNormPath !== curNormWs && !curNormPath.startsWith(curNormWs + "/")) return;
        await message(String(e), { title: tt("dialog.readDirFailed"), kind: "error" });
      }
    },

    selectPath: (path: string) => set({ selectedPath: path }),
  };
}
