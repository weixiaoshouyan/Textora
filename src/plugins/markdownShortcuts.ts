/**
 * Markdown 编辑快捷键（对标 Typora）：
 *  - Ctrl/Cmd+1~6：切换标题级别
 *  - Ctrl/Cmd+Shift+Q：切换引用块（已在引用内则退出）
 *  - Ctrl/Cmd+Shift+C：切换代码块
 *
 * 通过 ProseMirror keymap 注册在编辑器内部（而非 window 级监听），
 * 只在 Milkdown 编辑器聚焦时生效，不与其他全局快捷键冲突；
 * 也避免了 useShortcuts 的 allowInInput 过滤把这类键放行给编辑器后
 * 再在 window 冒泡阶段二次处理的问题。
 */
import type { Command } from "@milkdown/prose/state";
import type { Schema } from "@milkdown/prose/model";
import { setBlockType, wrapIn, lift } from "@milkdown/prose/commands";
import { keymap } from "@milkdown/prose/keymap";
import { $prose } from "@milkdown/utils";
import { schemaCtx } from "@milkdown/core";

/** 只读模式（阅读模式）下不执行命令 */
function editableOnly(cmd: Command): Command {
  return (state, dispatch, view) => {
    if (view && !view.editable) return false;
    return cmd(state, dispatch, view);
  };
}

/** 光标位于代码块内时不执行块级命令（避免破坏代码编辑体验） */
function notInCodeBlock(cmd: Command): Command {
  return (state, dispatch) => {
    const parent = state.selection.$from.parent;
    if (parent.type.name === "code_block" || parent.type.name === "code") return false;
    return cmd(state, dispatch);
  };
}

/** 引用切换：已在引用块内则提升出去（Typora 行为），否则包裹 */
function toggleBlockquote(schema: Schema): Command {
  return (state, dispatch) => {
    const { $from } = state.selection;
    for (let d = $from.depth; d > 0; d--) {
      if ($from.node(d).type === schema.nodes.blockquote) {
        return lift(state, dispatch);
      }
    }
    return wrapIn(schema.nodes.blockquote)(state, dispatch);
  };
}

export const markdownShortcuts = $prose((ctx) => {
  const schema = ctx.get(schemaCtx);
  const heading = (level: number): Command =>
    editableOnly(notInCodeBlock(setBlockType(schema.nodes.heading, { level })));
  return keymap({
    "Mod-1": heading(1),
    "Mod-2": heading(2),
    "Mod-3": heading(3),
    "Mod-4": heading(4),
    "Mod-5": heading(5),
    "Mod-6": heading(6),
    "Mod-Shift-q": editableOnly(notInCodeBlock(toggleBlockquote(schema))),
    "Mod-Shift-c": editableOnly(notInCodeBlock(setBlockType(schema.nodes.code_block))),
  });
});
