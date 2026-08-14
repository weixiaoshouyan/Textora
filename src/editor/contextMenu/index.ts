/**
 * 编辑器右键菜单模块出口。
 *  - actions.ts：do* 命令实现（Milkdown/源码双模式）
 *  - menu.ts：菜单结构组装
 */
import { useAppStore } from "../../store/useAppStore";

export { buildEditorMenu } from "./menu";
export * from "./actions";
export type { CtxMenuItem } from "../../ui/ContextMenu";

// 兼容旧调用（CodeEditor.tsx 中的 setEditorView(null) 调用）
export function setEditorView(_v: unknown) {
  // no-op：editorView 现在由 MilkdownEditor.tsx 通过 store.setEditorView 管理
}

export function getEditorView(): unknown {
  return useAppStore.getState().editorView;
}
