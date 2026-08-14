/**
 * Milkdown 折叠插件（标题 / 代码块）。
 *
 * 折叠按钮用 ProseMirror Decoration widget 注入（PM 管理、随文档映射），
 * 不再直接 appendChild 到 PM 管理的 <h1>/<pre> 节点内部——
 * 否则 PM 的 DOM observer 把按钮当作「未授权 DOM 变更」反复 dispatch 修复
 * 事务，形成 dispatch → updateStateInner → updatePluginViews → dispatch 的
 * 无限循环（渲染进程卡死，右键菜单操作如"标题 1"触发块类型重建时必现）。
 *
 * 折叠/展开仍操作 DOM：data-folded 属性标记状态（PM 复用节点时保留，
 * 节点重建时状态丢失可接受），隐藏兄弟用 display，代码块用 max-height。
 */
import { Plugin, PluginKey } from "@milkdown/prose/state";
import { Decoration, DecorationSet } from "@milkdown/prose/view";
import { $prose } from "@milkdown/utils";
import type { EditorView } from "@milkdown/prose/view";
import { isLargeDoc } from "./docGuard";

const FOLDED_ATTR = "data-textora-folded";
const FOLD_BTN_CLASS = "textora-fold-btn";

/** 折叠按钮：点击时根据 getPos 找到对应节点 DOM，切换折叠状态 */
function createFoldButton(
  view: EditorView,
  getPos: () => number | undefined,
  isCodeBlock: boolean,
): HTMLSpanElement {
  const btn = document.createElement("span");
  btn.className = FOLD_BTN_CLASS;
  btn.textContent = "▼";
  btn.title = "折叠/展开";
  btn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    const pos = getPos();
    if (pos == null) return;
    const nodeDom = view.nodeDOM(pos);
    if (!(nodeDom instanceof HTMLElement)) return;

    const folded = nodeDom.getAttribute(FOLDED_ATTR) === "true";
    if (folded) {
      // 展开
      nodeDom.removeAttribute(FOLDED_ATTR);
      btn.textContent = "▼";
      if (isCodeBlock) {
        const code = nodeDom.querySelector("code");
        if (code) {
          code.style.maxHeight = "";
          code.style.overflow = "";
        }
      } else {
        // 恢复标题后续兄弟节点显示（直到下一个同级或更高级标题）
        const level = parseInt(nodeDom.tagName[1], 10);
        let sib = nodeDom.nextElementSibling;
        while (sib) {
          const tag = sib.tagName.toLowerCase();
          if (/^h[1-6]$/.test(tag)) {
            if (parseInt(tag[1], 10) <= level) break;
          }
          (sib as HTMLElement).style.display = "";
          sib = sib.nextElementSibling;
        }
      }
    } else {
      // 折叠
      nodeDom.setAttribute(FOLDED_ATTR, "true");
      btn.textContent = "▶";
      if (isCodeBlock) {
        const code = nodeDom.querySelector("code");
        if (code) {
          code.style.maxHeight = "0";
          code.style.overflow = "hidden";
        }
      } else {
        const level = parseInt(nodeDom.tagName[1], 10);
        let sib = nodeDom.nextElementSibling;
        while (sib) {
          const tag = sib.tagName.toLowerCase();
          if (/^h[1-6]$/.test(tag)) {
            if (parseInt(tag[1], 10) <= level) break;
          }
          (sib as HTMLElement).style.display = "none";
          sib = sib.nextElementSibling;
        }
      }
    }
  });
  return btn;
}

const foldKey = new PluginKey<DecorationSet>("textora-code-fold");

export const codeFoldPlugin = $prose(() => {
  return new Plugin<DecorationSet>({
    key: foldKey,
    state: {
      init: () => DecorationSet.empty,
      apply(tr, prev) {
        if (!tr.docChanged) return prev;
        // 大文档降级：跳过全量扫描，装饰位置由 mapping 跟随
        if (isLargeDoc(tr.doc)) {
          return prev.map(tr.mapping, tr.doc);
        }
        const decos: Decoration[] = [];
        tr.doc.descendants((node, pos) => {
          if (node.type.name === "heading" || node.type.name === "code_block") {
            const isCode = node.type.name === "code_block";
            decos.push(
              Decoration.widget(
                pos,
                (view, getPos) => createFoldButton(view, getPos, isCode),
                { side: -1, key: `textora-fold-${node.type.name}-${pos}` },
              ),
            );
          }
        });
        return DecorationSet.create(tr.doc, decos);
      },
    },
    props: {
      decorations(state) {
        return this.getState(state) ?? null;
      },
    },
  });
});

// 兼容旧调用（MilkdownEditor 曾直接调用 attachCodeFolding）
export function attachCodeFolding(): () => void {
  return () => {};
}

// 基础样式：按钮为 inline（widget 渲染在块节点前），不注入 PM 管理的节点内部
export function ensureFoldStyles(): void {
  const styleId = "textora-fold-styles";
  if (document.getElementById(styleId)) return;
  const style = document.createElement("style");
  style.id = styleId;
  style.textContent = `
    .${FOLD_BTN_CLASS} {
      display: inline-block;
      width: 14px;
      height: 14px;
      margin-right: 4px;
      text-align: center;
      line-height: 14px;
      cursor: pointer;
      font-size: 10px;
      color: var(--textora-fg-muted);
      border-radius: 3px;
      user-select: none;
    }
    .${FOLD_BTN_CLASS}:hover {
      background: var(--textora-bg-muted);
      color: var(--textora-fg);
    }
    [${FOLDED_ATTR}="true"]::after {
      content: " ...";
      color: var(--textora-fg-muted);
      font-style: italic;
    }
  `;
  document.head.appendChild(style);
}

ensureFoldStyles();
