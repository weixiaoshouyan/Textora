import { useState, useRef, useEffect, forwardRef, useMemo } from "react";
import { useAppStore } from "../store/useAppStore";
import { exportAsHTML, exportAsPDF, exportAsDOCX, exportAsPNG } from "../editor/exporter";
import { useLocale, tFor } from "../i18n";
import { SHORTCUTS, getBinding, formatBinding, loadCustomBindings } from "../hooks/shortcutSchema";

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
  const toggleSplitView = useAppStore((s) => s.toggleSplitView);
  const splitViewOpen = useAppStore((s) => s.splitViewOpen);
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
    // settingsPanelOpen 变化时重新计算（面板关闭后绑定可能已更新）
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
          <DropdownItem label={t("save")} shortcut={scLabels["file.save"]} onClick={() => { setFileMenuOpen(false); void saveFile(); }} />
          <DropdownItem label={t("saveAs")} shortcut={scLabels["file.saveAs"]} onClick={() => { setFileMenuOpen(false); void useAppStore.getState().saveFileAs(); }} />
          <DropdownDivider />
          <DropdownItem label={t("export.pdf")} onClick={() => { setFileMenuOpen(false); void exportAsPDF(); }} />
          <DropdownItem label={t("export.html")} onClick={() => { setFileMenuOpen(false); void exportAsHTML(); }} />
          <DropdownItem label={t("export.docx")} onClick={() => { setFileMenuOpen(false); void exportAsDOCX(); }} />
          <DropdownItem label={t("export.png")} onClick={() => { setFileMenuOpen(false); void exportAsPNG(); }} />
          <DropdownDivider />
          <DropdownItem label={t("diff.compareFiles")} onClick={() => { setFileMenuOpen(false); useAppStore.getState().setDiffViewOpen(true); }} />
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
            {dirty && <span style={{ marginLeft: 4, color: "var(--textora-fg)" }}>\u2022</span>}
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
        <IconButton
          onClick={() => setSettingsPanelOpen(true)}
          title={t("settings")}
          ariaLabel={t("settings")}
        >
          <GearIcon />
        </IconButton>
      </div>
    </header>
  );
}

/* --- Menu bar item --- */

const MenuBarItem = forwardRef<HTMLDivElement, {
  label: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}>(({ label, open, onToggle, children }, ref) => {
  return (
    <div className="relative" ref={ref}>
      <button
        className="px-2 rounded-sm"
        style={{
          fontSize: 12,
          lineHeight: "24px",
          height: 24,
          background: open ? "var(--textora-bg-muted)" : "transparent",
          color: "var(--textora-fg-muted)",
          transition: "background 0.15s, color 0.15s",
        }}
        onClick={onToggle}
        onMouseEnter={(e) => {
          if (!open) e.currentTarget.style.background = "var(--textora-bg-muted)";
        }}
        onMouseLeave={(e) => {
          if (!open) e.currentTarget.style.background = "transparent";
        }}
        onMouseDown={(e) => e.preventDefault()}
      >
        {label}
      </button>
      {open && (
        <div
          className="absolute left-0 top-full mt-0.5 textora-card py-1 z-50 min-w-[200px]"
        >
          {children}
        </div>
      )}
    </div>
  );
});

MenuBarItem.displayName = "MenuBarItem";

/* --- Dropdown items --- */

function DropdownItem({
  label,
  shortcut,
  checked,
  onClick,
}: {
  label: string;
  shortcut?: string;
  checked?: boolean;
  onClick: () => void;
}) {
  return (
    <div
      className="flex items-center justify-between px-3 py-1.5 cursor-pointer"
      style={{ transition: "background 0.12s" }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = "var(--textora-bg-muted)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "transparent";
      }}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
    >
      <span className="flex items-center gap-2" style={{ fontSize: 12 }}>
        <span
          className="w-3 text-center"
          style={{ color: "var(--textora-accent)", fontSize: 12 }}
        >
          {checked ? "\u2713" : ""}
        </span>
        {label}
      </span>
      {shortcut && (
        <span style={{ color: "var(--textora-fg-muted)", fontSize: 11 }}>
          {shortcut}
        </span>
      )}
    </div>
  );
}

function DropdownDivider() {
  return <hr className="my-1" style={{ borderColor: "var(--textora-border)" }} />;
}

/* --- Icon button --- */

function IconButton({
  children,
  onClick,
  title,
  ariaLabel,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title?: string;
  ariaLabel?: string;
}) {
  return (
    <button
      className="w-7 h-7 flex items-center justify-center rounded-sm"
      style={{
        color: "var(--textora-fg-muted)",
        transition: "background 0.15s, color 0.15s",
      }}
      onClick={onClick}
      title={title}
      aria-label={ariaLabel || title}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = "var(--textora-bg-muted)";
        e.currentTarget.style.color = "var(--textora-fg)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "transparent";
        e.currentTarget.style.color = "var(--textora-fg-muted)";
      }}
      onMouseDown={(e) => e.preventDefault()}
    >
      {children}
    </button>
  );
}

/* --- SVG icons --- */

function SearchIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

function CommandIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 3a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3 3 3 0 0 0 3-3 3 3 0 0 0-3-3H6a3 3 0 0 0-3 3 3 3 0 0 0 3 3 3 3 0 0 0 3-3V6a3 3 0 0 0-3-3 3 3 0 0 0-3 3 3 3 0 0 0 3 3h12a3 3 0 0 0 3-3 3 3 0 0 0-3-3z" />
    </svg>
  );
}

function GearIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

function AiIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3l1.9 4.6L18.5 9.5l-4.6 1.9L12 16l-1.9-4.6L5.5 9.5l4.6-1.9z" />
      <path d="M19 14l.8 2L22 16.8l-2 .8L19 20l-.8-2.4-2-.8 2-.8z" />
    </svg>
  );
}

function ThemeIcon({ theme }: { theme: string }) {
  if (theme === "dark") {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
      </svg>
    );
  }
  if (theme === "sepia") {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 3v18" />
        <path d="M12 3a4 4 0 0 1 0 18" />
      </svg>
    );
  }
  if (theme === "nord") {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2L2 7l10 5 10-5-10-5z" />
        <path d="M2 17l10 5 10-5" />
        <path d="M2 12l10 5 10-5" />
      </svg>
    );
  }
  // light - sun
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="5" />
      <line x1="12" y1="1" x2="12" y2="3" />
      <line x1="12" y1="21" x2="12" y2="23" />
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
      <line x1="1" y1="12" x2="3" y2="12" />
      <line x1="21" y1="12" x2="23" y2="12" />
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
    </svg>
  );
}
