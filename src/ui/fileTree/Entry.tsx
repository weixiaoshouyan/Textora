/**
 * 文件树节点组件：展开/折叠、重命名、右键菜单、新建、键盘导航。
 * 使用细粒度 store 订阅，大目录下展开/收起不触发全树重渲染。
 */
import React, { useState } from "react";
import { useAppStore, type DirEntry } from "../../store/useAppStore";
import { useLocale, tFor } from "../../i18n";
import { MenuItem } from "../MenuItem";
import { normalizePath } from "../../store/helpers";
import { ChevronIcon, FolderIcon, FileIcon, PlusIcon, RefreshIcon, FolderPlusIcon } from "./icons";
import { copyPathToClipboard, collectVisiblePaths, useFilter, HighlightedName } from "./utils";

// 模块级稳定引用：目录无条目时避免 selector 每次返回新数组导致重渲染
const EMPTY_DIR_ENTRIES: DirEntry[] = [];

export function Entry({
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
