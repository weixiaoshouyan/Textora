import { useAppStore } from "../store/useAppStore";
import { CtxMenuItem } from "../ui/ContextMenu";
import { showPrompt } from "../ui/showPrompt";
import { useLocale, tFor } from "../i18n";
import { invoke, openDialog as open } from "../ipc";
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
  const markdown = `\n| Header | Header | Header |\n| ------ | ------ | ------ |\n| Cell   | Cell   | Cell   |\n| Cell   | Cell   | Cell   |\n`;
  execInEditor(
    (view) => {
      const schema = view.state.schema;
      const codeBlock = schema.nodes.code_block?.create(null, schema.text(markdown));
      if (codeBlock) {
        view.dispatch(view.state.tr.replaceSelectionWith(codeBlock));
      } else {
        view.dispatch(view.state.tr.insertText(markdown));
      }
    },
    (ta) => codeInsertText(ta, markdown)
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
  const markdown = "\n$$\n\n$$\n";
  execInEditor(
    (view) => {
      const schema = view.state.schema;
      const codeBlock = schema.nodes.code_block?.create(null, schema.text(markdown));
      if (codeBlock) {
        view.dispatch(view.state.tr.replaceSelectionWith(codeBlock));
      } else {
        view.dispatch(view.state.tr.insertText(markdown));
      }
    },
    (ta) => codeInsertText(ta, markdown)
  );
}

function doInsertMermaid() {
  const markdown = "\n```mermaid\ngraph TD;\n    A-->B;\n```\n";
  execInEditor(
    (view) => {
      const schema = view.state.schema;
      const codeBlock = schema.nodes.code_block?.create(null, schema.text(markdown));
      if (codeBlock) {
        view.dispatch(view.state.tr.replaceSelectionWith(codeBlock));
      } else {
        view.dispatch(view.state.tr.insertText(markdown));
      }
    },
    (ta) => codeInsertText(ta, markdown)
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
  const markdown = "\n- [ ] Task 1\n- [ ] Task 2\n- [x] Task 3\n";
  execInEditor(
    (view) => {
      const schema = view.state.schema;
      const codeBlock = schema.nodes.code_block?.create(null, schema.text(markdown));
      if (codeBlock) {
        view.dispatch(view.state.tr.replaceSelectionWith(codeBlock));
      } else {
        view.dispatch(view.state.tr.insertText(markdown));
      }
    },
    (ta) => codeInsertText(ta, markdown)
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
  const view = getView();
  if (view) {
    // Milkdown 模式：用 getMarkdown 获取序列化文本
    // 通过 Editor action 调用，但这里我们只有 view
    // 直接从 store content 获取
    const text = getEditorTextContent();
    navigator.clipboard.writeText(text).catch(() => {});
  } else {
    const text = getEditorTextContent();
    navigator.clipboard.writeText(text).catch(() => {});
  }
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

// ---- 菜单构建 ----

export function buildEditorMenu(): CtxMenuItem[] {
  const s = useAppStore.getState();
  const locale = useLocale.getState().locale;
  const t = tFor(locale);

  return [
    {
      label: t("ctx.cut"),
      shortcut: "Ctrl+X",
      onClick: doCut,
    },
    {
      label: t("ctx.copy"),
      shortcut: "Ctrl+C",
      onClick: doCopy,
    },
    {
      label: t("ctx.paste"),
      shortcut: "Ctrl+V",
      onClick: doPaste,
    },
    {
      label: t("ctx.pastePlain"),
      onClick: doPastePlain,
    },
    {
      label: t("ctx.selectAll"),
      shortcut: "Ctrl+A",
      onClick: doSelectAll,
    },
    { type: "separator" },
    {
      label: t("ctx.insert"),
      submenu: [
        { label: t("ctx.insertImage"), onClick: doInsertImage },
        { label: t("ctx.insertLink"), onClick: doInsertLink },
        { label: t("ctx.insertTable"), onClick: doInsertTable },
        { label: t("ctx.insertCodeBlock"), onClick: doInsertCodeBlock },
        { label: t("ctx.insertMath"), onClick: doInsertMath },
        { label: t("ctx.insertMermaid"), onClick: doInsertMermaid },
        { label: t("ctx.insertHr"), onClick: doInsertHR },
        { label: t("ctx.insertTaskList"), onClick: doInsertTaskList },
        { label: t("ctx.insertBulletList"), onClick: doInsertBulletList },
        { label: t("ctx.insertOrderedList"), onClick: doInsertOrderedList },
        { label: t("ctx.insertQuote"), onClick: doInsertQuote },
      ],
    },
    {
      label: t("ctx.format"),
      submenu: [
        { label: t("ctx.bold"), shortcut: "Ctrl+B", onClick: doBold },
        { label: t("ctx.italic"), shortcut: "Ctrl+I", onClick: doItalic },
        { label: t("ctx.underline"), onClick: doUnderline },
        { label: t("ctx.code"), shortcut: "Ctrl+E", onClick: doInlineCode },
        { label: t("ctx.strikethrough"), onClick: doStrikethrough },
        { label: t("ctx.highlight"), onClick: doHighlight },
        { label: t("ctx.superscript"), onClick: doInsertSuperscript },
        { label: t("ctx.subscript"), onClick: doInsertSubscript },
        { type: "separator" },
        { label: t("ctx.clearFormat"), onClick: doClearFormat },
      ],
    },
    {
      label: t("ctx.heading"),
      submenu: [
        { label: t("ctx.heading1"), onClick: () => execInEditor(mdSetHeading(1), (ta) => codeInsertLinePrefix(ta, "# ")) },
        { label: t("ctx.heading2"), onClick: () => execInEditor(mdSetHeading(2), (ta) => codeInsertLinePrefix(ta, "## ")) },
        { label: t("ctx.heading3"), onClick: () => execInEditor(mdSetHeading(3), (ta) => codeInsertLinePrefix(ta, "### ")) },
        { label: t("ctx.heading4"), onClick: () => execInEditor(mdSetHeading(4), (ta) => codeInsertLinePrefix(ta, "#### ")) },
        { label: t("ctx.heading5"), onClick: () => execInEditor(mdSetHeading(5), (ta) => codeInsertLinePrefix(ta, "##### ")) },
        { label: t("ctx.heading6"), onClick: () => execInEditor(mdSetHeading(6), (ta) => codeInsertLinePrefix(ta, "###### ")) },
      ],
    },
    { type: "separator" },
    { label: t("ctx.find"), shortcut: "Ctrl+F", onClick: doFind },
    { label: t("ctx.undo"), shortcut: "Ctrl+Z", onClick: doUndo },
    { label: t("ctx.redo"), shortcut: "Ctrl+Y", onClick: doRedo },
    { type: "separator" },
    { label: t("ctx.copyAsMarkdown"), onClick: doCopyAsMarkdown },
    { label: t("ctx.copyAsPlainText"), onClick: doCopyAsPlainText },
    { type: "separator" },
    { label: t("ctx.toggleSource"), onClick: () => s.toggleSource() },
    { label: t("ctx.toggleReading"), onClick: () => s.toggleReading() },
    { label: t("ctx.toggleFocus"), onClick: () => s.toggleFocus() },
    { type: "separator" },
    { label: t("ctx.openFileLocation"), onClick: doOpenFileLocation },
  ];
}

// 兼容原有调用（CodeEditor.tsx 中有 setEditorView(null) 调用）
export function setEditorView(_v: any) {
  // no-op：editorView 现在由 MilkdownEditor.tsx 通过 store.setEditorView 管理
}

export function getEditorView(): any {
  return useAppStore.getState().editorView;
}
