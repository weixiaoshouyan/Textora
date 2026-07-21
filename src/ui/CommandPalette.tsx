import { useEffect, useMemo, useRef, useState } from "react";
import { useAppStore, getActiveTab } from "../store/useAppStore";
import { useLocale, tFor } from "../i18n";
import { useFocusTrap } from "../hooks/useFocusTrap";
import { SHORTCUTS, getBinding, formatBinding, loadCustomBindings } from "../hooks/shortcutSchema";

interface Command {
  id: string;
  title: string;
  hint?: string;
  run: () => void;
}

export function CommandPalette() {
  const open = useAppStore((s) => s.commandPaletteOpen);
  const setOpen = useAppStore((s) => s.setCommandPaletteOpen);
  const locale = useLocale((s) => s.locale);
  const t = tFor(locale);

  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  useFocusTrap(containerRef, open);

  useEffect(() => {
    if (open) {
      setQuery("");
      setIndex(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  const commands = useMemo<Command[]>(() => {
    const s = useAppStore.getState();
    const custom = loadCustomBindings();
    const sc = (id: string): string | undefined => {
      const def = SHORTCUTS.find((d) => d.id === id);
      return def ? formatBinding(getBinding(def, custom)) : undefined;
    };
    return [
      { id: "new", title: t("new"), hint: sc("file.new"), run: () => s.newFile() },
      { id: "open", title: t("open"), hint: sc("file.open"), run: () => void s.openFile() },
      { id: "save", title: t("save"), hint: sc("file.save"), run: () => void s.saveFile() },
      { id: "saveAs", title: t("saveAs"), hint: sc("file.saveAs"), run: () => void s.saveFileAs() },
      { id: "quickOpen", title: t("sc.quickOpen"), hint: sc("edit.quickOpen"), run: () => s.setQuickOpenOpen(true) },
      { id: "find", title: t("find"), hint: sc("edit.find"), run: () => s.setFindReplaceOpen(true) },
      {
        id: "searchInFiles",
        title: t("commandPalette.searchInFiles"),
        hint: sc("edit.searchInFiles"),
        run: () => s.setSearchInFilesOpen(true),
      },
      {
        id: "gotoLine",
        title: t("commandPalette.gotoLine"),
        hint: sc("edit.gotoLine"),
        run: () => window.dispatchEvent(new CustomEvent("textora-goto")),
      },
      { id: "toggleSource", title: t("source"), hint: sc("view.toggleSource"), run: () => s.toggleSource() },
      {
        id: "toggleReading",
        title: t("settings.readingMode"),
        hint: sc("view.toggleReading"),
        run: () => s.toggleReading(),
      },
      { id: "toggleSidebar", title: t("sidebar"), hint: sc("view.toggleSidebar"), run: () => s.toggleSidebar() },
      { id: "toggleOutline", title: t("outline"), run: () => s.toggleOutline() },
      { id: "toggleFocus", title: t("focus"), hint: sc("view.toggleFocus"), run: () => s.toggleFocus() },
      { id: "toggleTypewriter", title: t("typewriter"), hint: sc("view.toggleTypewriter"), run: () => s.toggleTypewriter() },
      { id: "toggleTheme", title: t("theme"), hint: sc("view.toggleTheme"), run: () => s.toggleTheme() },
      {
        id: "settings",
        title: t("settings"),
        run: () => s.setSettingsPanelOpen(true),
      },
      {
        id: "compareFiles",
        title: t("diff.compareFiles"),
        run: () => s.setDiffViewOpen(true),
      },
      {
        id: "closeTab",
        title: t("commandPalette.closeTab"),
        hint: sc("tabs.close"),
        run: () => {
          const a = getActiveTab(s);
          if (a) s.closeTab(a.id);
        },
      },
    ];
  }, [locale]); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter((c) => c.title.toLowerCase().includes(q) || c.id.includes(q));
  }, [query, commands]);

  useEffect(() => setIndex(0), [query]);

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-idx="${index}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [index]);

  if (!open) return null;

  const choose = (c?: Command) => {
    const cmd = c ?? filtered[index];
    if (cmd) cmd.run();
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
      choose();
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
    }
  };

  return (
    <div
      className="textora-overlay-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) setOpen(false);
      }}
    >
      <div ref={containerRef} className="textora-card textora-palette">
        <input
          ref={inputRef}
          className="textora-palette-input"
          placeholder={t("commandPalette.placeholder")}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          spellCheck={false}
        />
        <div ref={listRef} className="textora-palette-list">
          {filtered.length === 0 && (
            <div className="px-3 py-2 text-xs" style={{ color: "var(--textora-fg-muted)" }}>
              {t("commandPalette.noResults")}
            </div>
          )}
          {filtered.map((c, i) => (
            <div
              key={c.id}
              data-idx={i}
              className={`textora-palette-item${i === index ? " active" : ""}`}
              onMouseEnter={() => setIndex(i)}
              onClick={() => choose(c)}
            >
              <span>{c.title}</span>
              {c.hint && <span className="hint">{c.hint}</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
