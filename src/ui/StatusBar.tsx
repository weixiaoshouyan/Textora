import { useEffect, useState, useCallback, useRef } from "react";
import { useAppStore } from "../store/useAppStore";
import { useLocale, tFor } from "../i18n";
import type { EditorView } from "@milkdown/prose/view";
import { LARGE_FILE_THRESHOLD } from "../plugins/shikiClient";

const ENCODINGS = ["utf-8", "utf-16le", "utf-16be", "gbk", "big5", "shift_jis", "euc-kr", "windows-1252"];

export function StatusBar() {
  const content = useAppStore((s) => s.content);
  const currentPath = useAppStore((s) => s.currentPath);
  const sourceMode = useAppStore((s) => s.settings.sourceMode);
  const readingMode = useAppStore((s) => s.settings.readingMode);
  const dirty = useAppStore((s) => s.dirty);
  const locale = useLocale((s) => s.locale);
  const t = tFor(locale);

  const [wordCount, setWordCount] = useState(0);
  const [charCount, setCharCount] = useState(0);
  const [lineCount, setLineCount] = useState(0);
  const [readMinutes, setReadMinutes] = useState(0);
  const [cursorLine, setCursorLine] = useState(1);
  const [cursorCol, setCursorCol] = useState(1);
  const [selLength, setSelLength] = useState(0);
  const [insertMode, setInsertMode] = useState<"INS" | "OVR">("INS");
  const [encMenuOpen, setEncMenuOpen] = useState(false);
  const encMenuRef = useRef<HTMLDivElement | null>(null);

  const encoding = useAppStore((s) => s.tabs.find((t) => t.id === s.activeTabId)?.encoding ?? "utf-8");
  const lineEnding = useAppStore((s) => s.tabs.find((t) => t.id === s.activeTabId)?.lineEnding ?? "lf");
  const language = useAppStore((s) => s.tabs.find((t) => t.id === s.activeTabId)?.language ?? "");
  const kind = useAppStore((s) => s.tabs.find((t) => t.id === s.activeTabId)?.kind ?? "");
  const showCodeStats = kind === "code" || kind === "markdown";
  const isLargeFile = content.length > LARGE_FILE_THRESHOLD || content.split("\n").length > 5000;

  useEffect(() => {
    const trimmed = content.trim();
    const CJK_RE = /[一-鿿㐀-䶿]/g;
    const cjk = (trimmed.match(CJK_RE) || []).length;
    const words = trimmed
      ? trimmed
          .replace(CJK_RE, " ")
          .split(/\s+/)
          .filter(Boolean).length
      : 0;
    const total = cjk + words;
    setWordCount(total);
    setCharCount(content.length);
    setLineCount(content ? content.split(/\r?\n/).length : 0);
    const rawMinutes = cjk / 300 + words / 200;
    const rounded = Math.round(rawMinutes);
    setReadMinutes(total === 0 ? 0 : Math.max(1, rounded));
  }, [content]);

  const trackMilkdownCursor = useCallback(() => {
    const view = useAppStore.getState().editorView as EditorView | null;
    if (!view) return;
    const { from, to } = view.state.selection;
    const doc = view.state.doc;
    let line = 1;
    let col = 1;
    // 只取选区前的文本计算行/列，避免每次光标移动都构建整篇 textContent。
    // selectionchange 在打字/拖动选区时高频触发，大文档下 O(整篇) 会造成明显卡顿。
    const text = doc.textBetween(0, Math.max(0, Math.min(from, doc.content.size)), "\n");
    for (let i = 0; i < text.length; i++) {
      if (text[i] === "\n") {
        line++;
        col = 1;
      } else {
        col++;
      }
    }
    setCursorLine(line);
    setCursorCol(col);
    setSelLength(to - from);
  }, []);

  // 游标：markdown WYSIWYG 用 ProseMirror；code/源码模式用 textarea — 均改用 selectionchange 事件驱动
  useEffect(() => {
    const trackCodeCursor = () => {
      const ta = document.querySelector(".textora-code-textarea") as HTMLTextAreaElement | null;
      if (ta) {
        const pos = ta.selectionStart;
        const end = ta.selectionEnd;
        const before = ta.value.slice(0, pos);
        const lines = before.split("\n");
        setCursorLine(lines.length);
        setCursorCol(lines[lines.length - 1].length + 1);
        setSelLength(end - pos);
      }
    };

    const handler = !sourceMode && kind === "markdown" ? trackMilkdownCursor : trackCodeCursor;
    // 初始更新一次
    handler();
    // selectionchange 事件在光标移动、选区变化时触发，替代 200ms 轮询
    document.addEventListener("selectionchange", handler);
    return () => document.removeEventListener("selectionchange", handler);
  }, [sourceMode, kind, trackMilkdownCursor]);

  // Insert 键切换 INS/OVR 模式（仅 code/源码模式有效）
  useEffect(() => {
    if (!showCodeStats) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Insert" && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const ta = document.querySelector(".textora-code-textarea") as HTMLTextAreaElement | null;
        if (ta) {
          e.preventDefault();
          setInsertMode((m) => (m === "INS" ? "OVR" : "INS"));
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showCodeStats]);

  useEffect(() => {
    if (!encMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (encMenuRef.current && !encMenuRef.current.contains(e.target as Node)) {
        setEncMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [encMenuOpen]);

  const shortPath = currentPath
    ? (() => {
        const parts = currentPath.split(/[\\/]/).filter(Boolean);
        if (parts.length <= 3) return parts.join("/");
        return ".../" + parts.slice(-2).join("/");
      })()
    : "";

  return (
    <footer
      className="flex items-center justify-between px-3 select-none shrink-0"
      style={{
        background: "var(--textora-bg-elev)",
        borderTop: "1px solid var(--textora-border)",
        color: "var(--textora-fg-muted)",
        height: 26,
        fontSize: 11,
      }}
      role="status"
      aria-live="polite"
    >
      <span className="flex items-center gap-3 truncate">
        {shortPath && (
          <span style={{ opacity: 0.6 }} title={currentPath || ""}>
            {shortPath}
          </span>
        )}
        {readingMode && <span style={{ marginLeft: 4 }}>{t("status.reading")}</span>}
        {dirty && <span style={{ marginLeft: 4, color: "var(--textora-fg)" }}>• {t("status.unsaved")}</span>}
        {showCodeStats && (
          <span style={{ marginLeft: 8 }}>
            {t("status.ln")} {cursorLine}, {t("status.col")} {cursorCol}
            {selLength > 0 && ` (${t("status.sel")} ${selLength})`}
          </span>
        )}
      </span>
      <span className="flex items-center gap-2 shrink-0">
        {showCodeStats && (
          <>
            <span style={{ marginRight: 4 }}>
              {wordCount} {t("status.words")}
            </span>
            <span style={{ marginRight: 4 }}>
              {charCount} {t("status.chars")}
            </span>
            <span style={{ marginRight: 4 }}>
              {lineCount} {t("status.lines")}
            </span>
            {readMinutes > 0 && wordCount > 0 && (
              <span style={{ marginRight: 4 }}>
                {readMinutes} {t("status.minutes")}
              </span>
            )}
            {language && (
              <span className="status-bar-item" style={{ textTransform: "uppercase", marginRight: 4 }}>
                {language}
              </span>
            )}
            {/* 行尾切换 */}
            <span
              className="status-bar-item clickable"
              title={t("status.lineEnding")}
              onClick={() =>
                useAppStore.getState().setActiveLineEnding(lineEnding === "lf" ? "crlf" : "lf")
              }
              style={{ marginRight: 4 }}
            >
              {lineEnding === "crlf" ? "CRLF" : "LF"}
            </span>
            {/* 编码切换 */}
            <span
              className="status-bar-item clickable"
              title={t("status.encoding")}
              onClick={() => setEncMenuOpen((v) => !v)}
              style={{ position: "relative", marginRight: 4 }}
            >
              {encoding}
              {encMenuOpen && (
                <div
                  ref={encMenuRef}
                  className="textora-card"
                  style={{
                    position: "absolute",
                    bottom: "120%",
                    right: 0,
                    zIndex: 70,
                    minWidth: 140,
                    padding: "4px 0",
                  }}
                >
                  {ENCODINGS.map((enc) => (
                    <div
                      key={enc}
                      className="px-3 py-1 cursor-pointer text-xs"
                      style={{
                        background: enc === encoding ? "var(--textora-bg-muted)" : "transparent",
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--textora-bg-muted)")}
                      onMouseLeave={(e) =>
                        (e.currentTarget.style.background =
                          enc === encoding ? "var(--textora-bg-muted)" : "transparent")
                      }
                      onClick={() => {
                        useAppStore.getState().setActiveEncoding(enc, true);
                        setEncMenuOpen(false);
                      }}
                    >
                      {enc}
                    </div>
                  ))}
                </div>
              )}
            </span>
            {/* INS/OVR 模式切换（Insert 键切换） */}
            <span
              className="status-bar-item clickable"
              title={t("status.insertMode")}
              onClick={() => setInsertMode((m) => (m === "INS" ? "OVR" : "INS"))}
              style={{ marginRight: 4 }}
            >
              {insertMode}
            </span>
            {/* 大文件虚拟滚动指示器 */}
            {isLargeFile && (
              <span
                style={{
                  marginRight: 4,
                  padding: "1px 6px",
                  borderRadius: 3,
                  background: "var(--textora-accent)",
                  color: "var(--textora-accent-fg)",
                  fontSize: 10,
                  fontWeight: 600,
                }}
                title="大文件模式：已启用虚拟滚动优化"
              >
                LARGE
              </span>
            )}
          </>
        )}
      </span>
    </footer>
  );
}
