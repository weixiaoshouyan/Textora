/**
 * 顶栏主组件：菜单（文件 / 视图）、文档标题、右侧图标按钮。
 * 子组件（菜单项 / 图标）见 ./items.tsx。
 */
import React, { useRef, useEffect, useMemo, useState } from "react";
import { useAppStore } from "../../store/useAppStore";
import { exportAsHTML, exportAsPDF, exportAsDOCX, exportAsPNG, copyHtmlToClipboard } from "../../editor/exporter";
import { openDialog, message } from "../../ipc";
import { useLocale, tFor } from "../../i18n";
import { SHORTCUTS, getBinding, formatBinding, loadCustomBindings } from "../../hooks/shortcutSchema";
import { MenuBarItem, DropdownItem, DropdownDivider, IconButton, SearchIcon, CommandIcon, AiIcon, ThemeIcon } from "./items";

export function TopBar() {
  const currentName = useAppStore((s) => s.currentName);
  const dirty = useAppStore((s) => s.dirty);
  const theme = useAppStore((s) => s.theme);
  const settings = useAppStore((s) => s.settings);
  const settingsPanelOpen = useAppStore((s) => s.settingsPanelOpen);
  const newFile = useAppStore((s) => s.newFile);
  const openFile = useAppStore((s) => s.openFile);
  const saveFile = useAppStore((s) => s.saveFile);
  const toggleTheme = useAppStore((s) => s.toggleTheme);
  const setSettingsPanelOpen = useAppStore((s) => s.setSettingsPanelOpen);
  const setFindReplaceOpen = useAppStore((s) => s.setFindReplaceOpen);
  const setAiAssistantOpen = useAppStore((s) => s.setAiAssistantOpen);
  const setQuickOpenOpen = useAppStore((s) => s.setQuickOpenOpen);

  const locale = useLocale((s) => s.locale);
  const t = tFor(locale);

  // 快捷键标签（设置面板关闭后刷新）
  const scLabels = useMemo(() => {
    const custom = loadCustomBindings();
    const labels: Record<string, string> = {};
    for (const def of SHORTCUTS) {
      labels[def.id] = formatBinding(getBinding(def, custom));
    }
    return labels;
    // settingsPanelOpen 变化时重新计算（面板关闭后绑定可能已更新）——有意的依赖
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settingsPanelOpen]);

  const [fileMenuOpen, setFileMenuOpen] = useState(false);
  const [viewMenuOpen, setViewMenuOpen] = useState(false);
  const fileMenuRef = useRef<HTMLDivElement>(null);
  const viewMenuRef = useRef<HTMLDivElement>(null);

  // Close menus on outside click
  useEffect(() => {
    if (!fileMenuOpen && !viewMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (fileMenuRef.current && !fileMenuRef.current.contains(e.target as Node)) {
        setFileMenuOpen(false);
      }
      if (viewMenuRef.current && !viewMenuRef.current.contains(e.target as Node)) {
        setViewMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [fileMenuOpen, viewMenuOpen]);

  return (
    <header
      className="flex items-center px-2 select-none shrink-0"
      style={{
        height: 32,
        background: "var(--textora-bg-elev)",
        borderBottom: "1px solid var(--textora-border)",
      }}
      data-tauri-drag-region
    >
      {/* Left: menu labels */}
      <div className="flex items-center gap-0" data-tauri-drag-region={false}>
        <MenuBarItem
          label={t("menu.file")}
          open={fileMenuOpen}
          onToggle={() => { setFileMenuOpen((v) => !v); setViewMenuOpen(false); }}
          ref={fileMenuRef}
        >
          <DropdownItem label={t("new")} shortcut={scLabels["file.new"]} onClick={() => { setFileMenuOpen(false); newFile(); }} />
          <DropdownItem label={t("open")} shortcut={scLabels["file.open"]} onClick={() => { setFileMenuOpen(false); void openFile(); }} />
          <DropdownItem
            label={t("menu.openFolder")}
            onClick={() => {
              setFileMenuOpen(false);
              void (async () => {
                const dir = await openDialog({ directory: true, multiple: false });
                if (typeof dir === "string") {
                  await useAppStore.getState().openWorkspace(dir);
                }
              })();
            }}
          />
          <DropdownItem label={t("save")} shortcut={scLabels["file.save"]} onClick={() => { setFileMenuOpen(false); void saveFile(); }} />
          <DropdownItem label={t("saveAs")} shortcut={scLabels["file.saveAs"]} onClick={() => { setFileMenuOpen(false); void useAppStore.getState().saveFileAs(); }} />
          <DropdownDivider />
          <DropdownItem label={t("export.pdf")} onClick={() => { setFileMenuOpen(false); void exportAsPDF(); }} />
          <DropdownItem label={t("export.html")} onClick={() => { setFileMenuOpen(false); void exportAsHTML(); }} />
          <DropdownItem label={t("export.docx")} onClick={() => { setFileMenuOpen(false); void exportAsDOCX(); }} />
          <DropdownItem label={t("export.png")} onClick={() => { setFileMenuOpen(false); void exportAsPNG(); }} />
          <DropdownItem
            label={t("export.copyHtml")}
            onClick={() => {
              setFileMenuOpen(false);
              void (async () => {
                const ok = await copyHtmlToClipboard();
                await message(ok ? t("export.copyHtmlDone") : t("export.copyHtmlFailed"), {
                  title: t("export.copyHtml"),
                  kind: ok ? "info" : "error",
                });
              })();
            }}
          />
          <DropdownDivider />
          <DropdownItem label={t("diff.compareFiles")} onClick={() => { setFileMenuOpen(false); useAppStore.getState().setDiffViewOpen(true); }} />
          <DropdownDivider />
          <DropdownItem
            label={t("menu.settings")}
            shortcut={scLabels["app.openSettings"]}
            onClick={() => { setFileMenuOpen(false); setSettingsPanelOpen(true); }}
          />
        </MenuBarItem>
        <MenuBarItem
          label={t("menu.view")}
          open={viewMenuOpen}
          onToggle={() => { setViewMenuOpen((v) => !v); setFileMenuOpen(false); }}
          ref={viewMenuRef}
        >
          <DropdownItem
            label={t("source")}
            shortcut={scLabels["view.toggleSource"]}
            checked={settings.sourceMode}
            onClick={() => { setViewMenuOpen(false); useAppStore.getState().toggleSource(); }}
          />
          <DropdownItem
            label={t("settings.readingMode")}
            shortcut={scLabels["view.toggleReading"]}
            checked={settings.readingMode}
            onClick={() => { setViewMenuOpen(false); useAppStore.getState().toggleReading(); }}
          />
          <DropdownDivider />
          <DropdownItem
            label={t("typewriter")}
            shortcut={scLabels["view.toggleTypewriter"]}
            checked={settings.typewriterMode}
            onClick={() => { setViewMenuOpen(false); useAppStore.getState().toggleTypewriter(); }}
          />
          <DropdownItem
            label={t("focus")}
            shortcut={scLabels["view.toggleFocus"]}
            checked={settings.focusMode}
            onClick={() => { setViewMenuOpen(false); useAppStore.getState().toggleFocus(); }}
          />
          <DropdownDivider />
          <DropdownItem
            label={t("sidebar")}
            shortcut={scLabels["view.toggleSidebar"]}
            checked={settings.sidebarVisible}
            onClick={() => { setViewMenuOpen(false); useAppStore.getState().toggleSidebar(); }}
          />
          <DropdownItem
            label={t("outline")}
            checked={settings.outlineVisible}
            onClick={() => { setViewMenuOpen(false); useAppStore.getState().toggleOutline(); }}
          />
        </MenuBarItem>
      </div>

      {/* Center: document title with dirty indicator */}
      <div
        className="flex-1 flex items-center justify-center px-4 truncate"
        style={{ fontSize: 12, color: "var(--textora-fg-muted)" }}
      >
        {currentName && (
          <span className="truncate">
            {currentName}
            {dirty && <span style={{ marginLeft: 4, color: "var(--textora-fg)" }}>{"\u2022"}</span>}
          </span>
        )}
      </div>

      {/* Right: icon buttons */}
      <div className="flex items-center gap-0" data-tauri-drag-region={false}>
        <IconButton
          onClick={() => setFindReplaceOpen(true)}
          title={`${t("find")} (Ctrl+F)`}
          ariaLabel={t("find")}
        >
          <SearchIcon />
        </IconButton>
        <IconButton
          onClick={() => setQuickOpenOpen(true)}
          title={`${t("sc.quickOpen")} (Ctrl+P)`}
          ariaLabel={t("sc.quickOpen")}
        >
          <CommandIcon />
        </IconButton>
        <div className="w-px mx-1" style={{ height: 14, background: "var(--textora-border)" }} />
        <IconButton onClick={toggleTheme} title={t("theme")} ariaLabel={t("theme")}>
          <ThemeIcon theme={theme} />
        </IconButton>
        <IconButton
          onClick={() => setAiAssistantOpen(true)}
          title={t("settings.ai")}
          ariaLabel={t("settings.ai")}
        >
          <AiIcon />
        </IconButton>
      </div>
    </header>
  );
}
