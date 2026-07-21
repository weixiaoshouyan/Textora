/**
 * SlashCommand - 输入 `/` 触发的快捷插入菜单
 *
 * 对标 Typora/Notion 的 slash command，提供快速插入块级元素的能力。
 */
import React, { useState, useEffect, useCallback, useRef } from "react";
import { useAppStore } from "../store/useAppStore";
import { useLocale, tFor } from "../i18n";

interface SlashItem {
  key: string;
  label: string;
  icon: string;
  insert: string; // 要插入的 markdown 文本
}

interface SlashMenuState {
  visible: boolean;
  x: number;
  y: number;
  filter: string;
  selectedIndex: number;
}

export function useSlashCommand(containerRef: React.RefObject<HTMLDivElement | null>) {
  const [state, setState] = useState<SlashMenuState>({
    visible: false,
    x: 0,
    y: 0,
    filter: "",
    selectedIndex: 0,
  });
  const editorView = useAppStore((s) => s.editorView);
  const locale = useLocale((s) => s.locale);
  const t = tFor(locale);
  const stateRef = useRef(state);
  stateRef.current = state;

  const items: SlashItem[] = [
    { key: "h1", label: t("slash.h1"), icon: "H1", insert: "# " },
    { key: "h2", label: t("slash.h2"), icon: "H2", insert: "## " },
    { key: "h3", label: t("slash.h3"), icon: "H3", insert: "### " },
    { key: "quote", label: t("slash.quote"), icon: "❝", insert: "> " },
    { key: "code", label: t("slash.code"), icon: "⌨", insert: "```\n\n```" },
    { key: "ul", label: t("slash.ul"), icon: "•", insert: "- " },
    { key: "ol", label: t("slash.ol"), icon: "1.", insert: "1. " },
    { key: "task", label: t("slash.task"), icon: "☑", insert: "- [ ] " },
    { key: "hr", label: t("slash.hr"), icon: "—", insert: "\n---\n" },
    { key: "table", label: t("slash.table"), icon: "▦", insert: "\n| 列1 | 列2 | 列3 |\n| --- | --- | --- |\n| | | |\n" },
    { key: "math", label: t("slash.math"), icon: "∑", insert: "$$\n\n$$" },
    { key: "mermaid", label: t("slash.mermaid"), icon: "◈", insert: "```mermaid\ngraph TD\n  A --> B\n```\n" },
  ];

  const filteredItems = items.filter(
    (item) =>
      !state.filter ||
      item.label.toLowerCase().includes(state.filter.toLowerCase()) ||
      item.key.includes(state.filter.toLowerCase())
  );

  const hide = useCallback(() => {
    setState((s) => ({ ...s, visible: false, filter: "", selectedIndex: 0 }));
  }, []);

  const insertItem = useCallback(
    (item: SlashItem) => {
      const view = editorView;
      if (!view) return;
      const { state: editorState, dispatch } = view;
      const { from } = editorState.selection;

      // 删除触发的 "/" 及过滤文本
      const filterLen = stateRef.current.filter.length;
      const deleteFrom = from - filterLen - 1;

      const tr = editorState.tr;
      tr.delete(deleteFrom, from);
      tr.insertText(item.insert, deleteFrom);
      dispatch(tr);

      hide();
      view.focus();
    },
    [editorView, hide]
  );

  // 监听编辑器输入
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleKeydown = (e: KeyboardEvent) => {
      const s = stateRef.current;
      if (s.visible) {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setState((prev) => ({
            ...prev,
            selectedIndex: (prev.selectedIndex + 1) % filteredItems.length,
          }));
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          setState((prev) => ({
            ...prev,
            selectedIndex: (prev.selectedIndex - 1 + filteredItems.length) % filteredItems.length,
          }));
        } else if (e.key === "Enter" || e.key === "Tab") {
          e.preventDefault();
          if (filteredItems[s.selectedIndex]) {
            insertItem(filteredItems[s.selectedIndex]);
          }
        } else if (e.key === "Escape") {
          e.preventDefault();
          hide();
        } else if (e.key === "Backspace" && s.filter.length === 0) {
          hide();
        }
      }
    };

    const handleInput = () => {
      const view = editorView;
      if (!view) return;
      const { state: editorState } = view;
      const { from } = editorState.selection;
      const textBefore = editorState.doc.textBetween(Math.max(0, from - 50), from, "");

      // 检测是否在行首或空格后输入了 /
      const slashMatch = textBefore.match(/(?:^|[\s\n])\/([\w\u4e00-\u9fa5]*)$/);
      if (slashMatch) {
        const coords = view.coordsAtPos(from);
        const containerRect = container.getBoundingClientRect();
        setState({
          visible: true,
          x: coords.left - containerRect.left,
          y: coords.bottom - containerRect.top + 4,
          filter: slashMatch[1],
          selectedIndex: 0,
        });
      } else {
        hide();
      }
    };

    container.addEventListener("keydown", handleKeydown, true);
    container.addEventListener("input", handleInput);
    return () => {
      container.removeEventListener("keydown", handleKeydown, true);
      container.removeEventListener("input", handleInput);
    };
  }, [containerRef, editorView, filteredItems, hide, insertItem]);

  return { state, filteredItems, insertItem, hide };
}

interface SlashCommandMenuProps {
  containerRef: React.RefObject<HTMLDivElement | null>;
}

export function SlashCommandMenu({ containerRef }: SlashCommandMenuProps) {
  const { state, filteredItems, insertItem } = useSlashCommand(containerRef);

  if (!state.visible || filteredItems.length === 0) return null;

  return (
    <div
      className="textora-slash-menu"
      style={{
        position: "absolute",
        left: state.x,
        top: state.y,
        zIndex: 1001,
        minWidth: 200,
        maxHeight: 280,
        overflowY: "auto",
        padding: 4,
        background: "var(--textora-bg-secondary, #2d2d2d)",
        border: "1px solid var(--textora-border, #444)",
        borderRadius: 8,
        boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
      }}
    >
      {filteredItems.map((item, idx) => (
        <div
          key={item.key}
          onClick={() => insertItem(item)}
          onMouseEnter={() => {}}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "8px 12px",
            borderRadius: 4,
            cursor: "pointer",
            background: idx === state.selectedIndex ? "var(--textora-hover, #444)" : "transparent",
            color: "var(--textora-fg, #eee)",
          }}
        >
          <span style={{ width: 24, textAlign: "center", fontSize: 14, opacity: 0.8 }}>
            {item.icon}
          </span>
          <span style={{ fontSize: 13 }}>{item.label}</span>
        </div>
      ))}
    </div>
  );
}
