import { useRef, useState, useCallback, useEffect } from "react";
import { useAppStore } from "../store/useAppStore";
import { ContextMenu, CtxMenuItem } from "../ui/ContextMenu";
import { buildEditorMenu } from "./contextMenu";
import { Editor, rootCtx, defaultValueCtx, editorViewCtx, editorViewOptionsCtx, parserCtx } from "@milkdown/core";
import { commonmark } from "@milkdown/preset-commonmark";
import { gfm } from "@milkdown/preset-gfm";
import { history } from "@milkdown/plugin-history";
import { listener, listenerCtx } from "@milkdown/plugin-listener";
import { replaceAll as replaceAllAction } from "@milkdown/utils";
import { attachCodeHighlighter, refreshCodeHighlighter } from "../plugins/codeHighlight";
import { codeFoldPlugin } from "../plugins/codeFold";
import { setShikiTheme } from "../plugins/shikiClient";
// 高级功能插件（数学 / 图表 / 目录）
import { mathPlugin, bumpMath } from "../plugins/math";
import { mermaidPlugin, setMermaidTheme, bumpMermaid } from "../plugins/mermaid";
import { tocPlugin, bumpToc, attachTocJump } from "../plugins/toc";
// Markdown 快捷键（Typora 系：标题 / 引用 / 代码块）
import { markdownShortcuts } from "../plugins/markdownShortcuts";
// 编辑器交互处理器（专注 / 打字机 / 图片）
import { attachFocusMode } from "./focusMode";
import { attachTypewriter } from "./typewriter";
import { attachImageHandlers } from "./imageHandler";
import { attachImageLightbox } from "./imageLightbox";
import { attachImageResize } from "./imageResize";
import { attachTableResize } from "./tableResize";
import { attachWikiLinkHandler } from "../plugins/wikiLink";
import { BubbleMenu } from "./BubbleMenu";
import { SlashCommandMenu } from "./SlashCommand";

import { TableToolbar } from "./TableToolbar";
import { InlineAiCopilot } from "./InlineAiCopilot";

interface Props {
  content: string;
  onChange: (content: string) => void;
  readOnly?: boolean;
}

