/**
 * 编辑器右键菜单动作（do* 命令）+ 编辑器操作辅助。
 *
 * 每个动作同时支持 Milkdown（ProseMirror 命令）与源码模式（textarea 操作），
 * 通过 execInEditor 分发。菜单结构见 ./menu.ts。
 */
import { useAppStore } from "../../store/useAppStore";
import { CtxMenuItem } from "../../ui/ContextMenu";
import { showPrompt } from "../../ui/showPrompt";
import { useLocale, tFor } from "../../i18n";
import { invoke, openDialog as open } from "../../ipc";
import type { EditorView } from "@milkdown/prose/view";
import { setBlockType, toggleMark, wrapIn } from "@milkdown/prose/commands";
import { undo, redo } from "@milkdown/prose/history";
import { TextSelection } from "@milkdown/prose/state";

// ---- 模式检测与编辑器获取 ----

function getView(): EditorView | null {
  return (useAppStore.getState().editorView as EditorView | null) ?? null;
}

function getCodeTextarea(): HTMLTextAreaElement | null {
  return document.querySelector<HTMLTextAreaElement>(".textora-code-textarea");
}

/** 统一执行：Milkdown 模式用 ProseMirror 命令，Code 模式用 textarea 操作 */
function execInEditor(
  milkdownFn: (view: EditorView) => void,
  codeFn: (ta: HTMLTextAreaElement) => void
) {
  const view = getView();
  if (view && view.dom.isContentEditable) {
    milkdownFn(view);
    view.focus();
    return;
  }
  const ta = getCodeTextarea();
  if (ta) {
    codeFn(ta);
    ta.focus();
  }
}

// ---- 通用文本操作（Code 模式） ----

function codeInsertText(ta: HTMLTextAreaElement, text: string, selectInserted = false) {
  const start = ta.selectionStart;
  const end = ta.selectionEnd;
  const val = ta.value;
  const newValue = val.substring(0, start) + text + val.substring(end);
  // 通过 onChange 更新
  useAppStore.getState().setContent(newValue);
  requestAnimationFrame(() => {
    if (selectInserted) {
      ta.setSelectionRange(start, start + text.length);
    } else {
      const pos = start + text.length;
      ta.setSelectionRange(pos, pos);
    }
  });
}

function codeInsertLinePrefix(ta: HTMLTextAreaElement, prefix: string) {
  const start = ta.selectionStart;
  const val = ta.value;
  const lineStart = val.lastIndexOf("\n", start - 1) + 1;
  const newValue = val.substring(0, lineStart) + prefix + val.substring(lineStart);
  useAppStore.getState().setContent(newValue);
  requestAnimationFrame(() => {
    const pos = start + prefix.length;
    ta.setSelectionRange(pos, pos);
  });
}

function codeWrapSelection(ta: HTMLTextAreaElement, before: string, after: string) {
  const start = ta.selectionStart;
  const end = ta.selectionEnd;
  const val = ta.value;
  const selected = val.substring(start, end);
  const newValue = val.substring(0, start) + before + selected + after + val.substring(end);
  useAppStore.getState().setContent(newValue);
  requestAnimationFrame(() => {
    if (selected.length > 0) {
      ta.setSelectionRange(start + before.length, start + before.length + selected.length);
    } else {
      const pos = start + before.length;
      ta.setSelectionRange(pos, pos);
    }
  });
}

// ---- Milkdown ProseMirror 命令 ----

function mdToggleMark(markName: string) {
  return (view: EditorView) => {
    const { state, dispatch } = view;
    const markType = state.schema.marks[markName];
    if (markType) toggleMark(markType)(state, dispatch);
  };
}

function mdSetHeading(level: number) {
  return (view: EditorView) => {
    const { state, dispatch } = view;
    const headingType = state.schema.nodes.heading;
    if (headingType) setBlockType(headingType, { level })(state, dispatch);
  };
}

// ---- 基础操作 ----

function doCut() {
  document.execCommand("cut");
}

function doCopy() {
  document.execCommand("copy");
}

function doPaste() {
  document.execCommand("paste");
}

