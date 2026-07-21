import { useEffect, useMemo, useRef, useState } from "react";
import { useAppStore } from "../store/useAppStore";
import { extractOutline, type OutlineItem } from "../editor/outline";
import { extractSymbols, type CodeSymbol } from "../editor/codeSymbols";
import { useLocale, tFor } from "../i18n";

export function Outline() {
  const content = useAppStore((s) => s.content);
  const currentPath = useAppStore((s) => s.currentPath);
  const sourceMode = useAppStore((s) => s.settings.sourceMode);
  const kind = useAppStore((s) => s.tabs.find(t => t.id === s.activeTabId)?.kind ?? "");
  const language = useAppStore((s) => s.tabs.find(t => t.id === s.activeTabId)?.language ?? "");
  const [active, setActive] = useState<number | null>(null);
  const jumpLockRef = useRef(false);

  const items = useMemo(() => extractOutline(content), [content]);


  // Extract code symbols for code/source mode
  const symbols = useMemo(() => {
    if (kind !== "code") return [];
    return extractSymbols(content, language);
  }, [content, kind, language]);

  // Use symbols for code mode, items for markdown mode
  const isCodeMode = kind === "code" || (kind === "markdown" && sourceMode);
  const displayItems = isCodeMode ? symbols.map(s => ({
    level: 0,
    text: s.name,
    line: s.line,
    pos: s.line,
    kind: s.kind,
  })) : items;


  // 通过滚动监听高亮当前标题
  useEffect(() => {
    if (sourceMode) {
      setActive(null);
      return;
    }

    const editor = document.querySelector(".milkdown .ProseMirror") as HTMLElement | null;
    if (!editor || !displayItems.length) return;

    const onScroll = () => {
      // 跳转期间锁定，避免 scrollIntoView 触发的滚动覆盖高亮判断
      if (jumpLockRef.current) return;
      const headings = editor.querySelectorAll("h1, h2, h3, h4, h5, h6");
      if (!headings.length) return;

      const editorRect = editor.getBoundingClientRect();
      let current: number | null = null;

      for (let i = 0; i < Math.min(displayItems.length, headings.length); i++) {
        const heading = headings[i] as HTMLElement;
        const rect = heading.getBoundingClientRect();
        const relativeTop = rect.top - editorRect.top;

        // 当标题滚动到编辑器顶部 100px 范围内时，认为是当前活动标题
        if (relativeTop <= 100) {
          current = i;
        }
      }

      setActive(current);
    };

    editor.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => editor.removeEventListener("scroll", onScroll);
  }, [items, currentPath, sourceMode]);

  const onJump = (item: any, index: number) => {
    if (sourceMode) {
      // 源码模式下，跳转到对应行
      const sourceEditor = document.querySelector<HTMLTextAreaElement>(".textora-code-textarea");
      if (sourceEditor) {
        const lines = content.split("\n");
        let line = 0;
        for (let i = 0; i < item.line && i < lines.length; i++) {
          line += lines[i].length + 1;
        }
        sourceEditor.focus();
        sourceEditor.setSelectionRange(line, line);
        // 用实际行高而非写死值
        const computedLineHeight = parseFloat(
          getComputedStyle(sourceEditor).lineHeight
        ) || 24;
        sourceEditor.scrollTop = Math.max(0, item.line * computedLineHeight - 100);
      }
      return;
    }

    // WYSIWYG 模式：优先用 editorView.doc.descendants 精确匹配 heading
    // 比按 DOM 索引匹配更健壮：能处理 extractOutline 与 DOM 渲染顺序不一致的情况
    const view = useAppStore.getState().editorView as any;
    if (view?.state?.doc) {
      let count = 0;
      let targetPos: number | null = null;
      view.state.doc.descendants((node: any, pos: number) => {
        if (node.type.name === "heading") {
          if (count === index) {
            targetPos = pos;
            return false; // 停止遍历
          }
          count++;
        }
        return true;
      });
      if (targetPos != null) {
        const dom = view.nodeDOM(targetPos) as HTMLElement | null;
        if (dom) {
          jumpLockRef.current = true;
          dom.scrollIntoView({ block: "start", behavior: "smooth" });
          setActive(index);
          // 滚动动画约 400ms，之后解锁
          window.setTimeout(() => {
            jumpLockRef.current = false;
          }, 500);
          return;
        }
      }
    }

    // 回退：按 DOM 索引匹配（原实现）
    const editor = document.querySelector(".milkdown .ProseMirror") as HTMLElement | null;
    if (!editor) return;

    const headings = editor.querySelectorAll("h1, h2, h3, h4, h5, h6");
    const target = headings[index] as HTMLElement | undefined;
    if (target) {
      const editorRect = editor.getBoundingClientRect();
      const r = target.getBoundingClientRect();
      const offset = r.top - editorRect.top + editor.scrollTop;
      jumpLockRef.current = true;
      editor.scrollTo({
        top: Math.max(0, offset - 80),
        behavior: "smooth",
      });
      setActive(index);
      window.setTimeout(() => {
        jumpLockRef.current = false;
      }, 500);
    }
  };

  const locale = useLocale((s) => s.locale);
  const t = tFor(locale);

  if (!items.length) {
    return (
      <div
        className="text-xs px-3 py-2"
        style={{ color: "var(--textora-fg-muted)" }}
      >
        {t("outline.empty")}
      </div>
    );
  }

  return (
    <div className="text-sm py-1">
      {items.map((it, i) => (
        <div
          key={`${it.line}-${i}`}
          className="cursor-pointer truncate rounded px-2 py-1.5 transition-colors"
          style={{
            paddingLeft: 12 + (it.level - 1) * 12,
            color:
              i === active
                ? "var(--textora-accent)"
                : "var(--textora-fg)",
            background:
              i === active ? "var(--textora-bg-muted)" : "transparent",
            fontWeight: i === active ? 600 : 400,
            fontSize: it.level <= 2 ? "14px" : "13px",
          }}
          onClick={() => onJump(it, i)}
          title={it.text}
        >
          <span style={{ opacity: 0.5, marginRight: 6, fontSize: "11px" }}>
            H{it.level}
          </span>
          {it.text}
        </div>
      ))}
    </div>
  );
}
