/**
 * 文件树工具：过滤（关键词高亮 / 可见路径计算）、防抖、路径复制。
 */
import React, { createContext, useContext, useEffect, useState } from "react";
import type { DirEntry } from "../../store/useAppStore";
import { normalizePath } from "../../store/helpers";

export interface FilterState {
  keyword: string;
  visiblePaths: Set<string>;
  autoExpandedDirs: Set<string>;
}

export async function copyPathToClipboard(path: string) {
  try {
    await navigator.clipboard.writeText(path);
  } catch {
    // Tauri webview 可能需要 fallback：用 document.execCommand
    const ta = document.createElement("textarea");
    ta.value = path;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand("copy");
    } catch {
      /* ignore */
    }
    document.body.removeChild(ta);
  }
}

export function collectVisiblePaths(
  entriesByDir: Record<string, DirEntry[]>,
  expanded: Record<string, boolean>,
  rootKey: string,
  extraExpanded?: Set<string>,
  visibleOnly?: Set<string>
): string[] {
  const out: string[] = [];
  const walk = (dirKey: string) => {
    const list = entriesByDir[dirKey] || [];
    for (const e of list) {
      if (visibleOnly && !visibleOnly.has(e.path)) continue;
      out.push(e.path);
      const k = normalizePath(e.path);
      if (e.is_dir && (expanded[k] || extraExpanded?.has(k))) {
        walk(k);
      }
    }
  };
  walk(rootKey);
  return out;
}

export const FilterContext = createContext<FilterState>({
  keyword: "",
  visiblePaths: new Set(),
  autoExpandedDirs: new Set(),
});

export function useFilter(): FilterState {
  return useContext(FilterContext);
}

export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}

export function computeFilter(
  entriesByDir: Record<string, DirEntry[]>,
  rootKey: string,
  keyword: string
): { visiblePaths: Set<string>; autoExpandedDirs: Set<string> } {
  const visiblePaths = new Set<string>();
  const autoExpandedDirs = new Set<string>();
  if (!keyword) return { visiblePaths, autoExpandedDirs };

  const kw = keyword.toLowerCase();

  const walk = (entry: DirEntry): boolean => {
    const key = normalizePath(entry.path);
    const nameMatch = entry.name.toLowerCase().includes(kw);

    let descendantMatch = false;
    if (entry.is_dir) {
      const list = entriesByDir[key] || [];
      for (const child of list) {
        if (walk(child)) descendantMatch = true;
      }
    }

    if (nameMatch || descendantMatch) {
      visiblePaths.add(entry.path);
      if (entry.is_dir && descendantMatch) autoExpandedDirs.add(key);
      return true;
    }
    return false;
  };

  const rootList = entriesByDir[rootKey] || [];
  for (const e of rootList) walk(e);

  return { visiblePaths, autoExpandedDirs };
}

export function HighlightedName({ name, keyword }: { name: string; keyword: string }) {
  if (!keyword) return <>{name}</>;
  const kw = keyword.toLowerCase();
  const lower = name.toLowerCase();
  const parts: React.ReactNode[] = [];
  let i = 0;
  let keyIdx = 0;
  while (i < name.length) {
    const idx = lower.indexOf(kw, i);
    if (idx === -1) {
      parts.push(name.slice(i));
      break;
    }
    if (idx > i) parts.push(name.slice(i, idx));
    parts.push(
      <mark
        key={keyIdx++}
        style={{
          background: "color-mix(in srgb, var(--textora-accent) 28%, transparent)",
          color: "inherit",
          borderRadius: 2,
          padding: "0 1px",
        }}
      >
        {name.slice(idx, idx + kw.length)}
      </mark>
    );
    i = idx + kw.length;
  }
  return <>{parts}</>;
}