function doPastePlain() {
  execInEditor(
    (view) => {
      navigator.clipboard.readText().then((text) => {
        // 剪贴板读取是异步的，期间视图可能已被销毁
        if (!view.dom || !view.dom.isConnected || !view.state) return;
        try {
          const tr = view.state.tr.replaceSelectionWith(view.state.schema.text(text));
          view.dispatch(tr);
        } catch {
          /* 视图已销毁，忽略 */
        }
      }).catch(() => {});
    },
    (ta) => {
      navigator.clipboard.readText().then((text) => {
        codeInsertText(ta, text);
      }).catch(() => {});
    }
  );
}

function doSelectAll() {
  execInEditor(
    (view) => {
      const { state } = view;
      const selection = TextSelection.create(state.doc, 0, state.doc.content.size);
      view.dispatch(state.tr.setSelection(selection));
    },
    (ta) => {
      ta.select();
    }
  );
}

function doFind() {
  useAppStore.getState().setFindReplaceOpen(true);
}

function doUndo() {
  execInEditor(
    (view) => {
      undo(view.state, view.dispatch);
    },
    () => {
      document.execCommand("undo");
    }
  );
}

function doRedo() {
  execInEditor(
    (view) => {
      redo(view.state, view.dispatch);
    },
    () => {
      document.execCommand("redo");
    }
  );
}

// ---- 格式操作 ----

function doBold() {
  execInEditor(mdToggleMark("strong"), (ta) => codeWrapSelection(ta, "**", "**"));
}

function doItalic() {
  execInEditor(mdToggleMark("em"), (ta) => codeWrapSelection(ta, "*", "*"));
}

function doUnderline() {
  execInEditor(mdToggleMark("underline"), (ta) => codeWrapSelection(ta, "<u>", "</u>"));
}

function doInlineCode() {
  execInEditor(mdToggleMark("code"), (ta) => codeWrapSelection(ta, "`", "`"));
}

function doStrikethrough() {
  execInEditor(mdToggleMark("strike_through"), (ta) => codeWrapSelection(ta, "~~", "~~"));
}

function doHighlight() {
  execInEditor(mdToggleMark("highlight"), (ta) => codeWrapSelection(ta, "==", "=="));
}

function doClearFormat() {
  execInEditor(
    (view) => {
      const { state, dispatch } = view;
      const { selection, schema, tr } = state;
      // 移除选区内所有 marks
      Object.values(schema.marks).forEach((markType) => {
        if (markType) {
          tr.removeMark(selection.from, selection.to, markType);
        }
      });
      dispatch(tr);
    },
    (ta) => {
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const val = ta.value;
      // 简单移除常见 markdown 标记
      let selected = val.substring(start, end);
      selected = selected.replace(/^(\*\*|`|~~|==|<u>|<\/u>)/g, "").replace(/(\*\*|`|~~|==|<u>|<\/u>)$/g, "");
      const newValue = val.substring(0, start) + selected + val.substring(end);
      useAppStore.getState().setContent(newValue);
    }
  );
}

// ---- 插入操作 ----

async function doInsertImage() {
  const path = await open({
    multiple: false,
    filters: [
      { name: "Images", extensions: ["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp"] },
    ],
  });
  if (path && typeof path === "string") {
    const name = path.split(/[\\/]/).pop() || "image";
    const markdown = `![${name}](${path})`;
    execInEditor(
      (view) => {
        const { state, dispatch } = view;
        const imageType = state.schema.nodes.image;
        if (imageType) {
          const node = imageType.create({ src: path, alt: name });
          const tr = state.tr.replaceSelectionWith(node);
          dispatch(tr);
        } else {
          // fallback：插入 markdown 文本
          const tr = state.tr.replaceSelectionWith(state.schema.text(markdown));
          dispatch(tr);
        }
      },
      (ta) => codeInsertText(ta, `\n${markdown}\n`)
    );
  }
}

async function doInsertLink() {
  const locale = useLocale.getState().locale;
  const t = tFor(locale);
  const url = await showPrompt(t("ctx.insertLink.prompt"), t("ctx.insertLink.defaultUrl"));
  if (!url) return;
  execInEditor(
    (view) => {
      const { state, dispatch } = view;
      const linkMark = state.schema.marks.link;
      if (linkMark) {
        const { selection, tr } = state;
        if (selection.empty) {
          // 无选区：插入文本 + 链接
          const text = state.schema.text(url, [linkMark.create({ href: url })]);
          tr.replaceSelectionWith(text);
        } else {
          // 有选区：给选中文本加链接 mark
          tr.addMark(selection.from, selection.to, linkMark.create({ href: url }));
        }
        dispatch(tr);
      }
    },
    (ta) => {
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const selected = ta.value.substring(start, end) || "link";
      codeInsertText(ta, `[${selected}](${url})`);
    }
  );
}

