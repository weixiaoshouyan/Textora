/**
 * 文件切片：文件系统操作（新建 / 重命名 / 删除 / 打开前确认）与编码设置。
 */
import type { AppState } from "../../types";
import { invoke, message } from "../../../ipc";
import { basenameOf, getActiveTab, normalizePath, parentDirOf } from "../../helpers";
import { tt } from "../tt";
import type { SliceDeps } from "./types";

export function createFsSlice({ set, get, syncFromActive }: SliceDeps): Partial<AppState> {
  return {
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
        // 同步打开中的标签：目录重命名时，其下所有已打开子文件的 path 都要迁移，
        // 否则标签仍持旧路径，Ctrl+S 会把内容写回旧路径（在磁盘上重建幽灵文件）
        const normFrom = normalizePath(from);
        const normFromLower = normFrom.toLowerCase();
        const prefixLower = normFromLower + "/";
        const affected = get().tabs.filter((t) => {
          if (!t.path) return false;
          const p = normalizePath(t.path).toLowerCase();
          return p === normFromLower || p.startsWith(prefixLower);
        });
        if (affected.length > 0) {
          set((s) => ({
            tabs: s.tabs.map((t) => {
              if (!t.path) return t;
              const p = normalizePath(t.path);
              const pl = p.toLowerCase();
              let nextPath: string | null = null;
              if (pl === normFromLower) {
                nextPath = toPath;
              } else if (pl.startsWith(prefixLower)) {
                // 子路径部分保留原大小写（Windows 大小写不敏感但不能强转改写）
                nextPath = `${toPath}${p.slice(normFrom.length)}`;
              }
              return nextPath ? { ...t, path: nextPath, name: basenameOf(nextPath) } : t;
            }),
          }));
          if (affected.some((t) => t.id === get().activeTabId)) syncFromActive();
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
      // 删除前检查是否有对应 dirty 标签（含被删目录下的子文件标签）：
      // 未保存修改会随文件删除而丢失，需明确警告
      const normPath = normalizePath(path).toLowerCase();
      const prefix = normPath + "/";
      const affectedTabs = get().tabs.filter((t) => {
        if (!t.path) return false;
        const p = normalizePath(t.path).toLowerCase();
        return p === normPath || p.startsWith(prefix);
      });
      const hasDirty = affectedTabs.some((t) => t.dirty);
      const confirmMsg = hasDirty
        ? tt("dialog.deleteConfirmDirty").replace("{name}", basenameOf(path))
        : tt("dialog.deleteConfirm").replace("{name}", basenameOf(path));
      const yes = await message(confirmMsg, {
        title: tt("dialog.deleteTitle"),
        kind: "warning",
      });
      if (!yes) return;
      try {
        await invoke("remove_path", { path });
        // 关闭该文件/该目录下所有已打开的标签，避免残留标签持失效路径写回幽灵文件
        affectedTabs.forEach((t) => get()._removeTab(t.id));
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
