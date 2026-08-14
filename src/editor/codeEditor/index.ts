/**
 * 源码/代码编辑器模块出口。
 *  - CodeEditor.tsx：主组件（textarea + 高亮层 + 虚拟滚动）
 *  - fold.ts / brackets.ts / snippets.ts / utils.ts：纯函数子模块
 */
export { CodeEditor } from "./CodeEditor";
export { computeFoldRanges, type FoldRange } from "./fold";
export { findMatchingBracket, posToLineCol, type BracketPair } from "./brackets";
export { SNIPPETS } from "./snippets";
export { escapeHtml, getUniqueWords } from "./utils";
