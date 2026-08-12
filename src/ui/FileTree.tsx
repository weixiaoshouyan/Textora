import { useState, useEffect, useMemo, createContext, useContext } from "react";
import { useAppStore, type DirEntry } from "../store/useAppStore";
import { useLocale, tFor } from "../i18n";
import { openDialog } from "../ipc";
import { MenuItem } from "./MenuItem";
import { normalizePath } from "../store/helpers";

async function copyPathToClipboard(path: string) {
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

function collectVisiblePaths(
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

// ===== Filter =====

interface FilterState {
  keyword: string;
  visiblePaths: Set<string>;
  autoExpandedDirs: Set<string>;
}

const FilterContext = createContext<FilterState>({
  keyword: "",
  visiblePaths: new Set(),
  autoExpandedDirs: new Set(),
});

function useFilter(): FilterState {
  return useContext(FilterContext);
}

/** 防抖 hook */
function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}

/**
 * 递归计算过滤后应显示的路径集合 + 应自动展开的目录集合。
 * 仅基于当前已加载（entriesByDir）的数据进行过滤。
 * 返回 true 表示该 entry 自身或其后代匹配关键词。
 */
function computeFilter(
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

/** 高亮匹配关键词的文件名 */
function HighlightedName({ name, keyword }: { name: string; keyword: string }) {
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

// ===== SVG Icons =====

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 10 10"
      fill="none"
      style={{
        transition: "transform 0.15s ease",
        transform: open ? "rotate(90deg)" : "rotate(0deg)",
        flexShrink: 0,
      }}
    >
      <path
        d="M3.5 2L6.5 5L3.5 8"
        stroke="var(--textora-fg-muted)"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function FolderIcon({ open }: { open: boolean }) {
  return open ? (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0 }}>
      <path
        d="M1 3.5C1 2.67 1.67 2 2.5 2H5.2c.4 0 .78.17 1.06.47l.44.53c.28.3.66.47 1.06.47H11c.55 0 1 .45 1 1v.5H2.75c-.54 0-1.04.27-1.34.72L1 6.5V3.5Z"
        fill="var(--textora-accent)"
        opacity="0.7"
      />
      <path
        d="M1 6.5C1 5.67 1.67 5 2.5 5H11.5C12.33 5 13 5.67 13 6.5V10.5C13 11.33 12.33 12 11.5 12H2.5C1.67 12 1 11.33 1 10.5V6.5Z"
        fill="var(--textora-accent)"
        opacity="0.5"
      />
    </svg>
  ) : (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0 }}>
      <path
        d="M2.5 2H5.2c.4 0 .78.17 1.06.47l.44.53c.28.3.66.47 1.06.47H11c.55 0 1 .45 1 1V10.5c0 .83-.67 1.5-1.5 1.5h-9C1.67 12 1 11.33 1 10.5V3.5C1 2.67 1.67 2 2.5 2Z"
        fill="var(--textora-accent)"
        opacity="0.5"
      />
    </svg>
  );
}

function FileIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0 }}>
      <path
        d="M4 1h4.5L12 4.5V12c0 .55-.45 1-1 1H4c-.55 0-1-.45-1-1V2c0-.55.45-1 1-1Z"
        fill="var(--textora-fg-muted)"
        opacity="0.35"
      />
      <path
        d="M8.5 1v3.5H12"
        stroke="var(--textora-fg-muted)"
        strokeOpacity="0.5"
        strokeWidth="0.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
      <path d="M5 1.5V8.5M1.5 5H8.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

function RefreshIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
      <path
        d="M8.25 5A3.25 3.25 0 1 1 7.7 3.2"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
      <path d="M8.5 1.5V3.5H6.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function FolderPlusIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
      <path
        d="M1 3.5C1 2.67 1.67 2 2.5 2H5.2c.4 0 .78.17 1.06.47l.44.53c.28.3.66.47 1.06.47H9c.55 0 1 .45 1 1V4H2.75c-.54 0-1.04.27-1.34.72L1 5.5V3.5Z"
        fill="currentColor"
        opacity="0.6"
      />
      <circle cx="7" cy="7" r="2.5" fill="var(--textora-bg-elev)" stroke="currentColor" strokeWidth="1" />
      <path d="M7 5.75V8.25M5.75 7H8.25" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ flexShrink: 0 }}>
      <circle cx="5" cy="5" r="3.2" stroke="var(--textora-fg-muted)" strokeWidth="1.2" />
      <path d="M7.5 7.5L10 10" stroke="var(--textora-fg-muted)" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
      <path d="M2 2L8 8M8 2L2 8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

// ===== Entry Component =====

// 模块级稳定引用：目录无条目时避免 selector 每次返回新数组导致重渲染
const EMPTY_DIR_ENTRIES: DirEntry[] = [];

function Entry({
  entry,
  depth,
}: {
  entry: DirEntry;
  depth: number;
}) {
  // 细粒度订阅：只关心本节点相关的状态（本目录是否展开/本目录条目/本节点是否选中）。
  // 直接订阅整个 expanded/entriesByDir 对象时，展开任意目录会触发全部节点重渲染——
  // 大目录树（上千节点）下每次展开/收起都卡顿。
  const key = normalizePath(entry.path);
  const isExpanded = useAppStore((s) => !!s.expanded[key]);
  const toggleExpanded = useAppStore((s) => s.toggleExpanded);
  const allChildren = useAppStore((s) => s.entriesByDir[key] ?? EMPTY_DIR_ENTRIES);
  const isSelected = useAppStore((s) => s.selectedPath === entry.path);
  const selectPath = useAppStore((s) => s.selectPath);
  const openPath = useAppStore((s) => s.openPath);
  const checkBeforeOpen = useAppStore((s) => s.checkBeforeOpen);
  const workspaceRoot = useAppStore((s) => s.workspaceRoot);
  const loadDir = useAppStore((s) => s.loadDir);
  const renameItem = useAppStore((s) => s.renameItem);
  const removeItem = useAppStore((s) => s.removeItem);
  const createNewFile = useAppStore((s) => s.createNewFile);
  const createNewFolder = useAppStore((s) => s.createNewFolder);

  const locale = useLocale((s) => s.locale);
  const t = tFor(locale);

  const filter = useFilter();
  const isFiltering = filter.keyword.length > 0;

  const [renaming, setRenaming] = useState(false);
  const [newName, setNewName] = useState(entry.name);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState({ x: 0, y: 0 });
  const [creating, setCreating] = useState<"file" | "folder" | null>(null);
  const [createName, setCreateName] = useState("");

  const isDir = entry.is_dir;
  const isOpen = isExpanded || (isFiltering && filter.autoExpandedDirs.has(key));
  const children = isFiltering
    ? allChildren.filter((c) => filter.visiblePaths.has(c.path))
    : allChildren;

  const onClickRow = async () => {
    selectPath(entry.path);
    if (!isDir) {
      const ok = await checkBeforeOpen(entry.path);
      if (ok) await openPath(entry.path);
    } else {
      // 过滤状态下，被自动展开的目录由过滤器控制，不响应手动折叠
      if (isFiltering && filter.autoExpandedDirs.has(key)) return;
      await toggleExpanded(entry.path);
    }
  };

  const onContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setMenuPos({ x: e.clientX, y: e.clientY });
    setMenuOpen(true);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    // 收集当前可见路径列表，按 selectedPath 定位
    const ws = useAppStore.getState().workspaceRoot;
    if (!ws) return;
    const rootKey = normalizePath(ws);
    const visible = collectVisiblePaths(
      useAppStore.getState().entriesByDir,
      useAppStore.getState().expanded,
      rootKey,
      isFiltering ? filter.autoExpandedDirs : undefined,
      isFiltering ? filter.visiblePaths : undefined
    );
    const cur = entry.path;
    const idx = visible.indexOf(cur);
    if (idx === -1) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      const next = visible[idx + 1];
      if (next) {
        selectPath(next);
        // 让目标行获取焦点
        const el = document.querySelector(`[data-ft-path="${CSS.escape(next)}"]`) as HTMLElement | null;
        el?.focus();
      }
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      const prev = visible[idx - 1];
      if (prev) {
        selectPath(prev);
        const el = document.querySelector(`[data-ft-path="${CSS.escape(prev)}"]`) as HTMLElement | null;
        el?.focus();
      }
    } else if (e.key === "ArrowRight" && isDir && !isOpen) {
      e.preventDefault();
      if (!(isFiltering && filter.autoExpandedDirs.has(key))) void toggleExpanded(entry.path);
    } else if (e.key === "ArrowLeft" && isDir && isOpen) {
      e.preventDefault();
      if (!(isFiltering && filter.autoExpandedDirs.has(key))) void toggleExpanded(entry.path);
    } else if (e.key === "Enter") {
      e.preventDefault();
      void onClickRow();
    } else if (e.key === "F2") {
      e.preventDefault();
      setRenaming(true);
    } else if (e.key === "Delete") {
      e.preventDefault();
      void removeItem(entry.path);
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "c" && !isDir) {
      // Ctrl+C 复制路径（仅文件）
      e.preventDefault();
      void copyPathToClipboard(entry.path);
    }
  };

  const submitRename = async () => {
    if (newName && newName !== entry.name) {
      await renameItem(entry.path, newName);
    }
    setRenaming(false);
  };

  const submitCreate = async () => {
    if (!createName.trim() || !workspaceRoot) {
      setCreating(null);
      return;
    }
    if (creating === "file") {
      await createNewFile(entry.path, createName.trim());
    } else if (creating === "folder") {
      await createNewFolder(entry.path, createName.trim());
    }
    setCreating(null);
  };

  return (
    <div>
      <div
        className="group flex items-center gap-1 pr-1 py-[3px] rounded-[4px] cursor-pointer select-none"
        style={{
          marginLeft: depth * 12 + 4,
          marginRight: 4,
          paddingLeft: isDir ? 2 : 4,
          background: isSelected
            ? "color-mix(in srgb, var(--textora-accent) 12%, transparent)"
            : "transparent",
          transition: "background 0.15s ease",
          outline: isSelected ? "1px solid color-mix(in srgb, var(--textora-accent) 30%, transparent)" : "none",
          outlineOffset: -1,
        }}
        tabIndex={isSelected ? 0 : -1}
        data-ft-path={entry.path}
        role="treeitem"
        aria-expanded={isDir ? isOpen : undefined}
        aria-selected={isSelected}
        onClick={onClickRow}
        onContextMenu={onContextMenu}
        onKeyDown={onKeyDown}
        onDoubleClick={() => setRenaming(true)}
        title={entry.path}
      >
        {isDir ? (
          <ChevronIcon open={isOpen} />
        ) : (
          <span style={{ width: 10, flexShrink: 0 }} />
        )}

        <span className="flex items-center justify-center" style={{ width: 16, flexShrink: 0 }}>
          {isDir ? <FolderIcon open={isOpen} /> : <FileIcon />}
        </span>

        {renaming ? (
          <input
            className="flex-1 px-1.5 py-[1px] text-xs rounded bg-transparent outline-none"
            style={{
              border: "1px solid var(--textora-accent)",
              color: "var(--textora-fg)",
              fontSize: 12,
              lineHeight: "18px",
            }}
            value={newName}
            autoFocus
            onChange={(e) => setNewName(e.target.value)}
            onBlur={submitRename}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter") submitRename();
              if (e.key === "Escape") setRenaming(false);
            }}
          />
        ) : (
          <span
            className="truncate flex-1"
            style={{
              fontSize: 12.5,
              color: isDir ? "var(--textora-fg-muted)" : "var(--textora-fg)",
              fontWeight: isSelected && !isDir ? 500 : 400,
              transition: "color 0.15s ease",
            }}
          >
            {isFiltering ? <HighlightedName name={entry.name} keyword={filter.keyword} /> : entry.name}
          </span>
        )}

        {/* Hover-only action buttons */}
        {isDir && (
          <span
            className="flex items-center gap-[2px] opacity-0 group-hover:opacity-100"
            style={{
              transition: "opacity 0.15s ease",
              flexShrink: 0,
            }}
          >
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
              onClick={async (e) => {
                e.stopPropagation();
                await loadDir(entry.path);
              }}
              title={t("filetree.refresh")}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--textora-bg-muted)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              <RefreshIcon />
            </button>
          </span>
        )}
      </div>

      {/* Context menu */}
      {menuOpen && (
        <div
          className="fixed inset-0 z-50"
          onClick={() => setMenuOpen(false)}
        >
          <div
            className="fixed rounded-[8px] py-1.5 text-[12px]"
            style={{
              left: menuPos.x,
              top: menuPos.y,
              background: "var(--textora-bg-elev)",
              border: "1px solid var(--textora-border)",
              boxShadow: "0 4px 16px rgba(0,0,0,0.12), 0 1px 4px rgba(0,0,0,0.08)",
              minWidth: 140,
              overflow: "hidden",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {isDir && (
              <>
                <MenuItem
                  onClick={() => { setMenuOpen(false); setCreateName("untitled.md"); setCreating("file"); }}
                  icon={<PlusIcon />}
                >
                  {t("filetree.newFile")}
                </MenuItem>
                <MenuItem
                  onClick={() => { setMenuOpen(false); setCreateName("new-folder"); setCreating("folder"); }}
                  icon={<FolderPlusIcon />}
                >
                  {t("filetree.newFolder")}
                </MenuItem>
                <DropdownDivider />
              </>
            )}
            <MenuItem
              onClick={() => { setMenuOpen(false); void copyPathToClipboard(entry.path); }}
            >
              {t("filetree.copyPath")}
            </MenuItem>
            <DropdownDivider />
            <MenuItem
              onClick={() => { setMenuOpen(false); setRenaming(true); }}
            >
              {t("filetree.rename")}
            </MenuItem>
            <MenuItem
              onClick={async () => {
                setMenuOpen(false);
                await removeItem(entry.path);
              }}
            >
              {t("filetree.delete")}
            </MenuItem>
          </div>
        </div>
      )}

      {/* Children */}
      {isDir && isOpen && (
        <div>
          {children.map((c) => (
            <Entry key={c.path} entry={c} depth={depth + 1} />
          ))}
          {creating && (
            <div
              style={{
                paddingLeft: (depth + 1) * 12 + 28,
                paddingRight: 8,
                paddingTop: 2,
                paddingBottom: 2,
              }}
            >
              <input
                className="w-full px-1.5 py-[1px] text-xs rounded bg-transparent outline-none"
                style={{
                  border: "1px solid var(--textora-accent)",
                  color: "var(--textora-fg)",
                  fontSize: 12,
                  lineHeight: "18px",
                }}
                value={createName}
                autoFocus
                onChange={(e) => setCreateName(e.target.value)}
                onBlur={submitCreate}
                onKeyDown={(e) => {
                  if (e.key === "Enter") submitCreate();
                  if (e.key === "Escape") setCreating(null);
                }}
              />
            </div>
          )}
          {children.length === 0 && !creating && (
            <div
              className="italic py-[3px]"
              style={{
                color: "var(--textora-fg-muted)",
                paddingLeft: (depth + 1) * 12 + 28,
                fontSize: 11.5,
              }}
            >
              {t("filetree.empty")}
            </div>
          )}
        </div>
      )}
    </div>
  );
}


function DropdownDivider() {
  return (
    <div style={{ padding: "4px 0" }}>
      <hr style={{ margin: "0", border: "none", borderTop: "1px solid var(--textora-border)" }} />
    </div>
  );
}

// ===== FileTree Component =====

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
