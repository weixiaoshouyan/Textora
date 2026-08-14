/**
 * 文件切片：标签页生命周期（新建 / 打开 / 关闭 / 切换 / 重排 / 批量关闭）。
 */
import type { AppState } from "../../types";
import { invoke, message, openDialog } from "../../../ipc";
import { genId, getActiveTab, normalizePath } from "../../helpers";
import { openedFilesWithCooling } from "../sharedState";
import { tt } from "../tt";
import type { SliceDeps } from "./types";

export function createTabsSlice({ set, get, syncFromActive, clearAutoSave }: SliceDeps): Partial<AppState> {
  return {
    // ===== 文件 =====
    newFile: () => {
      clearAutoSave();
      const id = genId();
      const tab: AppState["tabs"][number] = {
        id,
        path: null,
        name: tt("common.untitled"),
        kind: "markdown",
        language: "markdown",
        content: "",
        encoding: "utf-8",
        lineEnding: "lf",
        dirty: false,
        revision: 0,
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
      // Check if file is already open in a tab（大小写/分隔符不敏感，与 openPathAtLine 保持一致）
      const existing = get().tabs.find((t) => t.path && normalizePath(t.path) === normalizePath(path));
      if (existing) {
        set({ activeTabId: existing.id });
        syncFromActive();
        // 记录文件打开时间，用于冷却期判断
        openedFilesWithCooling.set(normalizePath(path), Date.now());
        return;
      }
      try {
        const res = await invoke("open_file", { path });
        // 大文件警告：>5MB 的文本文件提示用户
        if (res.size && res.size > 5 * 1024 * 1024 && res.kind !== "image" && res.kind !== "binary") {
          void message(
            tt("dialog.largeFileMsg").replace("{size}", `${(res.size / 1024 / 1024).toFixed(1)} MB`),
            { title: tt("dialog.largeFileTitle"), kind: "warning" }
          );
        }
        const id = genId();
        const tab: AppState["tabs"][number] = {
          id,
          path: res.path,
          name: res.name,
          kind: res.kind,
          language: res.language,
          content: res.text ?? "",
          encoding: res.encoding ?? "utf-8",
          lineEnding: res.line_ending === "crlf" ? "crlf" : "lf",
          dirty: false,
          revision: 0,
          imageData: res.data_base64 ? `data:${res.mime};base64,${res.data_base64}` : undefined,
          imageMime: res.mime,
          size: res.size,
          hexPreview: res.hex_preview,
        };
        // 使用函数式更新确保 tabs 数组基于最新状态
        set((s) => ({
          tabs: [...s.tabs, tab],
          activeTabId: id,
        }));
        // 同步镜像字段，确保依赖这些字段的组件正确更新
        syncFromActive();
        // 记录文件打开时间，用于冷却期判断
        openedFilesWithCooling.set(normalizePath(path), Date.now());
      } catch (err) {
        await message(String(err), { title: tt("dialog.openFailed"), kind: "error" });
      }
    },

    openPathAtLine: async (path: string, line: number) => {
      // 若已打开则直接激活并跳转
      const existing = get().tabs.find((t) => t.path && normalizePath(t.path) === normalizePath(path));
      if (existing) {
        // 合并激活标签和镜像字段的更新
        set({
          activeTabId: existing.id,
          currentPath: existing.path,
          currentName: existing.name,
          content: existing.content,
          dirty: existing.dirty,
          editing: true,
        });
        // 记录文件打开时间，用于冷却期判断
        openedFilesWithCooling.set(normalizePath(path), Date.now());
        get().requestJumpLine(line);
        return;
      }
      const ok = await get().checkBeforeOpen(path);
      if (!ok) return;
      try {
        const res = await invoke("open_file", { path });
        const id = genId();
        const tab: AppState["tabs"][number] = {
          id,
          path: res.path,
          name: res.name,
          kind: res.kind,
          language: res.language,
          content: res.text ?? "",
          encoding: res.encoding ?? "utf-8",
          lineEnding: res.line_ending === "crlf" ? "crlf" : "lf",
          dirty: false,
          revision: 0,
          imageData: res.data_base64 ? `data:${res.mime};base64,${res.data_base64}` : undefined,
          imageMime: res.mime,
          size: res.size,
          hexPreview: res.hex_preview,
        };
        // 使用函数式更新确保 tabs 数组基于最新状态
        set((s) => ({
          tabs: [...s.tabs, tab],
          activeTabId: id,
        }));
        // 同步镜像字段，确保依赖这些字段的组件正确更新
        syncFromActive();
        // 记录文件打开时间，用于冷却期判断
        openedFilesWithCooling.set(normalizePath(path), Date.now());
        get().requestJumpLine(line);
      } catch (err) {
        await message(String(err), { title: tt("dialog.openFailed"), kind: "error" });
      }
    },

    // ===== 标签操作 =====
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
              void get().saveTab(id)
                .then(() => get()._removeTab(id))
                .catch(() => undefined);
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
      // 切换前保存当前标签的光标和滚动位置
      const oldActive = getActiveTab(get());
      // 批量更新：先保存光标，再切换 activeTabId，最后同步镜像字段，一次性 set 避免三次重渲染
      const tabs = (() => {
        if (!oldActive) return get().tabs;
        let cursor: number | null = null;
        let scrollTop: number | undefined;
        const s = get();
        if (s.isCodeEditorActive()) {
          const ta = document.querySelector<HTMLTextAreaElement>(".textora-code-textarea");
          if (ta) {
            cursor = ta.selectionStart;
            scrollTop = ta.scrollTop;
          }
        } else {
          const view = s.editorView;
          if (view?.state) {
            cursor = view.state.selection.from;
            const dom = view.dom as HTMLElement;
            scrollTop = dom.parentElement?.scrollTop ?? dom.scrollTop;
          }
        }
        return s.tabs.map((t) =>
          t.id === oldActive.id ? { ...t, cursor, scrollTop } : t
        );
      })();
      set({ tabs, activeTabId: id });
      // syncFromActive 内部会再 set 一次镜像字段，但此时 activeTabId 已正确
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
      // 保留 id 标签，其余 dirty 的标签走确认流程
      const others = get().tabs.filter((t) => t.id !== id && t.dirty);
      if (others.length === 0) {
        const keep = get().tabs.find((t) => t.id === id);
        set({ tabs: keep ? [keep] : [], activeTabId: id });
        syncFromActive();
        return;
      }
      // 链式确认：依次弹出
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
              void get().saveTab(tab.id)
                .then(() => confirmOne(idx + 1))
                .catch(() => undefined);
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
      // 防御性重置：确认链可能因保存失败/异常中断而残留 closing，导致后续
      // 取消关闭不再触发 close-cancel（主进程 60s 兜底会强杀窗口）。
      get().setCloseFlow("idle");
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
      // 标记关闭确认链进行中：onSave/onDiscard 清 pendingConfirm 时
      // useWindowClose 的 unsubCancel 不应误发 close-cancel 并取消订阅，
      // 否则保存完成后 ready-to-close 永不发出，窗口第一次关不掉。
      get().setCloseFlow("closing");
      const confirmOne = (idx: number) => {
        if (idx >= dirtyTabs.length) {
          set({ tabs: [], activeTabId: null });
          get().setCloseFlow("idle");
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
              void get().saveTab(tab.id)
                .then(() => confirmOne(idx + 1))
                .catch(() => {
                  // 保存失败：复位关闭流程（不推进确认链）。
                  // unsubCancel 订阅会因 closeFlow closing→idle 发出 close-cancel，
                  // 主进程据此重置关闭流程、清掉 60s 兜底定时器，窗口保持打开
                  // 让用户处理错误——否则卡在 "closing" 会被主进程 60s 强杀丢数据。
                  get().setCloseFlow("idle");
                });
            },
            onDiscard: () => {
              get().clearPendingConfirm();
              confirmOne(idx + 1);
            },
            onCancel: () => {
              get().clearPendingConfirm();
              get().setCloseFlow("idle");
            },
          },
        });
      };
      confirmOne(0);
    },
  };
}
