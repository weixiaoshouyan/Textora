/**
 * 源码/代码编辑器（textarea 叠加高亮层）。
 *
 * 模块拆分：
 *  - ./fold.ts        折叠范围计算
 *  - ./brackets.ts    括号匹配
 *  - ./snippets.ts    代码片段
 *  - ./utils.ts       通用工具（escapeHtml / getUniqueWords）
 */
import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { useAppStore, type CodeEditorApi } from "../../store/useAppStore";
import { codeToHtmlSafe, LARGE_FILE_THRESHOLD, setShikiTheme } from "../../plugins/shikiClient";
import { isDangerousRegex } from "../../shared/safeRegex";
import { ContextMenu } from "../../ui/ContextMenu";
import { buildEditorMenu } from "../contextMenu";
import { lineOps } from "../lineOps";
import { escapeHtml, getUniqueWords } from "./utils";
import { computeFoldRanges, VIRTUAL_LINE_THRESHOLD, VIRTUAL_BUFFER_LINES, type FoldRange } from "./fold";
import { findMatchingBracket, posToLineCol, type BracketPair } from "./brackets";
import { SNIPPETS } from "./snippets";

// ============================================================
// Component
// ============================================================

interface Props {
  content: string;
  language: string;
  onChange: (content: string) => void;
  readOnly?: boolean;
}

