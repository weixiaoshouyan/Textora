/**
 * 文件树主组件：工作区头部、过滤输入、目录条目渲染。
 *  - Entry.tsx：节点组件
 *  - icons.tsx：图标集
 *  - utils.ts：过滤/防抖/路径复制工具
 */
import React, { useMemo, useState } from "react";
import { useAppStore } from "../../store/useAppStore";
import { useLocale, tFor } from "../../i18n";
import { openDialog } from "../../ipc";
import { normalizePath } from "../../store/helpers";
import { PlusIcon, FolderPlusIcon, SearchIcon, CloseIcon } from "./icons";
import { FilterContext, computeFilter, useDebouncedValue } from "./utils";
import { Entry } from "./Entry";

export function FileTree() {
  const workspaceRoot = useAppStore((s) => s.workspaceRoot);
  const entriesByDir = useAppStore((s) => s.entriesByDir);
  const openWorkspace = useAppStore((s) => s.openWorkspace);
  const createNewFile = useAppStore((s) => s.createNewFile);
  const createNewFolder = useAppStore((s) => s.createNewFolder);
  const locale = useLocale((s) => s.locale);
  const t = tFor(locale);
  const [busy, setBusy] = useState(false);
  const [rootCreating, setRootCreating] = useState<"file" | "folder" | null>(null);
  const [rootCreateName, setRootCreateName] = useState("");
  const [filterInput, setFilterInput] = useState("");
  const debouncedFilter = useDebouncedValue(filterInput.trim(), 150);
  const isFiltering = debouncedFilter.length > 0;

  const submitRootCreate = async () => {
    if (!rootCreateName.trim() || !workspaceRoot) {
      setRootCreating(null);
      return;
    }
    if (rootCreating === "file") {
      await createNewFile(workspaceRoot, rootCreateName.trim());
    } else if (rootCreating === "folder") {
      await createNewFolder(workspaceRoot, rootCreateName.trim());
    }
    setRootCreating(null);
  };

  const chooseDir = async () => {
    setBusy(true);
    try {
      const dir = await openDialog({ directory: true, multiple: false });
      if (typeof dir === "string") {
        await openWorkspace(dir);
      }
    } finally {
      setBusy(false);
    }
  };

  // Hooks 规则：所有 Hook 必须在 early return 之前无条件调用。
  // 无工作区时 rootKey 为 null，useMemo 内部做空值兜底。
  const rootKey = workspaceRoot ? normalizePath(workspaceRoot) : null;
  const filterState = useMemo(() => {
    if (!rootKey) {
      return { keyword: "", visiblePaths: new Set<string>(), autoExpandedDirs: new Set<string>() };
    }
    const { visiblePaths, autoExpandedDirs } = computeFilter(entriesByDir, rootKey, debouncedFilter);
    return { keyword: debouncedFilter, visiblePaths, autoExpandedDirs };
  }, [entriesByDir, rootKey, debouncedFilter]);

  if (!workspaceRoot) {
    return (
      <div
        className="text-xs p-4 flex flex-col items-center gap-2"
        style={{ color: "var(--textora-fg-muted)" }}
      >
        <p className="text-center">{t("filetree.noWorkspace")}</p>
        <button
          className="textora-btn text-xs"
          onClick={chooseDir}
          disabled={busy}
        >
          {t("filetree.openFolder")}
        </button>
      </div>
    );
  }

  const rootEntries = rootKey ? entriesByDir[rootKey] || [] : [];

  const visibleRootEntries = isFiltering
    ? rootEntries.filter((e) => filterState.visiblePaths.has(e.path))
    : rootEntries;

  return (
    <div className="text-xs" style={{ paddingBottom: 12 }}>
      {/* Workspace root header */}
      <div
        className="flex items-center justify-between px-2 py-[5px]"
        style={{
          color: "var(--textora-fg-muted)",
          borderBottom: "1px solid var(--textora-border)",
        }}
      >
        <span
          className="truncate font-medium"
          style={{ fontSize: 11.5, letterSpacing: "0.01em" }}
          title={workspaceRoot}
        >
          {workspaceRoot.split(/[\\/]/).filter(Boolean).pop() || workspaceRoot}
        </span>
        <button
          className="flex items-center justify-center rounded cursor-pointer"
          style={{
            width: 18,
            height: 18,
            color: "var(--textora-fg-muted)",
            background: "transparent",
            border: "none",
            transition: "background 0.15s ease",
            padding: 0,
          }}
          onClick={chooseDir}
          title={workspaceRoot}
          onMouseEnter={(e) => (e.currentTarget.style.background = "var(--textora-bg-muted)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
        >
          <PlusIcon />
        </button>
      </div>

      {/* Inline creation input */}
      {rootCreating && (
        <div className="px-2 py-1" style={{ borderBottom: "1px solid var(--textora-border)" }}>
          <input
            className="w-full px-1.5 py-[2px] text-xs rounded bg-transparent outline-none"
            style={{
              border: "1px solid var(--textora-accent)",
              color: "var(--textora-fg)",
              fontSize: 12,
              lineHeight: "18px",
            }}
            placeholder={rootCreating === "file" ? "untitled.md" : "new-folder"}
            value={rootCreateName}
            autoFocus
            onChange={(e) => setRootCreateName(e.target.value)}
            onBlur={submitRootCreate}
            onKeyDown={(e) => {
              if (e.key === "Enter") submitRootCreate();
              if (e.key === "Escape") setRootCreating(null);
            }}
          />
        </div>
      )}

      {/* New file / folder buttons */}
      <div
        className="flex items-center gap-0.5 px-2 py-[4px]"
        style={{ borderBottom: "1px solid var(--textora-border)" }}
      >
        <button
          className="flex items-center gap-1 text-xs px-1.5 py-[2px] rounded cursor-pointer"
          style={{
            color: "var(--textora-fg-muted)",
            background: "transparent",
            border: "none",
            fontSize: 11.5,
            transition: "background 0.15s ease",
          }}
          onClick={() => { setRootCreateName("untitled.md"); setRootCreating("file"); }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "var(--textora-bg-muted)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
        >
          <PlusIcon /> {t("filetree.addFile")}
        </button>
        <button
          className="flex items-center gap-1 text-xs px-1.5 py-[2px] rounded cursor-pointer"
          style={{
            color: "var(--textora-fg-muted)",
            background: "transparent",
            border: "none",
            fontSize: 11.5,
            transition: "background 0.15s ease",
          }}
          onClick={() => { setRootCreateName("new-folder"); setRootCreating("folder"); }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "var(--textora-bg-muted)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
        >
          <FolderPlusIcon /> {t("filetree.addFolder")}
        </button>
      </div>

      {/* Filter input */}
      <div
        className="flex items-center gap-1.5 px-2 py-[5px]"
        style={{ borderBottom: "1px solid var(--textora-border)" }}
      >
        <SearchIcon />
        <input
          className="flex-1 bg-transparent outline-none"
          style={{
            color: "var(--textora-fg)",
            fontSize: 12,
            lineHeight: "18px",
            border: "none",
          }}
          placeholder={t("filetree.filter")}
          value={filterInput}
          onChange={(e) => setFilterInput(e.target.value)}
        />
        {filterInput && (
          <button
            className="flex items-center justify-center rounded cursor-pointer"
            style={{
              width: 16,
              height: 16,
              color: "var(--textora-fg-muted)",
              background: "transparent",
              border: "none",
              padding: 0,
              transition: "background 0.15s ease",
              flexShrink: 0,
            }}
            onClick={() => setFilterInput("")}
            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--textora-bg-muted)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
          >
            <CloseIcon />
          </button>
        )}
      </div>

      {/* Tree entries */}
      <FilterContext.Provider value={filterState}>
        <div style={{ paddingTop: 2 }} role="tree" aria-label={workspaceRoot}>
          {visibleRootEntries.map((e) => (
            <Entry key={e.path} entry={e} depth={0} />
          ))}
        </div>
      </FilterContext.Provider>
    </div>
  );
}
