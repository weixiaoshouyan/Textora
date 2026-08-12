import { useEffect, useRef, useState, useCallback } from "react";
import { useAppStore } from "../store/useAppStore";
import {
  findAllInDoc,
  replaceAllInDocAsync,
  replaceAllInText,
  selectMatch,
  type FindResult,
} from "../editor/findReplace";
import type { EditorView } from "@milkdown/prose/view";
import { useLocale, tFor } from "../i18n";
import { useFocusTrap } from "../hooks/useFocusTrap";
import { Toggle } from "./Toggle";
import { useClickOutside } from "../hooks/useClickOutside";

export function FindReplace() {
  const open = useAppStore((s) => s.findReplaceOpen);
  const setOpen = useAppStore((s) => s.setFindReplaceOpen);
  const [query, setQuery] = useState("");
  const [replacement, setReplacement] = useState("");
  const [index, setIndex] = useState(0);
  const [matches, setMatches] = useState<FindResult[]>([]);
  const [showReplace, setShowReplace] = useState(false);
  const [useRegex, setUseRegex] = useState(false);
  const [caseSensitive, setCaseSensitive] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const debounceRef = useRef<number | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const inputGroupRef = useRef<HTMLDivElement | null>(null);
  const locale = useLocale((s) => s.locale);
  const t = tFor(locale);
  useFocusTrap(containerRef, open);

  // Search history
  const [showHistory, setShowHistory] = useState(false);
  const [searchHistory, setSearchHistory] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem("textora.searchHistory") || "[]"); } catch { return []; }
  });
  useClickOutside(inputGroupRef, showHistory, () => setShowHistory(false));

  const saveSearchHistory = useCallback((q: string) => {
    if (!q.trim()) return;
    setSearchHistory(prev => {
      const filtered = prev.filter(h => h !== q);
      const next = [q, ...filtered].slice(0, 20);
      localStorage.setItem("textora.searchHistory", JSON.stringify(next));
      return next;
    });
  }, []);

  const isMarkdown = useAppStore((s) => {
    const tab = s.tabs.find((t) => t.id === s.activeTabId);
    return tab?.kind === "markdown" && !s.settings.sourceMode;
  });

  const getMdView = useCallback((): EditorView | null => {
    return (useAppStore.getState().editorView as EditorView | null) ?? null;
  }, []);

  const getCodeApi = useCallback(() => useAppStore.getState().codeEditorApi, []);

  useEffect(() => {
    if (open) {
      inputRef.current?.focus();
      setQuery("");
      setReplacement("");
      setMatches([]);
      setIndex(0);
      setShowReplace(false);
    }
  }, [open]);

  useEffect(() => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      if (isMarkdown) {
        const view = getMdView();
        if (!view) {
          setMatches([]);
          return;
        }
        const m = findAllInDoc(view, query, { regex: useRegex, caseSensitive });
        setMatches(m);
        setIndex(0);
        if (m[0]) selectMatch(view, m[0].from, m[0].to);
      } else {
        const api = getCodeApi();
        if (!api) {
          setMatches([]);
          return;
        }
        const m = api.getAllMatches(query, { regex: useRegex, caseSensitive });
        setMatches(m);
        setIndex(0);
        if (m[0]) api.select(m[0].from, m[0].to);
      }
    }, 150);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [query, open, useRegex, caseSensitive, isMarkdown, getMdView, getCodeApi]);

  const runSearch = () => {
    if (query.trim()) saveSearchHistory(query);
  };

  const next = () => {
    runSearch();
    if (!matches.length) return;
    const i = (index + 1) % matches.length;
    setIndex(i);
    selectAt(matches[i]);
  };

  const prev = () => {
    if (!matches.length) return;
    const i = (index - 1 + matches.length) % matches.length;
    setIndex(i);
    selectAt(matches[i]);
  };

  const selectAt = (m: FindResult) => {
    if (isMarkdown) {
      const view = getMdView();
      if (view) selectMatch(view, m.from, m.to);
    } else {
      getCodeApi()?.select(m.from, m.to);
    }
  };

  const replaceCurrent = () => {
    if (!matches.length) return;
    const m = matches[index];
    if (isMarkdown) {
      const view = getMdView();
      if (!view) return;
      let tr = view.state.tr;
      if (replacement) {
        tr = tr.replaceWith(m.from, m.to, view.state.schema.text(replacement));
      } else {
        tr = tr.delete(m.from, m.to);
      }
      view.dispatch(tr);
      setTimeout(() => {
        // 视图可能在异步期间被销毁（切换标签/源码模式），dispatch 会抛错
        if (!view.dom || !view.dom.isConnected) return;
        const nm = findAllInDoc(view, query, { regex: useRegex, caseSensitive });
        setMatches(nm);
        setIndex(Math.min(index, Math.max(0, nm.length - 1)));
        const target = nm[Math.min(index, Math.max(0, nm.length - 1))];
        if (target) selectMatch(view, target.from, target.to);
      }, 0);
    } else {
      const api = getCodeApi();
      if (!api) return;
      api.replaceRange(m.from, m.to, replacement);
      setTimeout(() => {
        const nm = api.getAllMatches(query, { regex: useRegex, caseSensitive });
        setMatches(nm);
        setIndex(Math.min(index, Math.max(0, nm.length - 1)));
        if (nm[Math.min(index, Math.max(0, nm.length - 1))])
          api.select(nm[Math.min(index, Math.max(0, nm.length - 1))].from, nm[Math.min(index, Math.max(0, nm.length - 1))].to);
      }, 0);
    }
  };

  const historySearch = (term: string) => {
    setQuery(term);
    setShowHistory(false);
  };

  const replaceAll = async () => {
    if (isMarkdown) {
      const view = getMdView();
      if (!view) return;
      // 异步分片匹配：大文档 + 多匹配时不再同步占用主线程卡死界面
      await replaceAllInDocAsync(view, query, replacement, { regex: useRegex, caseSensitive });
      setTimeout(() => {
        // 视图可能在异步期间被销毁
        if (!view.dom || !view.dom.isConnected) return;
        const nm = findAllInDoc(view, query, { regex: useRegex, caseSensitive });
        setMatches(nm);
        setIndex(0);
      }, 0);
    } else {
      const api = getCodeApi();
      if (!api) return;
      const all = api.getAllMatches(query, { regex: useRegex, caseSensitive });
      if (all.length === 0) return;
      // 一次性本地拼装后单次 setText：循环内多次调用 setState 会被 React 批处理
      // 覆盖（每次替换都基于旧文本），导致只有第一处替换生效（数据丢失 bug）。
      api.setText(replaceAllInText(api.getText(), all, replacement));
      setTimeout(() => {
        const nm = api.getAllMatches(query, { regex: useRegex, caseSensitive });
        setMatches(nm);
        setIndex(0);
      }, 0);
    }
  };

  if (!open) return null;
  return (
    <div ref={containerRef} className="absolute right-3 top-3 textora-card textora-glass animate-slide-down rounded-xl shadow-xl z-40 border" style={{ minWidth: 320, borderColor: "var(--textora-border-glass)" }}>
      <div className="flex items-center gap-1 p-2 pb-0">
        <div ref={inputGroupRef} className="relative flex-1">
        <input
          ref={inputRef}
          className="flex-1 px-2 py-1 border rounded bg-transparent text-xs"
          style={{ borderColor: "var(--textora-border)" }}
          placeholder={t("find.placeholder")}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              if (e.shiftKey) prev();
              else next();
            } else if (e.key === "Escape") {
              setOpen(false);
            }
          }}
        />
        {showHistory && searchHistory.length > 0 && (
          <div
            className="textora-card"
            style={{
              position: "absolute",
              top: "100%",
              left: 0,
              right: 0,
              zIndex: 70,
              maxHeight: 200,
              overflow: "auto",
              padding: "4px 0",
              marginTop: 2,
            }}
          >
            {searchHistory.map((h, i) => (
              <div
                key={h}
                className="px-3 py-1 cursor-pointer text-xs flex items-center gap-2"
                style={{ background: i === 0 ? "var(--textora-bg-muted)" : "transparent" }}
                onMouseDown={(e) => { e.preventDefault(); historySearch(h); }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "var(--textora-bg-muted)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                <span style={{ color: "var(--textora-fg-muted)", fontSize: 10 }}>↵</span>
                <span>{h}</span>
              </div>
            ))}
          </div>
        )}
        </div>
        <button
          className="text-xs px-1 rounded hover:bg-[var(--textora-bg-muted)]"
          style={{ color: "var(--textora-fg-muted)" }}
          onClick={() => setShowHistory(v => !v)}
          title="搜索历史"
        >
          ↓
        </button>
        <Toggle label=".*" title="正则" active={useRegex} onClick={() => setUseRegex((v) => !v)} />
        <Toggle
          label="Aa"
          title="区分大小写"
          active={caseSensitive}
          onClick={() => setCaseSensitive((v) => !v)}
        />
        <span className="text-xs px-1" style={{ color: "var(--textora-fg-muted)" }}>
          {matches.length === 0 ? "0/0" : `${index + 1}/${matches.length}`}
        </span>
        <button
          className="text-xs px-1 rounded hover:bg-[var(--textora-bg-muted)]"
          style={{ color: "var(--textora-fg-muted)" }}
          onClick={prev}
        >
          ‹
        </button>
        <button
          className="text-xs px-1 rounded hover:bg-[var(--textora-bg-muted)]"
          style={{ color: "var(--textora-fg-muted)" }}
          onClick={next}
        >
          ›
        </button>
        <button
          className="text-xs px-1 rounded hover:bg-[var(--textora-bg-muted)]"
          style={{ color: "var(--textora-fg-muted)" }}
          onClick={() => setShowReplace((v) => !v)}
          title="Toggle replace"
        >
          ≡
        </button>
        <button
          className="text-xs px-1 rounded hover:bg-[var(--textora-bg-muted)]"
          style={{ color: "var(--textora-fg-muted)" }}
          onClick={() => setOpen(false)}
        >
          ✕
        </button>
      </div>

      {showReplace && (
        <div className="flex items-center gap-1 p-2 pt-1">
          <input
            className="flex-1 px-2 py-1 border rounded bg-transparent text-xs"
            style={{ borderColor: "var(--textora-border)" }}
            placeholder={t("find.replace")}
            value={replacement}
            onChange={(e) => setReplacement(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setOpen(false);
            }}
          />
          <button
            className="text-xs px-1.5 py-0.5 rounded hover:bg-[var(--textora-bg-muted)]"
            style={{ color: "var(--textora-fg-muted)" }}
            onClick={replaceCurrent}
            disabled={!matches.length}
          >
            {t("find.replaceOne")}
          </button>
          <button
            className="text-xs px-1.5 py-0.5 rounded hover:bg-[var(--textora-bg-muted)]"
            style={{ color: "var(--textora-fg-muted)" }}
            onClick={replaceAll}
            disabled={!matches.length}
          >
            {t("find.replaceAll")}
          </button>
        </div>
      )}
    </div>
  );
}

