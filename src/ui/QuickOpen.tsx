import { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "../ipc";
import { useAppStore } from "../store/useAppStore";
import { useLocale, tFor } from "../i18n";
import { useFocusTrap } from "../hooks/useFocusTrap";

interface FileEntry {
  name: string;
  path: string;
  rel_path: string;
  ext: string;
}

export function QuickOpen() {
  const open = useAppStore((s) => s.quickOpenOpen);
  const setOpen = useAppStore((s) => s.setQuickOpenOpen);
  const workspaceRoot = useAppStore((s) => s.workspaceRoot);
  const openPath = useAppStore((s) => s.openPath);
  const locale = useLocale((s) => s.locale);
  const t = tFor(locale);

  const [query, setQuery] = useState("");
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  useFocusTrap(containerRef, open);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setIndex(0);
    if (!workspaceRoot) {
      setFiles([]);
      return;
    }
    setLoading(true);
    invoke<FileEntry[]>("list_all_files", { root: workspaceRoot })
      .then((list) => setFiles(list))
      .catch(() => setFiles([]))
      .finally(() => setLoading(false));
  }, [open, workspaceRoot]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return files.slice(0, 50);
    return files
      .map((f) => {
        const target = (f.name + " " + f.rel_path).toLowerCase();
        const score = fuzzyScore(q, target);
        return { f, score };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 50)
      .map((x) => x.f);
  }, [files, query]);

  useEffect(() => {
    setIndex(0);
  }, [query]);

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(
      `[data-idx="${index}"]`
    );
    el?.scrollIntoView({ block: "nearest" });
  }, [index]);

  const choose = (path: string) => {
    void openPath(path);
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const item = filtered[index];
      if (item) choose(item.path);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]"
      style={{ background: "rgba(0,0,0,0.25)" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) setOpen(false);
      }}
    >
      <div
        ref={containerRef}
        className="textora-card w-[480px] max-w-[90vw] overflow-hidden"
        style={{ background: "var(--textora-bg-elev)" }}
      >
        <input
          ref={inputRef}
          className="w-full px-3 py-2 bg-transparent outline-none border-b text-xs"
          style={{ borderColor: "var(--textora-border)" }}
          placeholder={
            workspaceRoot
              ? t("quickopen.placeholder")
              : t("quickopen.noWorkspace")
          }
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          spellCheck={false}
        />
        <div
          ref={listRef}
          className="max-h-[50vh] overflow-auto"
          style={{ minHeight: 32 }}
        >
          {loading && (
            <div className="px-3 py-2 text-xs" style={{ color: "var(--textora-fg-muted)" }}>
              {t("quickopen.loading")}
            </div>
          )}
          {!loading && !workspaceRoot && (
            <div className="px-3 py-2 text-xs" style={{ color: "var(--textora-fg-muted)" }}>
              {t("quickopen.noWorkspace")}
            </div>
          )}
          {!loading && workspaceRoot && filtered.length === 0 && (
            <div className="px-3 py-2 text-xs" style={{ color: "var(--textora-fg-muted)" }}>
              {t("quickopen.noResults")}
            </div>
          )}
          {!loading &&
            filtered.map((f, i) => (
              <div
                key={f.path}
                data-idx={i}
                className="flex items-center gap-2 px-3 py-1.5 text-xs cursor-pointer"
                style={{
                  background: i === index ? "var(--textora-bg-muted)" : "transparent",
                }}
                onMouseEnter={() => setIndex(i)}
                onClick={() => choose(f.path)}
              >
                <span className="truncate flex-1" style={{ color: "var(--textora-fg)" }}>{f.name}</span>
                <span
                  className="text-xs truncate"
                  style={{ color: "var(--textora-fg-muted)", maxWidth: 200, fontSize: 11 }}
                  title={f.rel_path}
                >
                  {f.rel_path}
                </span>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}

function fuzzyScore(query: string, target: string): number {
  if (!query) return 1;
  let qi = 0;
  let score = 0;
  let consecutive = 0;
  for (let ti = 0; ti < target.length && qi < query.length; ti++) {
    if (target[ti] === query[qi]) {
      qi++;
      consecutive++;
      score += 1 + consecutive;
      if (ti === 0 || target[ti - 1] === "/" || target[ti - 1] === " ") {
        score += 5;
      }
    } else {
      consecutive = 0;
    }
  }
  return qi === query.length ? score : 0;
}
