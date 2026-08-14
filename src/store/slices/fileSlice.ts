/**
 * Store slice：文件 / 标签页操作
 *
 * 从 useAppStore 拆分而来，保持对外 API 完全不变。
 * 跨 slice 依赖（syncFromActive 等）通过参数注入，避免循环导入。
 */
import type { StoreApi } from "zustand";
import type { AppState } from "../types";
import { invoke, message, openDialog, saveDialog } from "../../ipc";
import { basenameOf, genId, getActiveTab, normalizePath, parentDirOf } from "../helpers";
import { openedFilesWithCooling, savingTabs } from "./sharedState";
import { tt } from "./tt";

type SetFn = StoreApi<AppState>["setState"];
type GetFn = StoreApi<AppState>["getState"];

export function fileSlice(
  set: SetFn,
  get: GetFn,
  syncFromActive: () => void,
): Partial<AppState> {
  /** 重置自动保存定时器（状态字段兼容 useAutoSave 之外的历史调用方） */
  function clearAutoSave() {
    const t = get().autoSaveTimer;
    if (t) window.clearTimeout(t);
    set({ autoSaveTimer: null });
  }

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

    saveFile: async () => {
      const active = getActiveTab(get());
      if (!active) return;
      await get().saveTab(active.id);
    },

    saveTab: async (id: string) => {
      // 重入复用：自动保存在途时用户 Ctrl+S / 关窗保存应等待本次写盘完成，
      // 而不是静默丢弃（否则 onSave 链会以为已保存，实际写入的是旧快照）。
      // 但等待结束后必须复查：若写盘期间内容又更新（revision 变化），
      // 旧快照写入成功并不代表最新内容已落盘——直接复用该 Promise 会让
      // 关闭标签/关窗路径误判为已保存，把未落盘的最新修改删掉（数据丢失）。
      const inFlight = savingTabs.get(id);
      if (inFlight) {
        try {
          await inFlight;
        } catch {
          // 在途写盘失败：错误已由该次调用弹出提示，本次继续尝试重新保存
        }
        const tabAfter = get().tabs.find((t) => t.id === id);
        if (!tabAfter) return;
        if (tabAfter.dirty) {
          // 内容在写盘期间更新过（或写盘失败仍 dirty）：用最新快照重新走完整保存
          // （此时 savingTabs 已无在途记录，不会再进入本分支）
          return get().saveTab(id);
        }
        return;
      }
      const run = (async () => {
        const tab = get().tabs.find((t) => t.id === id);
        if (!tab) return;
        if (!tab.path) {
          await get().saveTabAs(id);
          return;
        }
        clearAutoSave();
        const snapshot = {
          path: tab.path,
          content: tab.content,
          encoding: tab.encoding,
          lineEnding: tab.lineEnding,
          revision: tab.revision ?? 0,
        };
        try {
          await invoke("write_file", {
            path: snapshot.path,
            text: snapshot.content,
            encoding: snapshot.encoding,
            line_ending: snapshot.lineEnding,
          });
          const current = get().tabs.find((t) => t.id === id);
          if (
            current &&
            current.path === snapshot.path &&
            current.revision === snapshot.revision
          ) {
            set((s) => ({
              tabs: s.tabs.map((t) => (t.id === id ? { ...t, dirty: false } : t)),
            }));
            if (get().activeTabId === id) {
              set({ dirty: false });
              syncFromActive();
            }
          }
        } catch (err) {
          await message(String(err), { title: tt("dialog.saveFailed"), kind: "error" });
          throw err;
        }
      })();
      const tracked = run.finally(() => {
        savingTabs.delete(id);
      });
      savingTabs.set(id, tracked);
      return tracked;
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
        const snapshot = {
          content: tab.content,
          encoding: tab.encoding,
          lineEnding: tab.lineEnding,
          revision: tab.revision ?? 0,
        };
        await invoke("write_file", {
          path: target,
          text: snapshot.content,
          encoding: snapshot.encoding,
          line_ending: snapshot.lineEnding,
        });
        const name = basenameOf(target);
        const current = get().tabs.find((t) => t.id === id);
        if (current && current.revision === snapshot.revision) {
          set((s) => ({
            tabs: s.tabs.map((t) =>
              t.id === id ? { ...t, path: target, name, dirty: false } : t
            ),
          }));
          if (get().activeTabId === id) {
            set({ currentPath: target, currentName: name, dirty: false });
            syncFromActive();
          }
        }
      } catch (err) {
        await message(String(err), { title: tt("dialog.saveFailed"), kind: "error" });
        throw err;
      }
    },

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

    // 切换文件前检查：三态确认（保存 / 不保存 / 取消）
    checkBeforeOpen: (path: string) =>
      new Promise<boolean>((resolve) => {
        const active = getActiveTab(get());
        const target = normalizePath(path);
        if (active && active.path && normalizePath(active.path) === target) {
          resolve(true);
          return;
        }
        if (!active || !active.dirty) {
          resolve(true);
          return;
        }
        // 如果已有确认对话框在进行中，不弹新的，直接允许操作（避免 Promise 永悬）
        if (get().pendingConfirm) {
          resolve(true);
          return;
        }
        set({
          pendingConfirm: {
            title: tt("unsaved.title"),
            message: tt("unsaved.openMessage").replace("{name}", active.name).replace("{name2}", basenameOf(path)),
            onSave: () => {
              get().clearPendingConfirm();
              void get().saveTab(active.id)
                .then(() => resolve(true))
                .catch(() => resolve(false));
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
      // 删除前检查是否有对应 dirty 标签：未保存修改会随文件删除而丢失，需明确警告
      const openTab = get().tabs.find((t) => t.path && normalizePath(t.path) === normalizePath(path));
      const confirmMsg = openTab?.dirty
        ? tt("dialog.deleteConfirmDirty").replace("{name}", basenameOf(path))
        : tt("dialog.deleteConfirm").replace("{name}", basenameOf(path));
      const yes = await message(confirmMsg, {
        title: tt("dialog.deleteTitle"),
        kind: "warning",
      });
      if (!yes) return;
      try {
        await invoke("remove_path", { path });
        if (openTab) get()._removeTab(openTab.id);
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
  };
}
