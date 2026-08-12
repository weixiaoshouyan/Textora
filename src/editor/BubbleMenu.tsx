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
  onOpenAi?: (pos: { x: number; y: number }, selectedText: string) => void;
}

interface MenuState {
  visible: boolean;
  x: number;
  y: number;
}

export function BubbleMenu({ containerRef, onOpenAi }: BubbleMenuProps) {
  const [menu, setMenu] = useState<MenuState>({ visible: false, x: 0, y: 0 });
  const editorView = useAppStore((s) => s.editorView);
  const locale = useLocale((s) => s.locale);
  const t = tFor(locale);
  const menuRef = useRef<HTMLDivElement>(null);
  const timersRef = useRef<number[]>([]);

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
        const timer = window.setTimeout(() => {
          // 视图可能已被销毁（切换标签/源码模式），此时 dispatch 会抛 "view destroyed"
          if (!view.dom || !view.dom.isConnected || !view.state) return;
          try {
            view.dispatch(view.state.tr.setMeta("addToHistory", true));
          } catch {
            /* 视图已销毁，忽略 */
          }
        }, 0);
        timersRef.current.push(timer);
      }
    },
    [editorView]
  );

  // 卸载时清理所有挂起的定时器
  useEffect(() => {
    return () => {
      timersRef.current.forEach((id) => window.clearTimeout(id));
      timersRef.current = [];
    };
  }, []);

  const [showLinkInput, setShowLinkInput] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");

  if (!menu.visible) return null;

  const handleAiClick = () => {
    const selection = window.getSelection();
    const text = selection ? selection.toString() : "";
    if (onOpenAi && menuRef.current) {
      const rect = menuRef.current.getBoundingClientRect();
      onOpenAi({ x: rect.left, y: rect.bottom }, text);
      hideMenu();
    }
  };

  const buttons = [
    { icon: "✨ AI", title: locale === "zh" ? "AI 润色 / 写作" : "AI Copilot", cmd: handleAiClick, style: { fontWeight: "bold", color: "var(--textora-accent)" } as React.CSSProperties },
    { icon: "B", title: t("format.bold"), cmd: () => execCommand("bold"), style: { fontWeight: "bold" } as React.CSSProperties },
    { icon: "I", title: t("format.italic"), cmd: () => execCommand("italic"), style: { fontStyle: "italic" } as React.CSSProperties },
    { icon: "S", title: t("format.strikethrough"), cmd: () => execCommand("strikeThrough"), style: { textDecoration: "line-through" } as React.CSSProperties },
    { icon: "<>", title: t("format.inlineCode"), cmd: () => wrapSelection("`"), style: { fontFamily: "monospace" } as React.CSSProperties },
    { icon: "🔗", title: t("format.link"), cmd: () => setShowLinkInput(true), style: {} as React.CSSProperties },
  ];

  return (
    <div
      ref={menuRef}
      className="textora-bubble-menu textora-glass animate-pop-in rounded-lg shadow-xl"
      style={{
        position: "absolute",
        left: menu.x,
        top: menu.y,
        transform: "translateX(-50%)",
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        gap: 3,
        padding: "4px 8px",
      }}
    >
      {showLinkInput ? (
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <input
            autoFocus
            type="text"
            placeholder="https://"
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                if (linkUrl) execCommand("createLink", linkUrl);
                setShowLinkInput(false);
                setLinkUrl("");
              } else if (e.key === "Escape") {
                setShowLinkInput(false);
                setLinkUrl("");
              }
            }}
            className="text-xs px-2 py-1 border rounded"
            style={{ outline: "none", width: 150 }}
          />
          <button
            className="text-xs px-2 py-1 rounded bg-blue-500 text-white"
            onClick={() => {
              if (linkUrl) execCommand("createLink", linkUrl);
              setShowLinkInput(false);
              setLinkUrl("");
            }}
          >
            OK
          </button>
        </div>
      ) : (
        buttons.map((btn) => (
          <button
            key={btn.title}
            title={btn.title}
            onMouseDown={(e) => {
              e.preventDefault(); // 防止失去选区
              btn.cmd();
            }}
          style={{
            height: 26,
            padding: "0 6px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            border: "none",
            borderRadius: 4,
            background: "transparent",
            color: "var(--textora-fg, #eee)",
            cursor: "pointer",
            fontSize: 12,
            fontWeight: 500,
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "var(--textora-bg-muted)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
        >
          <span style={btn.style}>
            {btn.icon}
          </span>
        </button>
        ))
      )}
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
