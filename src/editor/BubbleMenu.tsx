/**
 * BubbleMenu - 选中文字时浮现的格式工具栏
 *
 * 对标 Typora 的悬浮格式工具栏，提供快捷格式化操作。
 */
import React, { useState, useEffect, useCallback, useRef } from "react";
import { useAppStore } from "../store/useAppStore";
import { useLocale, tFor } from "../i18n";

interface BubbleMenuProps {
  containerRef: React.RefObject<HTMLDivElement | null>;
}

interface MenuState {
  visible: boolean;
  x: number;
  y: number;
}

export function BubbleMenu({ containerRef }: BubbleMenuProps) {
  const [menu, setMenu] = useState<MenuState>({ visible: false, x: 0, y: 0 });
  const editorView = useAppStore((s) => s.editorView);
  const locale = useLocale((s) => s.locale);
  const t = tFor(locale);
  const menuRef = useRef<HTMLDivElement>(null);

  const hideMenu = useCallback(() => {
    setMenu((m) => (m.visible ? { ...m, visible: false } : m));
  }, []);

  // 监听选区变化
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleSelectionChange = () => {
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed || !selection.rangeCount) {
        hideMenu();
        return;
      }

      const range = selection.getRangeAt(0);
      // 确保选区在编辑器内
      if (!container.contains(range.commonAncestorContainer)) {
        hideMenu();
        return;
      }

      const rect = range.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) {
        hideMenu();
        return;
      }

      const containerRect = container.getBoundingClientRect();
      setMenu({
        visible: true,
        x: rect.left + rect.width / 2 - containerRect.left,
        y: rect.top - containerRect.top - 44,
      });
    };

    document.addEventListener("selectionchange", handleSelectionChange);
    container.addEventListener("scroll", hideMenu);
    return () => {
      document.removeEventListener("selectionchange", handleSelectionChange);
      container.removeEventListener("scroll", hideMenu);
    };
  }, [containerRef, hideMenu]);

  // 点击菜单外部时隐藏
  useEffect(() => {
    if (!menu.visible) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        hideMenu();
      }
    };
    const timer = setTimeout(() => {
      document.addEventListener("mousedown", handleClick);
    }, 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", handleClick);
    };
  }, [menu.visible, hideMenu]);

  // 执行格式命令
  const execCommand = useCallback(
    (command: string, value?: string) => {
      document.execCommand(command, false, value);
      // 触发编辑器内容更新
      const view = editorView;
      if (view) {
        // 让 Milkdown 感知 DOM 变化
        setTimeout(() => {
          view.dispatch(view.state.tr.setMeta("addToHistory", true));
        }, 0);
      }
    },
    [editorView]
  );

  if (!menu.visible) return null;

  const buttons = [
    { icon: "B", title: t("format.bold"), cmd: () => execCommand("bold"), style: { fontWeight: "bold" } as React.CSSProperties },
    { icon: "I", title: t("format.italic"), cmd: () => execCommand("italic"), style: { fontStyle: "italic" } as React.CSSProperties },
    { icon: "S", title: t("format.strikethrough"), cmd: () => execCommand("strikeThrough"), style: { textDecoration: "line-through" } as React.CSSProperties },
    { icon: "<>", title: t("format.inlineCode"), cmd: () => wrapSelection("`"), style: { fontFamily: "monospace" } as React.CSSProperties },
    { icon: "🔗", title: t("format.link"), cmd: () => { const url = prompt("URL:"); if (url) execCommand("createLink", url); }, style: {} as React.CSSProperties },
  ];

  return (
    <div
      ref={menuRef}
      className="textora-bubble-menu"
      style={{
        position: "absolute",
        left: menu.x,
        top: menu.y,
        transform: "translateX(-50%)",
        zIndex: 1000,
        display: "flex",
        gap: 2,
        padding: "4px 6px",
        background: "var(--textora-bg-secondary, #2d2d2d)",
        border: "1px solid var(--textora-border, #444)",
        borderRadius: 6,
        boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
      }}
    >
      {buttons.map((btn) => (
        <button
          key={btn.title}
          title={btn.title}
          onMouseDown={(e) => {
            e.preventDefault(); // 防止失去选区
            btn.cmd();
          }}
          style={{
            width: 28,
            height: 28,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            border: "none",
            borderRadius: 4,
            background: "transparent",
            color: "var(--textora-fg, #eee)",
            cursor: "pointer",
            fontSize: 13,
            fontWeight: 500,
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "var(--textora-hover, #444)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
        >
          <span style={btn.style}>
            {btn.icon}
          </span>
        </button>
      ))}
    </div>
  );
}

/** 在选区前后插入包裹字符（如 ` 或 **） */
function wrapSelection(wrapper: string) {
  const selection = window.getSelection();
  if (!selection || !selection.rangeCount) return;
  const range = selection.getRangeAt(0);
  const text = range.toString();
  const newText = `${wrapper}${text}${wrapper}`;
  range.deleteContents();
  range.insertNode(document.createTextNode(newText));
  // 重新选中插入的文本（不含 wrapper）
  selection.collapseToEnd();
}
