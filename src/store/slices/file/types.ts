/**
 * 文件切片子模块共享类型。
 */
import type { StoreApi } from "zustand";
import type { AppState } from "../../types";

export type SetFn = StoreApi<AppState>["setState"];
export type GetFn = StoreApi<AppState>["getState"];

/** 子模块工厂依赖：set/get + 跨模块注入的辅助 */
export interface SliceDeps {
  set: SetFn;
  get: GetFn;
  syncFromActive: () => void;
  /** 重置自动保存定时器（由 index.ts 定义，供保存/标签模块调用） */
  clearAutoSave: () => void;
}