export function MilkdownEditor({ content, onChange, readOnly = false }: Props) {
  const settings = useAppStore((s) => s.settings);
  const theme = useAppStore((s) => s.theme);
  const setEditorView = useAppStore((s) => s.setEditorView);
  const editorView = useAppStore((s) => s.editorView);
  const [ctxPos, setCtxPos] = useState<{ x: number; y: number } | null>(null);
  const [menuItems, setMenuItems] = useState<CtxMenuItem[]>([]);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiPos, setAiPos] = useState<{ x: number; y: number } | null>(null);
  const [aiSelectedText, setAiSelectedText] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<Editor | null>(null);
  const onChangeRef = useRef(onChange);
  const lastContent = useRef(content);
  // 最新 content 镜像：create 是异步的，闭包中的 content 可能是旧值，
  // 用于 create 完成后检测「创建期间 content 已更新」并立即同步。
  const contentRef = useRef(content);
  const detachRefs = useRef<Array<() => void>>([]);

  // 键盘快捷键 Ctrl+K 触发 Inline AI Copilot
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setAiSelectedText("");
        setAiPos(null);
        setAiOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handleOpenAiFromMenu = (pos: { x: number; y: number }, selectedText: string) => {
    setAiPos(pos);
    setAiSelectedText(selectedText);
    setAiOpen(true);
  };

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
          editable: () => !readOnly && !useAppStore.getState().settings.readingMode,
        });
        ctx.get(listenerCtx).markdownUpdated((_ctx, markdown) => {
          // 若 markdown 与最近一次已知内容一致，说明是外部同步（replaceAll）的回显，
          // 跳过回写，避免循环；用户真实输入时 markdown 必然不同，正常上报。
          if (markdown === lastContent.current) return;
          lastContent.current = markdown;
          onChangeRef.current(markdown);
        });
      })
      .use(commonmark)
      .use(gfm)
      .use(history)
      .use(listener)
      // 高级功能插件（数学 / 图表 / 目录）
      .use(mathPlugin)
      .use(mermaidPlugin)
      .use(tocPlugin)
      // Markdown 编辑快捷键（标题 / 引用 / 代码块）
      .use(markdownShortcuts)
      // 标题/代码块折叠（按钮用 Decoration widget 注入，避免 PM DOM 循环）
      .use(codeFoldPlugin);

    editor.create()
      .then(() => {
        if (destroyed) {
          try {
            void editor.destroy();
          } catch (err) {
            console.warn("[MilkdownEditor] destroy (create pending) failed:", err);
          }
          return;
        }
        editorRef.current = editor;
        const realView = editor.ctx.get(editorViewCtx);
        if (!readOnly) setEditorView(realView);
        detachRefs.current = [];

        // create 期间 content prop 可能已更新（异步读文件/AI 插入等），
        // defaultValueCtx 捕获的是旧值：检测并立即同步，避免编辑器停在旧内容上。
        if (lastContent.current !== content) {
          try {
            editor.action(replaceAllAction(contentRef.current));
            lastContent.current = contentRef.current;
          } catch (err) {
            console.warn("[MilkdownEditor] sync content after create failed:", err);
          }
        }

      // 挂载 Shiki 代码高亮 + 语言选择器
      const detachCode = attachCodeHighlighter(realView);
      detachRefs.current.push(detachCode);

      // 专注 / 打字机 / 图片交互 / 表格列宽
      detachRefs.current.push(
        attachTocJump(realView),
        attachFocusMode(realView, () => useAppStore.getState().settings.focusMode),
        attachTypewriter(realView, () => useAppStore.getState().settings.typewriterMode),
        attachImageHandlers(realView),
        attachImageLightbox(realView),
        attachImageResize(realView),
        attachTableResize(realView),
        attachWikiLinkHandler(realView),
      );

      // B5：WYSIWYG 模式按设置启用原生拼写检查
      if (realView?.dom) {
          (realView.dom as HTMLElement).setAttribute(
            "spellcheck",
            String(useAppStore.getState().settings.spellcheck),
          );
      }

      // 注册高效 markdown 追加函数：仅解析新内容并插入到文档末尾，
      // 避免 AI "插入文档" 触发 replaceAllAction 全量 re-parse 导致界面卡死
      if (!readOnly) {
        useAppStore.getState().setInsertMarkdownFn((markdown: string) => {
          const ed = editorRef.current;
          if (!ed) return;
          ed.action((ctx) => {
            const v = ctx.get(editorViewCtx);
            const parser = ctx.get(parserCtx);
            const parsed = parser("\n\n" + markdown + "\n");
            if (!parsed) return;
            const endPos = v.state.doc.content.size;
            const tr = v.state.tr.replaceWith(endPos, endPos, parsed.content);
            v.dispatch(tr.scrollIntoView());
          });
        });
      }
      })
      .catch((err) => {
        // 插件初始化异常：记录日志而非 unhandledrejection，避免编辑区静默空白
        console.error("[MilkdownEditor] editor.create failed:", err);
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
      if (!readOnly) {
        setEditorView(null);
        useAppStore.getState().setInsertMarkdownFn(null);
      }
      editorRef.current = null;
      try {
        void editor.destroy();
      } catch (err) {
        console.warn("[MilkdownEditor] destroy failed:", err);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readOnly]);

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
    contentRef.current = content;
    const editor = editorRef.current;
    if (!editor) {
      // 编辑器尚未就绪（异步 create 中）：仍同步镜像值。
      // 否则 create 完成后 lastContent 过期，编辑器停在旧内容且永不刷新。
      lastContent.current = content;
      return;
    }
    if (content === lastContent.current) return;
    lastContent.current = content;
    try {
      editor.action(replaceAllAction(content));
    } catch (err) {
      console.warn("[MilkdownEditor] replaceAll failed:", err);
      return;
    }
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
    view.setProps({ editable: () => !readOnly && !settings.readingMode });
  }, [settings.readingMode, readOnly]);

  const onContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setMenuItems(buildEditorMenu());
      setCtxPos({ x: e.clientX, y: e.clientY });
    },
    [],
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
      {!settings.readingMode && !readOnly && (
        <BubbleMenu containerRef={rootRef} onOpenAi={handleOpenAiFromMenu} />
      )}
      {/* 表格交互浮动工具栏 */}
      {!settings.readingMode && !readOnly && <TableToolbar view={editorView} />}
      {/* 输入 / 触发的快捷插入菜单 */}
      {!settings.readingMode && !readOnly && <SlashCommandMenu containerRef={rootRef} />}
      {/* 选中文本内联 AI 写作助手 */}
      {!readOnly && <InlineAiCopilot
        view={editorView}
        open={aiOpen}
        onClose={() => setAiOpen(false)}
        initialSelectedText={aiSelectedText}
        position={aiPos}
      />}
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