function doInsertTable() {
  const markdown = "| Header | Header | Header |\n| ------ | ------ | ------ |\n| Cell   | Cell   | Cell   |\n| Cell   | Cell   | Cell   |";
  execInEditor(
    (view) => {
      // 用 Milkdown parser 生成真实表格节点（gfm）。
      // 此前错误地把 markdown 源码塞进 code_block，WYSIWYG 中显示为原始文本。
      const insert = useAppStore.getState().insertMarkdownAtSelectionFn;
      if (insert && insert(markdown)) return;
      view.dispatch(view.state.tr.insertText(markdown));
    },
    (ta) => codeInsertText(ta, `\n${markdown}\n`)
  );
}

function doInsertCodeBlock() {
  execInEditor(
    (view) => {
      const { state, dispatch } = view;
      const codeBlockType = state.schema.nodes.code_block;
      if (codeBlockType) setBlockType(codeBlockType)(state, dispatch);
      view.focus();
    },
    (ta) => codeInsertText(ta, "\n```\n\n```\n")
  );
}

function doInsertMath() {
  // math 为装饰器渲染（见 plugins/math.ts）：整段 "$$tex$$" 文本即触发 KaTeX 渲染，
  // 不能包进 code_block（会把源码显示为文本）。用单行占位保证装饰器命中且
  // markdown 往返一致（含空行的多行 tex 会被段落拆分破坏渲染）。
  const markdown = "$$E = mc^2$$";
  execInEditor(
    (view) => {
      const { state, dispatch } = view;
      const { $from } = state.selection;
      // 光标在空段落中：原地写入（整段文本命中块级公式渲染）
      if ($from.parent.type.name === "paragraph" && $from.parent.textContent.trim() === "") {
        dispatch(state.tr.insertText(markdown));
        return;
      }
      // 否则在当前块之后新建段落写入，避免与其他文字混排导致不渲染
      const blockType = state.schema.nodes.paragraph;
      if (blockType) {
        const pos = $from.end($from.depth);
        const para = blockType.create(null, state.schema.text(markdown));
        dispatch(state.tr.insert(pos, para));
      } else {
        dispatch(state.tr.insertText(markdown));
      }
    },
    (ta) => codeInsertText(ta, `\n$$\n\n$$\n`)
  );
}

function doInsertMermaid() {
  // mermaid 装饰器识别 language === "mermaid" 的 code_block（见 plugins/mermaid.ts）：
  // 直接创建带 language 属性的代码块，而不是把 ```mermaid 围栏文本再包进代码块。
  const code = "graph TD;\n    A-->B;";
  execInEditor(
    (view) => {
      const { state, dispatch } = view;
      const codeBlockType = state.schema.nodes.code_block;
      if (codeBlockType) {
        const node = codeBlockType.create({ language: "mermaid" }, state.schema.text(code));
        dispatch(state.tr.replaceSelectionWith(node));
      } else {
        dispatch(state.tr.insertText(code));
      }
    },
    (ta) => codeInsertText(ta, `\n\`\`\`mermaid\n${code}\n\`\`\`\n`)
  );
}

function doInsertHR() {
  execInEditor(
    (view) => {
      const { state, dispatch } = view;
      const hrType = state.schema.nodes.hr;
      if (hrType) {
        const node = hrType.create();
        const tr = state.tr.replaceSelectionWith(node);
        dispatch(tr);
      }
    },
    (ta) => codeInsertText(ta, "\n---\n")
  );
}

function doInsertTaskList() {
  const markdown = "- [ ] Task 1\n- [ ] Task 2\n- [x] Task 3";
  execInEditor(
    (view) => {
      // 用 Milkdown parser 生成真实任务列表节点（gfm task_list_item），
      // 此前错误地把源码塞进 code_block
      const insert = useAppStore.getState().insertMarkdownAtSelectionFn;
      if (insert && insert(markdown)) return;
      view.dispatch(view.state.tr.insertText(markdown));
    },
    (ta) => codeInsertText(ta, `\n${markdown}\n`)
  );
}

