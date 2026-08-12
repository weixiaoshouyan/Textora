/**
 * 大文档降级判定（math/mermaid/toc 装饰器共用）。
 *
 * 装饰器插件在每次文档变化时全量扫描文档并重建 DecorationSet：
 * 超大文档（MB 级文本/数千节点）下逐键触发会让输入明显卡顿。
 * 超过阈值后降级为「仅在外部主动 bump（内容替换/主题切换）时重建」——
 * 输入时装饰位置仍由 ProseMirror 自动 mapping 跟随，只是渲染内容延迟到 bump 时刷新。
 *
 * content.size 与 childCount 都是 O(1) 缓存属性，判定本身零成本。
 */
import type { Node as PMNode } from "@milkdown/prose/model";

const LARGE_DOC_TEXT_THRESHOLD = 500_000;
const LARGE_DOC_CHILD_THRESHOLD = 5000;

export function isLargeDoc(doc: PMNode): boolean {
  return doc.content.size > LARGE_DOC_TEXT_THRESHOLD || doc.childCount > LARGE_DOC_CHILD_THRESHOLD;
}
