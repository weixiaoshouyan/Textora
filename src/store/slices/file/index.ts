/**
 * 文件切片组装：文件 / 标签页操作。
 *
 * 子模块：
 *  - editing.ts：光标/滚动状态、内容编辑
 *  - saving.ts：保存 / 另存为（revision 守卫 + 重入补写）
 *  - tabs.ts：标签生命周期（新建 / 打开 / 关闭 / 批量关闭确认链）
 *  - fs.ts：文件系统操作与编码设置
 */
import type { StoreApi } from "zustand";
import type { AppState } from "../../types";
import { createEditingSlice } from "./editing";
import { createSavingSlice } from "./saving";
import { createTabsSlice } from "./tabs";
import { createFsSlice } from "./fs";
import type { SliceDeps } from "./types";

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

  const deps: SliceDeps = { set, get, syncFromActive, clearAutoSave };

  return {
    ...createEditingSlice(deps),
    ...createSavingSlice(deps),
    ...createTabsSlice(deps),
    ...createFsSlice(deps),
  };
}