function doInsertBulletList() {
  const markdown = "\n- Item 1\n- Item 2\n- Item 3\n";
  execInEditor(
    (view) => {
      const { state, dispatch } = view;
      const bulletListType = state.schema.nodes.bullet_list;
      if (bulletListType) {
        const listItemType = state.schema.nodes.list_item;
        if (listItemType) {
          const items = ["Item 1", "Item 2", "Item 3"].map((text) =>
            listItemType.create(null, state.schema.text(text))
          );
          const list = bulletListType.create(null, items);
          const tr = state.tr.replaceSelectionWith(list);
          dispatch(tr);
        }
      }
    },
    (ta) => codeInsertText(ta, markdown)
  );
}

function doInsertOrderedList() {
  const markdown = "\n1. Item 1\n2. Item 2\n3. Item 3\n";
  execInEditor(
    (view) => {
      const { state, dispatch } = view;
      const orderedListType = state.schema.nodes.ordered_list;
      if (orderedListType) {
        const listItemType = state.schema.nodes.list_item;
        if (listItemType) {
          const items = ["Item 1", "Item 2", "Item 3"].map((text) =>
            listItemType.create(null, state.schema.text(text))
          );
          const list = orderedListType.create(null, items);
          const tr = state.tr.replaceSelectionWith(list);
          dispatch(tr);
        }
      }
    },
    (ta) => codeInsertText(ta, markdown)
  );
}

function doInsertQuote() {
  execInEditor(
    (view) => {
      const { state, dispatch } = view;
      const blockquoteType = state.schema.nodes.blockquote;
      if (blockquoteType) wrapIn(blockquoteType)(state, dispatch);
    },
    (ta) => codeInsertLinePrefix(ta, "> ")
  );
}

function doInsertSuperscript() {
  execInEditor(
    (view) => {
      // CommonMark 不原生支持，fallback 到文本
      const { state, dispatch } = view;
      const supMark = state.schema.marks.superscript;
      if (supMark) {
        toggleMark(supMark)(state, dispatch);
      }
    },
    (ta) => codeWrapSelection(ta, "^", "^")
  );
}

function doInsertSubscript() {
  execInEditor(
    (view) => {
      const { state, dispatch } = view;
      const subMark = state.schema.marks.subscript;
      if (subMark) {
        toggleMark(subMark)(state, dispatch);
      }
    },
    (ta) => codeWrapSelection(ta, "~", "~")
  );
}

// ---- 复制操作 ----

function getEditorTextContent(): string {
  const s = useAppStore.getState();
  const tab = s.tabs.find((t) => t.id === s.activeTabId);
  if (tab?.content) return tab.content;
  return "";
}

function doCopyAsMarkdown() {
  const text = getEditorTextContent();
  navigator.clipboard.writeText(text).catch(() => {});
}

function doCopyAsPlainText() {
  const text = getEditorTextContent();
  navigator.clipboard.writeText(text).catch(() => {});
}

async function doOpenFileLocation() {
  const s = useAppStore.getState();
  const tab = s.tabs.find((t) => t.id === s.activeTabId);
  if (tab?.path) {
    try {
      await invoke("open_file_location", { path: tab.path });
    } catch {
      // fallback
    }
  }
}

// ---- 导出（供 menu.ts 构建菜单） ----

export {
  execInEditor,
  codeInsertText,
  codeInsertLinePrefix,
  codeWrapSelection,
  mdToggleMark,
  mdSetHeading,
  getEditorTextContent,
  doCut,
  doCopy,
  doPaste,
  doPastePlain,
  doSelectAll,
  doFind,
  doUndo,
  doRedo,
  doBold,
  doItalic,
  doUnderline,
  doInlineCode,
  doStrikethrough,
  doHighlight,
  doClearFormat,
  doInsertImage,
  doInsertLink,
  doInsertTable,
  doInsertCodeBlock,
  doInsertMath,
  doInsertMermaid,
  doInsertHR,
  doInsertTaskList,
  doInsertBulletList,
  doInsertOrderedList,
  doInsertQuote,
  doInsertSuperscript,
  doInsertSubscript,
  doCopyAsMarkdown,
  doCopyAsPlainText,
  doOpenFileLocation,
};
export type { CtxMenuItem };
