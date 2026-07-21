import { useRef, useState, useCallback, useEffect } from "react";
import { useAppStore } from "../store/useAppStore";
import { ContextMenu, CtxMenuItem } from "../ui/ContextMenu";
import { buildEditorMenu } from "./editorContextMenu";
import { useLocale } from "../i18n";
import { Editor, rootCtx, defaultValueCtx, editorViewCtx, editorViewOptionsCtx } from "@milkdown/core";
import { commonmark } from "@milkdown/preset-commonmark";
import { gfm } from "@milkdown/preset-gfm";
import { history } from "@milkdown/plugin-history";
import { listener, listenerCtx } from "@milkdown/plugin-listener";
import { replaceAll as replaceAllAction } from "@milkdown/utils";
import { attachCodeHighlighter, refreshCodeHighlighter } from "../plugins/codeHighlight";
import { attachCodeFolding } from "../plugins/codeFold";
import { setShikiTheme } from "../plugins/shikiClient";
// 高级功能插件（数学 / 图表 / 目录）
import { mathPlugin, bumpMath } from "../plugins/math";
import { mermaidPlugin, setMermaidTheme, bumpMermaid } from "../plugins/mermaid";
import { tocPlugin, bumpToc, attachTocJump } from "../plugins/toc";
// 编辑器交互处理器（专注 / 打字机 / 图片）
import { attachFocusMode } from "./focusMode";
import { attachTypewriter } from "./typewriter";
import { attachImageHandlers } from "./imageHandler";
import { attachImageLightbox } from "./imageLightbox";
import { attachImageResize } from "./imageResize";
import { attachTableResize } from "./tableResize";
import { BubbleMenu } from "./BubbleMenu";
import { SlashCommandMenu } from "./SlashCommand";

interface Props {
  content: string;
  onChange: (content: string) => void;
}

export function MilkdownEditor({ content, onChange }: Props) {
  const settings = useAppStore((s) => s.settings);
  const theme = useAppStore((s) => s.theme);
  const setEditorView = useAppStore((s) => s.setEditorView);
  const [ctxPos, setCtxPos] = useState<{ x: number; y: number } | null>(null);
  const [menuItems, setMenuItems] = useState<CtxMenuItem[]>([]);
  const rootRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<Editor | null>(null);
  const onChangeRef = useRef(onChange);
  const lastContent = useRef(content);
  const isInternalChange = useRef(false);
  // 收集所有 attach 的清理函数，卸载时统一解绑
  const detachRefs = useRef<Array<() => void>>([]);
  const locale = useLocale((s) => s.locale);

  // 保持 onChange 引用最新，避免重建编辑器
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  // 初始化 Milkdown（仅一次）
  useEffect(() => {
    let destroyed = false;
    const root = rootRef.current;
    if (!root) return;

    const editor = Editor.make()
      .config((ctx) => {
        ctx.set(rootCtx, root);
        ctx.set(defaultValueCtx, content);
        ctx.set(editorViewOptionsCtx, {
          editable: () => !useAppStore.getState().settings.readingMode,
        });
        ctx.get(listenerCtx).markdownUpdated((_ctx, markdown) => {
          if (isInternalChange.current) return;
          lastContent.current = markdown;
          onChangeRef.current(markdown);
        });
      })
      .use(commonmark)
      .use(gfm)
      .use(history)
      .use(listener)
      // 高级功能插件
      .use(mathPlugin)
      .use(mermaidPlugin)
      .use(tocPlugin);

    editor.create().then(() => {
      if (destroyed) {
        void editor.destroy();
        return;
      }
      editorRef.current = editor;
      const realView = editor.ctx.get(editorViewCtx);
      setEditorView(realView);
      detachRefs.current = [];

      // 挂载 Shiki 代码高亮 + 语言选择器
      const detachCode = attachCodeHighlighter(realView);
      detachRefs.current.push(detachCode);

      // Code folding
      const detachFold = attachCodeFolding(realView);
      detachRefs.current.push(detachFold);

      // 专注 / 打字机 / 图片交互 / 表格列宽
      detachRefs.current.push(
        attachTocJump(realView),
        attachFocusMode(realView, () => useAppStore.getState().settings.focusMode),
        attachTypewriter(realView, () => useAppStore.getState().settings.typewriterMode),
        attachImageHandlers(realView),
        attachImageLightbox(realView),
        attachImageResize(realView),
        attachTableResize(realView),
      );

      // B5：WYSIWYG 模式按设置启用原生拼写检查
      if (realView?.dom) {
          (realView.dom as HTMLElement).setAttribute(
            "spellcheck",
            String(useAppStore.getState().settings.spellcheck),
          );
      }
    });

    return () => {
      destroyed = true;
      detachRefs.current.forEach((fn) => {
        try {
          fn();
        } catch (err) {
          console.warn("[MilkdownEditor] detach cleanup failed:", err);
        }
      });
      detachRefs.current = [];
      setEditorView(null);
      editorRef.current = null;
      void editor.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 主题变化时同步 Shiki 主题、刷新代码高亮，并触发数学/图表/目录重渲
  useEffect(() => {
    const isDark = theme === "dark" || theme === "nord";
    setShikiTheme(isDark ? "dark" : "light");
    void setMermaidTheme(isDark ? "dark" : "light");
    const editor = editorRef.current;
    if (!editor) return;
    const view = editor.ctx.get(editorViewCtx);
    refreshCodeHighlighter(view);
    // 主题切换后重渲依赖主题的装饰器
    bumpMath(view);
    bumpMermaid(view);
    bumpToc(view);
  }, [theme]);

  // B5：拼写检查设置变化时实时更新编辑区
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const view = editor.ctx.get(editorViewCtx);
    if (view?.dom) {
      (view.dom as HTMLElement).setAttribute("spellcheck", String(settings.spellcheck));
    }
  }, [settings.spellcheck]);

  // 外部 content 变化时同步到编辑器（用 replaceAll action，保留焦点）
  useEffect(() => {
    if (isInternalChange.current) {
      isInternalChange.current = false;
      return;
    }
    const editor = editorRef.current;
    if (!editor) return;
    if (content === lastContent.current) return;
    lastContent.current = content;
    isInternalChange.current = true;
    editor.action(replaceAllAction(content));
    // 内容被外部替换后，数学/图表/目录可能需重渲
    const view = editor.ctx.get(editorViewCtx);
    bumpMath(view);
    bumpMermaid(view);
    bumpToc(view);
  }, [content]);

  // readingMode 变化时更新 editable
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const view = editor.ctx.get(editorViewCtx);
    view.setProps({ editable: () => !settings.readingMode });
  }, [settings.readingMode]);

  const onContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setMenuItems(buildEditorMenu());
      setCtxPos({ x: e.clientX, y: e.clientY });
    },
    [locale],
  );

  const closeMenu = useCallback(() => {
    setCtxPos(null);
  }, []);

  return (
    <div
      ref={rootRef}
      className="milkdown-editor-container"
      style={{ height: "100%", position: "relative", padding: 24 }}
      onContextMenu={onContextMenu}
    >
      {/* 选中文字时浮现的格式工具栏 */}
      {!settings.readingMode && <BubbleMenu containerRef={rootRef} />}
      {/* 输入 / 触发的快捷插入菜单 */}
      {!settings.readingMode && <SlashCommandMenu containerRef={rootRef} />}
      {ctxPos && menuItems.length > 0 && (
        <ContextMenu
          x={ctxPos.x}
          y={ctxPos.y}
          items={menuItems}
          onClose={closeMenu}
        />
      )}
    </div>
  );
}





