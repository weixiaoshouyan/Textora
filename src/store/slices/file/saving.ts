/**
 * 文件切片：保存逻辑（保存 / 另存为）。
 *
 * 关键防护：
 *  - 重入等待：自动保存在途时复用写盘，但完成后复查 revision，
 *    若期间内容又更新则补写最新快照，避免关闭标签丢失未落盘内容。
 *  - revision 守卫：只对「写盘期间未变化」的标签置 clean。
 */
import type { AppState } from "../../types";
import { invoke, message, saveDialog } from "../../../ipc";
import { basenameOf, getActiveTab } from "../../helpers";
import { savingTabs } from "../sharedState";
import { tt } from "../tt";
import type { SliceDeps } from "./types";

export function createSavingSlice({ set, get, syncFromActive, clearAutoSave }: SliceDeps): Partial<AppState> {
  return {
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
  };
}
