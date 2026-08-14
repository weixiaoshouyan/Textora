/**
 * 编辑器右键菜单结构定义。
 * 动作实现见 ./actions.ts（do* 命令），这里只负责组装菜单项与 i18n 文案。
 */
import { useAppStore } from "../../store/useAppStore";
import { useLocale, tFor } from "../../i18n";
import { CtxMenuItem } from "../../ui/ContextMenu";
import {
  execInEditor,
  mdSetHeading,
  codeInsertLinePrefix,
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
} from "./actions";

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