export function CodeEditor({ content, language, onChange, readOnly = false }: Props) {
  // 只订阅 settings，避免 content 等高频 state 变化导致整个组件重渲染
  const settings = useAppStore((s) => s.settings);
  const themeMode = useAppStore((s) => s.theme);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const gutterRef = useRef<HTMLDivElement>(null);
  const highlightRef = useRef<HTMLDivElement>(null);
  const activeLineRef = useRef<HTMLDivElement>(null);
  const indentGuidesRef = useRef<HTMLDivElement>(null);
  const autocompleteRef = useRef<HTMLDivElement>(null);

  const [folds, setFolds] = useState<FoldRange[]>([]);
  const foldsRef = useRef<FoldRange[]>([]);
  const [showAC, setShowAC] = useState(false);
  const [acItems, setAcItems] = useState<string[]>([]);
  const [acIndex, setAcIndex] = useState(0);
  const [acPos, setAcPos] = useState({ x: 0, y: 0 });
  const [bracketPair, setBracketPair] = useState<BracketPair | null>(null);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null);
  const [zoom, setZoom] = useState(100);
  const [virtualScrollTop, setVirtualScrollTop] = useState(0);

  // --- Bookmarks ---
  const [bookmarks, setBookmarks] = useState<Array<{ path: string; line: number }>>([]);
  const bmCurrentPath = useAppStore((s) => s.currentPath);

  const loadBookmarks = useCallback(() => {
    try {
      const raw = localStorage.getItem("textora.bookmarks");
      if (!raw) { setBookmarks([]); return; }
      const all = JSON.parse(raw);
      setBookmarks((all || []).filter((b: any) => b.path === bmCurrentPath));
    } catch { setBookmarks([]); }
  }, [bmCurrentPath]);

  // API 已通过下方 useMemo + useEffect 统一注册，此处无需重复注册
  useEffect(() => { loadBookmarks(); }, [loadBookmarks]);
  useEffect(() => {
    const handler = () => loadBookmarks();
    window.addEventListener("textora:bookmarks-changed", handler);
    return () => window.removeEventListener("textora:bookmarks-changed", handler);
  }, [loadBookmarks]);


  // --- Character edge line ---
  const [edgeColumn, setEdgeColumn] = useState(0); // 0 = disabled
  const edgeLineRef = useRef<HTMLDivElement>(null);

  // Update edge line position on mount and when settings change
  useEffect(() => {
    // Could be loaded from settings
    const saved = localStorage.getItem("textora.edgeColumn");
    if (saved) setEdgeColumn(parseInt(saved, 10) || 0);
  }, []);
  const [highlightedHtml, setHighlightedHtml] = useState("");
  // 文本区滚动位置（用于折叠遮罩层定位；大文件模式另有 virtualScrollTop）
  const [scrollTop, setScrollTop] = useState(0);

  const lineHeight = 22;
  const baseFontSize = settings.fontSize - 1;

  useEffect(() => { setShikiTheme(themeMode === "dark" || themeMode === "nord" ? "dark" : "light"); }, [themeMode]);

  // Recompute folds on language change
  useEffect(() => {
    const newFolds = computeFoldRanges(content, language);
    const prev = new Map<number, boolean>();
    for (const f of foldsRef.current) prev.set(f.startLine, f.folded);
    for (const f of newFolds) { if (prev.has(f.startLine)) f.folded = prev.get(f.startLine)!; }
    foldsRef.current = newFolds;
    setFolds(newFolds);
  }, [language, content]);

  const toggleFold = useCallback((startLine: number) => {
    setFolds(prev => prev.map(f => {
      if (f.startLine === startLine) {
        const folded = !f.folded;
        foldsRef.current = foldsRef.current.map(ff => ff.startLine === startLine ? { ...ff, folded } : ff);
        return { ...f, folded };
      }
      return f;
    }));
  }, []);

  const isLargeFile = content.length > LARGE_FILE_THRESHOLD || content.split("\n").length > VIRTUAL_LINE_THRESHOLD;

  const handleScroll = useCallback(() => {
    const el = textareaRef.current;
    const layer = highlightRef.current;
    const gutter = gutterRef.current;
    const indent = indentGuidesRef.current;
    if (!el) return;
    setScrollTop(el.scrollTop);
    if (isLargeFile) {
      setVirtualScrollTop(el.scrollTop);
    }
    // 大文件模式与普通模式都需要同步高亮层滚动位置
    if (layer) { layer.scrollTop = el.scrollTop; layer.scrollLeft = el.scrollLeft; }
    if (gutter) gutter.scrollTop = el.scrollTop;
    if (indent) { indent.scrollTop = el.scrollTop; indent.scrollLeft = el.scrollLeft; }
    // 滚动时同步更新当前行高亮位置
    if (activeLineRef.current) {
      const pos = el.selectionStart;
      const line = el.value.slice(0, pos).split("\n").length - 1;
      activeLineRef.current.style.top = (line * lineHeight + 12 - el.scrollTop) + "px";
    }
  }, [isLargeFile, lineHeight]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    // 折叠区外的编辑会使行号偏移、遮罩定位失效：编辑时自动展开所有折叠（安全优先）
    if (foldsRef.current.some((f) => f.folded)) {
      foldsRef.current = foldsRef.current.map((f) => ({ ...f, folded: false }));
      setFolds((prev) => prev.map((f) => ({ ...f, folded: false })));
    }
    onChange(e.target.value);
  }, [onChange]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      setZoom(prev => Math.max(50, Math.min(200, prev + (e.deltaY < 0 ? 10 : -10))));
    }
  }, []);

  const updateBracketMatch = useCallback((pos: number) => {
    const text = textareaRef.current?.value ?? content;
    const lines = text.split("\n");
    const { line, col } = posToLineCol(text, pos);
    const checkAt = (l: number, c: number) => {
      if (l >= lines.length || c >= lines[l].length) return;
      const ch = lines[l][c];
      if (ch === "(" || ch === "{" || ch === "[" || ch === ")" || ch === "}" || ch === "]") {
        const match = findMatchingBracket(text, l, c, lines);
        if (match) { setBracketPair({ line1: l, col1: c, line2: match.line, col2: match.col }); return; }
      }
      setBracketPair(null);
    };
    if (pos > 0) {
      const prev = posToLineCol(text, pos - 1);
      checkAt(prev.line, prev.col);
    } else {
      checkAt(line, col);
    }
  }, [content]);


  const executeLineOperation = useCallback((op: "sortAsc" | "sortDesc" | "sortNumAsc" | "sortNumDesc" | "removeDup" | "removeEmpty" | "tabToSpace" | "spaceToTab") => {
    const el = textareaRef.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const text = el.value;
    let result: { newText: string; newStart: number; newEnd: number };
    try {
      switch (op) {
        case "sortAsc": result = lineOps.sortLines(text, start, end, "asc"); break;
        case "sortDesc": result = lineOps.sortLines(text, start, end, "desc"); break;
        case "sortNumAsc": result = lineOps.sortLines(text, start, end, "asc", true); break;
        case "sortNumDesc": result = lineOps.sortLines(text, start, end, "desc", true); break;
        case "removeDup": result = lineOps.removeDuplicateLines(text, start, end); break;
        case "removeEmpty": result = lineOps.removeEmptyLines(text, start, end); break;
        case "tabToSpace": result = lineOps.indentToSpaces(text, start, end); break;
        case "spaceToTab": result = lineOps.spacesToTabs(text, start, end); break;
        default: return;
      }
    } catch { return; }
    onChange(result.newText);
    requestAnimationFrame(() => { el.selectionStart = result.newStart; el.selectionEnd = result.newEnd; });
  }, [onChange]);

  const getCurrentWord = useCallback((): { word: string; start: number } => {
    const el = textareaRef.current;
    if (!el) return { word: "", start: -1 };
    const pos = el.selectionStart;
    const text = el.value;
    let start = pos;
    while (start > 0 && /\w/.test(text[start - 1])) start--;
    return { word: text.slice(start, pos), start };
  }, []);

  const triggerAC = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    const { word, start } = getCurrentWord();
    if (word.length < 1) { setShowAC(false); return; }
    const words = getUniqueWords(content).filter(w => w.toLowerCase().startsWith(word.toLowerCase()) && w !== word);
    const snippets = (SNIPPETS[language] || SNIPPETS.default || []).filter(s => s.prefix.toLowerCase().startsWith(word.toLowerCase()));
    const items = [...snippets.map(s => "§" + s.prefix), ...words.slice(0, 50)];
    if (items.length === 0) { setShowAC(false); return; }
    const before = el.value.slice(0, start);
    const lines = before.split("\n");
    const ln = lines.length - 1;
    const col = lines[lines.length - 1].length;
    const cw = (baseFontSize - 1) * 0.6;
    setAcItems(items); setAcIndex(0); setAcPos({ x: col * cw + 16, y: (ln + 1) * lineHeight + 12 }); setShowAC(true);
  }, [content, language, getCurrentWord, baseFontSize, lineHeight]);

  const applyAC = useCallback((item: string) => {
    const el = textareaRef.current;
    if (!el) return;
    if (item.startsWith("§")) {
      const prefix = item.slice(1);
      const snip = (SNIPPETS[language] || SNIPPETS.default || []).find(s => s.prefix === prefix);
      if (!snip) return;
      const { start } = getCurrentWord();
      const body = snip.body.replace(/\$\d+/g, "");
      const val = el.value;
      onChange(val.slice(0, start) + body + val.slice(el.selectionEnd));
      requestAnimationFrame(() => { el.selectionStart = start + body.length; el.selectionEnd = start + body.length; });
    } else {
      const { start } = getCurrentWord();
      const val = el.value;
      onChange(val.slice(0, start) + item + val.slice(el.selectionEnd));
      requestAnimationFrame(() => { el.selectionStart = start + item.length; el.selectionEnd = start + item.length; });
    }
    setShowAC(false);
  }, [language, getCurrentWord, onChange]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const el = textareaRef.current;
    if (!el) return;

    if (showAC) {
      if (e.key === "Escape") { setShowAC(false); e.preventDefault(); return; }
      if (e.key === "Enter" || e.key === "Tab") { if (acItems.length > 0) { applyAC(acItems[acIndex]); e.preventDefault(); } return; }
      if (e.key === "ArrowDown") { setAcIndex(p => Math.min(p + 1, acItems.length - 1)); e.preventDefault(); return; }
      if (e.key === "ArrowUp") { setAcIndex(p => Math.max(p - 1, 0)); e.preventDefault(); return; }
    }

    if ((e.ctrlKey || e.metaKey) && e.key === " ") { e.preventDefault(); triggerAC(); return; }

    if (e.key === "Tab") {
      e.preventDefault();
      const start = el.selectionStart, end = el.selectionEnd, v = el.value;
      if (e.shiftKey) {
        const before = v.slice(0, start);
        const ls = before.lastIndexOf("\n") + 1;
        const sel = v.slice(ls, end);
        const ded = sel.split("\n").map(l => l.startsWith("    ") ? l.slice(4) : l.startsWith("\t") ? l.slice(1) : l).join("\n");
        onChange(v.slice(0, ls) + ded + v.slice(end));
        requestAnimationFrame(() => { el.selectionStart = Math.max(ls, start - 4); el.selectionEnd = ls + ded.length; });
      } else if (start !== end) {
        const before = v.slice(0, start);
        const ls = before.lastIndexOf("\n") + 1;
        const sel = v.slice(ls, end);
        const ind = sel.split("\n").map(l => "    " + l).join("\n");
        onChange(v.slice(0, ls) + ind + v.slice(end));
        requestAnimationFrame(() => { el.selectionStart = start + 4; el.selectionEnd = ls + ind.length; });
      } else {
        onChange(v.slice(0, start) + "    " + v.slice(end));
        requestAnimationFrame(() => { el.selectionStart = start + 4; el.selectionEnd = start + 4; });
      }
      return;
    }

    if (e.key === "Enter") {
      const start = el.selectionStart, v = el.value;
      const ls = v.lastIndexOf("\n", start - 1) + 1;
      const line = v.slice(ls, start);
      const indent = line.match(/^\s*/)?.[0] || "";
      const prev = v[start - 1] || "";
      const next = v[start] || "";
      let extra = "";
      if (prev === "{" || prev === ":" || prev === "(") extra = "    ";
      if (next === "}" && indent.endsWith("    ")) {
        // 光标紧贴 } 前按 Enter：新行应保持当前缩进层级（indent），
        // 而不是减 4 空格——否则在新行输入的内容会与所在代码块错位
        e.preventDefault();
        onChange(v.slice(0, start) + "\n" + indent + v.slice(start));
        requestAnimationFrame(() => { const np = start + 1 + indent.length; el.selectionStart = np; el.selectionEnd = np; });
        return;
      }
      e.preventDefault();
      onChange(v.slice(0, start) + "\n" + indent + extra + v.slice(el.selectionEnd));
      requestAnimationFrame(() => { const np = start + 1 + indent.length + extra.length; el.selectionStart = np; el.selectionEnd = np; });
      return;
    }

    // Line operations (Alt+Shift+Letter)
    if (e.altKey && e.shiftKey && !e.ctrlKey && !e.metaKey) {
      const key = e.key.toLowerCase();
      if (key === "a") { e.preventDefault(); executeLineOperation("sortAsc"); return; }
      if (key === "d") { e.preventDefault(); executeLineOperation("sortDesc"); return; }
      if (key === "n") { e.preventDefault(); executeLineOperation("sortNumAsc"); return; }
      if (key === "m") { e.preventDefault(); executeLineOperation("sortNumDesc"); return; }
      if (key === "u") { e.preventDefault(); executeLineOperation("removeDup"); return; }
      if (key === "e") { e.preventDefault(); executeLineOperation("removeEmpty"); return; }
      if (key === "t") { e.preventDefault(); executeLineOperation("tabToSpace"); return; }
    }
    if (e.key === "Backspace" || e.key === "Delete") setShowAC(false);
  }, [onChange, showAC, acItems, acIndex, triggerAC, applyAC, executeLineOperation]);

  useEffect(() => { const t = setTimeout(() => setShowAC(false), 200); return () => clearTimeout(t); }, [content]);

  // Virtual rendering for large files
  const virtualVisibleRange = useMemo(() => {
    if (!isLargeFile) return null;
    const totalLines = content.split("\n").length;
    const startLine = Math.max(0, Math.floor(virtualScrollTop / lineHeight) - VIRTUAL_BUFFER_LINES);
    const visibleCount = Math.ceil((window.innerHeight || 600) / lineHeight) + VIRTUAL_BUFFER_LINES * 2;
    const endLine = Math.min(totalLines, startLine + visibleCount);
    return { startLine, endLine, paddingTop: startLine * lineHeight };
  }, [isLargeFile, virtualScrollTop, content, lineHeight]);

  // Gutter content - 大文件时仅渲染可见范围
  const gutterLines = useMemo(() => {
    const lines = content.split("\n");
    const foldsByStart = new Map<number, FoldRange>();
    for (const f of folds) foldsByStart.set(f.startLine, f);

    if (virtualVisibleRange) {
      const visibleLines: { line: number; isFold: boolean; folded: boolean }[] = [];
      for (let i = virtualVisibleRange.startLine; i < virtualVisibleRange.endLine; i++) {
        const fold = foldsByStart.get(i);
        visibleLines.push({ line: i, isFold: !!fold, folded: fold?.folded ?? false });
      }
      return visibleLines;
    }

    return lines.map((_, i) => {
      const fold = foldsByStart.get(i);
      return { line: i, isFold: !!fold, folded: fold?.folded ?? false };
    });
  }, [content, folds, virtualVisibleRange]);

  // Highlight
  useEffect(() => {
    let cancelled = false;
    if (!language || !content) { setHighlightedHtml(escapeHtml(content)); return; }
    const doHighlight = (text: string) => {
      codeToHtmlSafe(text, language, { largeFile: isLargeFile })
        .then(h => { if (!cancelled) setHighlightedHtml(h); })
        .catch(() => { if (!cancelled) setHighlightedHtml(escapeHtml(text)); });
    };
    if (virtualVisibleRange) {
      const allLines = content.split("\n");
      const visible = allLines.slice(virtualVisibleRange.startLine, virtualVisibleRange.endLine).join("\n");
      doHighlight(visible);
    } else {
      doHighlight(content);
    }
    return () => { cancelled = true; };
    // themeMode：主题切换（setShikiTheme 已在上方 effect 生效）后必须重新高亮，
    // 否则源码高亮停留在旧主题配色
  }, [content, language, virtualVisibleRange, isLargeFile, themeMode]);

  // Active line
  useEffect(() => {
    const update = () => {
      const el = textareaRef.current;
      if (!el || !activeLineRef.current) return;
      const pos = el.selectionStart;
      const line = el.value.slice(0, pos).split("\n").length - 1;
      activeLineRef.current.style.top = (line * lineHeight + 12 - el.scrollTop) + "px";
      activeLineRef.current.style.display = "block";
    };
    update();
    document.addEventListener("selectionchange", update);
    return () => document.removeEventListener("selectionchange", update);
  }, [lineHeight]);

  // Indent guides - 大文件时仅渲染可见范围
  const indentGuides = useMemo(() => {
    const lines = content.split("\n");
    const guides: { line: number; depth: number }[] = [];

    const startLine = virtualVisibleRange?.startLine ?? 0;
    const endLine = virtualVisibleRange?.endLine ?? lines.length;

    for (let i = startLine; i < endLine; i++) {
      const m = lines[i]?.match(/^(\s*)/);
      if (m && m[1].length >= 4) guides.push({ line: i, depth: Math.floor(m[1].length / 4) });
    }
    return guides;
  }, [content, virtualVisibleRange]);

  // Bracket overlay
  const bracketOverlay = useMemo(() => {
    if (!bracketPair) return null;
    const cw = (baseFontSize - 1) * 0.6;
    return {
      p1: { top: bracketPair.line1 * lineHeight + 12, left: bracketPair.col1 * cw + 16 },
      p2: { top: bracketPair.line2 * lineHeight + 12, left: bracketPair.col2 * cw + 16 },
    };
  }, [bracketPair, baseFontSize, lineHeight]);

  // API 稳定化：通过 ref 读最新 content/onChange，避免每次击键重建 api
  // （否则 setCodeEditorApi 每次触发 store 更新，FindReplace 等订阅方反复重渲染）
  const contentRef = useRef(content);
  contentRef.current = content;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // API
  const api: CodeEditorApi = useMemo(() => ({
    getText: () => contentRef.current,
    setText: (t: string) => onChangeRef.current(t),
    getAllMatches: (query: string, opts: { regex: boolean; caseSensitive: boolean }) => {
      const matches: { from: number; to: number }[] = [];
      if (!query) return matches;
      const text = contentRef.current;
      if (opts.regex) {
        // ReDoS 防护：危险正则在渲染进程主线程同步执行会卡死整个界面
        if (isDangerousRegex(query)) return matches;
        try {
          const re = new RegExp(query, opts.caseSensitive ? "g" : "gi");
          let m: RegExpExecArray | null;
          while ((m = re.exec(text)) !== null) {
            matches.push({ from: m.index, to: m.index + m[0].length });
            // 零长度匹配时手动推进 lastIndex，避免 exec 无限循环冻结界面
            if (m.index === re.lastIndex) re.lastIndex++;
          }
        } catch { /* */ }
      } else {
        const step = query.length; const src = opts.caseSensitive ? text : text.toLowerCase(); const find = opts.caseSensitive ? query : query.toLowerCase();
        let idx = 0; while ((idx = src.indexOf(find, idx)) !== -1) { matches.push({ from: idx, to: idx + step }); idx += step; }
      }
      return matches;
    },
    select: (from: number, to: number) => { const el = textareaRef.current; if (el) { el.focus(); el.setSelectionRange(from, to); updateBracketMatch(from); } },
    replaceRange: (from: number, to: number, text: string) => {
      const c = contentRef.current;
      onChangeRef.current(c.slice(0, from) + text + c.slice(to));
    },
    focus: () => textareaRef.current?.focus(),
  }), [updateBracketMatch]);

  useEffect(() => {
    if (readOnly) return;
    useAppStore.getState().setCodeEditorApi(api);
    return () => { useAppStore.getState().setCodeEditorApi(null); };
  }, [api, readOnly]);

  const handleSelect = useCallback(() => { const el = textareaRef.current; if (el) updateBracketMatch(el.selectionStart); }, [updateBracketMatch]);

  const lines = content.split("\n");
  const lineCount = lines.length;

  return (
    <div ref={rootRef} className="textora-code-root" role={readOnly ? "region" : undefined} aria-label={readOnly ? "Read-only code preview" : undefined} style={{ height: "100%", overflow: readOnly ? "auto" : "hidden", background: "var(--textora-bg)", display: "flex", position: "relative" }} onWheel={handleWheel}>
      {/* Gutter */}
      <div ref={gutterRef} className="textora-code-gutter" aria-hidden style={{ userSelect: "none", textAlign: "right", overflow: "hidden", flexShrink: 0, position: "relative" }}>
        {virtualVisibleRange && (
          <div style={{ position: "absolute", top: virtualVisibleRange.paddingTop, left: 0, right: 0 }}>
            <div style={{ whiteSpace: "pre", padding: "12px 8px 12px 0", fontFamily: "ui-monospace, monospace", lineHeight: lineHeight + "px", fontSize: baseFontSize * zoom / 100, color: "var(--textora-fg-muted)" }}>
              {gutterLines.map(g => {
                const bm = bookmarks.some(b => b.line === g.line);
                const pad = Math.max(3, String(lineCount).length);
                return (bm ? "●" : " ") + (g.isFold ? (g.folded ? "▶" : "▼") : " ") + String(g.line + 1).padStart(pad, " ") + "\n";
              })}
            </div>
          </div>
        )}
        {!virtualVisibleRange && (
          <div style={{ whiteSpace: "pre", padding: "12px 8px 12px 0", fontFamily: "ui-monospace, monospace", lineHeight: lineHeight + "px", fontSize: baseFontSize * zoom / 100, color: "var(--textora-fg-muted)" }}>
            {gutterLines.map(g => {
              const bm = bookmarks.some(b => b.line === g.line);
              const pad = Math.max(3, String(lineCount).length);
              return (bm ? "●" : " ") + (g.isFold ? (g.folded ? "▶" : "▼") : " ") + String(g.line + 1).padStart(pad, " ") + "\n";
            })}
          </div>
        )}
        {!isLargeFile && gutterLines.filter(g => g.isFold).map(g => (
          <div
            key={"fold-" + g.line}
            onClick={(e) => { e.stopPropagation(); toggleFold(g.line); }}
            style={{
              position: "absolute",
              top: g.line * lineHeight + 12,
              left: 0, width: "16px",
              height: lineHeight,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 10,
              color: "var(--textora-fg-muted)",
            }}
          >
            {g.folded ? "▶" : "▼"}
          </div>
        ))}
      </div>

      {/* Editor area */}
      <div style={{ position: "relative", flex: 1, overflow: "hidden" }}>
        {readOnly && <div aria-hidden="true" style={{ minHeight: lineCount * lineHeight + 24, padding: "12px 16px", whiteSpace: "pre", fontFamily: "ui-monospace, SFMono-Regular, 'JetBrains Mono', Menlo, Consolas, monospace", fontSize: baseFontSize * zoom / 100, lineHeight: lineHeight + "px", visibility: "hidden" }}>{content}</div>}
        {/* Active line */}
        <div ref={activeLineRef} style={{ position: "absolute", left: 0, right: 0, height: lineHeight, background: "var(--textora-bg-muted)", opacity: 0.4, pointerEvents: "none", zIndex: 1 }} />

        {/* Indent guides */}
        <div ref={indentGuidesRef} style={{ position: "absolute", inset: 0, padding: virtualVisibleRange ? (virtualVisibleRange.paddingTop + 12) + "px 16px 0 16px" : "12px 16px", pointerEvents: "none", overflow: "hidden", zIndex: 2 }}>
          {indentGuides.map((g, i) => {
            const cw = (baseFontSize - 1) * 0.6;
            const topOffset = virtualVisibleRange ? g.line * lineHeight - virtualVisibleRange.startLine * lineHeight : g.line * lineHeight;
            return Array.from({ length: g.depth }, (_, d) => (
              <div key={"gd-" + i + "-" + d} style={{ position: "absolute", top: topOffset, left: (d + 1) * 4 * cw, width: "1px", height: lineHeight, borderLeft: "1px dotted var(--textora-border)" }} />
            ));
          })}
        </div>

        {/* Character edge line */}
        {edgeColumn > 0 && (
          <div
            ref={edgeLineRef}
            style={{
              position: "absolute",
              top: 0,
              bottom: 0,
              left: (edgeColumn - 1) * (baseFontSize - 1) * 0.6 + 16,
              width: "1px",
              borderLeft: "1px dashed var(--textora-border)",
              pointerEvents: "none",
              zIndex: 2,
            }}
          />
        )}

        {/* Bracket match */}
        {bracketOverlay && (
          <>
            <div style={{ position: "absolute", top: bracketOverlay.p1.top, left: bracketOverlay.p1.left, width: (baseFontSize - 1) * 0.6, height: lineHeight, background: "var(--textora-accent)", opacity: 0.2, pointerEvents: "none", borderRadius: "2px", zIndex: 3 }} />
            <div style={{ position: "absolute", top: bracketOverlay.p2.top, left: bracketOverlay.p2.left, width: (baseFontSize - 1) * 0.6, height: lineHeight, background: "var(--textora-accent)", opacity: 0.2, pointerEvents: "none", borderRadius: "2px", zIndex: 3 }} />
          </>
        )}

        {/* Syntax highlight */}
        <div ref={highlightRef} className="textora-code-highlight" aria-hidden style={{ position: "absolute", inset: 0, padding: virtualVisibleRange ? (virtualVisibleRange.paddingTop + 12) + "px 16px 0 16px" : "12px 16px", fontFamily: "ui-monospace, SFMono-Regular, 'JetBrains Mono', Menlo, Consolas, monospace", fontSize: baseFontSize * zoom / 100, lineHeight: lineHeight + "px", whiteSpace: "pre", overflow: isLargeFile ? "hidden" : "auto", pointerEvents: "none", color: "var(--textora-fg)", zIndex: 4 }} dangerouslySetInnerHTML={{ __html: highlightedHtml }} />

        {/* 折叠遮罩层：真正隐藏折叠区（覆盖文本区对应行），点击展开。
            大文件（虚拟滚动）模式不渲染，折叠箭头也已隐藏 */}
        {!isLargeFile && folds.filter((f) => f.folded).map((f) => (
          <div
            key={"fold-overlay-" + f.startLine}
            onClick={(e) => { e.stopPropagation(); toggleFold(f.startLine); }}
            title="点击展开折叠"
            style={{
              position: "absolute",
              left: 0, right: 0,
              top: (f.startLine + 1) * lineHeight + 12 - scrollTop,
              height: (f.endLine - f.startLine) * lineHeight,
              background: "var(--textora-bg)",
              borderTop: "1px solid var(--textora-border)",
              borderBottom: "1px solid var(--textora-border)",
              cursor: "pointer",
              zIndex: 6,
              display: "flex",
              alignItems: "flex-start",
              padding: "0 16px",
              fontSize: 11,
              color: "var(--textora-fg-muted)",
              lineHeight: lineHeight + "px",
            }}
          >
            <span style={{ userSelect: "none" }}>▶ {f.endLine - f.startLine} 行已折叠</span>
          </div>
        ))}

        {/* Textarea is intentionally omitted from read-only clones so they do not expose an editable control. */}
        {!readOnly && <textarea ref={textareaRef} className="textora-code-textarea" value={content} onChange={handleChange} onKeyDown={handleKeyDown} onScroll={handleScroll} onSelect={handleSelect} spellCheck={settings.spellcheck} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", padding: "12px 16px", border: "none", outline: "none", resize: "none", background: "transparent", color: "transparent", caretColor: "var(--textora-fg)", fontFamily: "ui-monospace, SFMono-Regular, 'JetBrains Mono', Menlo, Consolas, monospace", fontSize: baseFontSize * zoom / 100, lineHeight: lineHeight + "px", whiteSpace: "pre", overflow: "auto", zIndex: 5 }} />}

        {/* Autocomplete */}
        {showAC && acItems.length > 0 && (
          <div ref={autocompleteRef} className="textora-card" style={{ position: "absolute", top: acPos.y, left: acPos.x, zIndex: 60, maxHeight: 200, overflow: "auto", minWidth: 180, padding: "4px 0" }} onClick={e => e.stopPropagation()}>
            {acItems.map((item, i) => {
              const isSnip = item.startsWith("§");
              const label = isSnip ? item.slice(1) : item;
              return (
                <div key={item} onClick={() => applyAC(item)} className="px-3 py-1 cursor-pointer text-xs flex items-center gap-2" style={{ background: i === acIndex ? "var(--textora-bg-muted)" : "transparent" }} onMouseEnter={() => setAcIndex(i)}>
                  {isSnip && <span style={{ fontSize: 10, padding: "1px 4px", borderRadius: 3, background: "var(--textora-accent)", color: "var(--textora-accent-fg)" }}>snip</span>}
                  <span style={{ color: isSnip ? "var(--textora-fg)" : "var(--textora-fg-muted)" }}>{label}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {ctxMenu && <ContextMenu x={ctxMenu.x} y={ctxMenu.y} items={buildEditorMenu()} onClose={() => setCtxMenu(null)} />}
    </div>
  );
}
