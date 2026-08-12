import { useEffect, useRef, useState } from "react";
import { invoke } from "../ipc";
import { useAppStore } from "../store/useAppStore";
import { useLocale, tFor } from "../i18n";
import { Toggle } from "./Toggle";

interface SearchHit {
  path: string;
  name: string;
  line: number;
  column: number;
  preview: string;
}

interface SearchResponse {
  matches: SearchHit[];
  truncated: boolean;
}

export function SearchInFiles() {
  const open = useAppStore((s) => s.searchInFilesOpen);
  const setOpen = useAppStore((s) => s.setSearchInFilesOpen);
  const workspaceRoot = useAppStore((s) => s.workspaceRoot);
  const locale = useLocale((s) => s.locale);
  const t = tFor(locale);

  const [query, setQuery] = useState("");
  const [useRegex, setUseRegex] = useState(false);
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [fileFilter] = useState("");
  const [excludeDirs] = useState("node_modules,.git");
  const inputRef = useRef<HTMLInputElement | null>(null);
  const debounceRef = useRef<number | null>(null);
  // 请求序号：丢弃过期响应，防止快速输入时旧结果覆盖新结果
  const searchSeqRef = useRef(0);

  useEffect(() => {
    if (open) {
      searchSeqRef.current++;
      setQuery("");
      setHits([]);
      setTruncated(false);
      setSearched(false);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  // 正则错误状态仅通过 setRegexError 写入，值本身不直接读取（保留历史接口）
  const [, setRegexError] = useState(false);

  const runSearch = (q: string) => {
    if (!workspaceRoot || !q.trim()) {
      setHits([]);
      setTruncated(false);
      setSearched(false);
      setRegexError(false);
      return;
    }
    if (useRegex) {
      try {
        new RegExp(q);
        setRegexError(false);
      } catch {
        setRegexError(true);
        setHits([]);
        setLoading(false);
        setSearched(true);
        return;
      }
    } else {
      setRegexError(false);
    }
    setLoading(true);
    setSearched(true);
    const seq = ++searchSeqRef.current;
    invoke<SearchResponse>("search_in_files", {
      root: workspaceRoot,
      query: q,
      useRegex,
      caseSensitive,
      fileFilter: fileFilter.trim(),
      excludeDirs: excludeDirs.trim(),
      maxResults: 500,
    })
      .then((response) => {
        if (seq !== searchSeqRef.current) return;
        // 对主进程返回的数据做空值兜底，避免渲染期抛错导致整页白屏
        const matches = (response?.matches ?? []).map((m) => ({
          path: m.path ?? "",
          name: m.name ?? "",
          line: m.line ?? 0,
          column: m.column ?? 0,
          preview: m.preview ?? "",
        }));
        setHits(matches);
        setTruncated(!!response?.truncated);
      })
      .catch(() => {
        if (seq !== searchSeqRef.current) return;
        // 主进程拒绝（如危险正则 ReDoS 防护）时给出可见提示
        setRegexError(true);
        setHits([]);
        setTruncated(false);
      })
      .finally(() => {
        if (seq === searchSeqRef.current) setLoading(false);
      });
  };

  useEffect(() => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => runSearch(query), 250);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [query, useRegex, caseSensitive]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!open) return null;

  const openHit = (h: SearchHit) => {
    void useAppStore.getState().openPathAtLine(h.path, h.line);
    setOpen(false);
  };

  return (
    <div
      className="textora-overlay-backdrop"
      style={{ paddingTop: "10vh", alignItems: "flex-start" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) setOpen(false);
      }}
    >
      <div className="textora-card" style={{ width: 680, maxWidth: "94vw", maxHeight: "76vh", display: "flex", flexDirection: "column" }}>
        <div className="flex items-center gap-1 p-2" style={{ borderBottom: "1px solid var(--textora-border)" }}>
          <input
            ref={inputRef}
            className="flex-1 px-2 py-1 border rounded bg-transparent text-xs"
            style={{ borderColor: "var(--textora-border)" }}
            placeholder={workspaceRoot ? t("search.workspacePlaceholder") : t("quickopen.noWorkspace")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setOpen(false);
            }}
            spellCheck={false}
          />
          <Toggle label=".*" title={t("search.regex")} active={useRegex} onClick={() => setUseRegex((v) => !v)} />
          <Toggle label="Aa" title={t("search.caseSensitive")} active={caseSensitive} onClick={() => setCaseSensitive((v) => !v)} />
        </div>
        <div style={{ flex: 1, overflow: "auto", minHeight: 120 }}>
          {!workspaceRoot && (
            <div className="px-3 py-3 text-xs" style={{ color: "var(--textora-fg-muted)" }}>
              {t("quickopen.noWorkspace")}
            </div>
          )}
          {workspaceRoot && !searched && (
            <div className="px-3 py-3 text-xs" style={{ color: "var(--textora-fg-muted)" }}>
              {t("search.startHint")}
            </div>
          )}
          {loading && (
            <div className="px-3 py-2 text-xs" style={{ color: "var(--textora-fg-muted)" }}>
              {t("search.searching")}
            </div>
          )}
          {!loading && searched && hits.length === 0 && (
            <div className="px-3 py-2 text-xs" style={{ color: "var(--textora-fg-muted)" }}>
              {t("search.noResults")}
            </div>
          )}
          {!loading &&
            hits.map((h, i) => (
              <div key={i} className="textora-search-hit" onClick={() => openHit(h)}>
                <div>
                  <span className="line-no">
                    {h.line}:{h.column}
                  </span>
                  <span style={{ color: "var(--textora-fg)" }}>{(h.preview || "").trim()}</span>
                </div>
                <div className="path">
                  {h.path ? h.path.split(/[\\/]/).slice(-2).join("/") : ""}
                </div>
              </div>
            ))}
        </div>
        {!loading && searched && hits.length > 0 && (
          <div className="px-3 py-1 text-xs" style={{ borderTop: "1px solid var(--textora-border)", color: "var(--textora-fg-muted)" }}>
            {t("search.resultCount").replace("{count}", String(hits.length))}
          </div>
        )}
        {!loading && searched && truncated && (
          <div className="px-3 py-1 text-xs" style={{ color: "var(--textora-fg-muted)" }}>
            Results truncated for performance.
          </div>
        )}
      </div>
    </div>
  );
}
