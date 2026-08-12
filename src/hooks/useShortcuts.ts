import { useEffect } from "react";
import { useAppStore, getActiveTab } from "../store/useAppStore";
import { showPrompt } from "../ui/showPrompt";
import { Macro, MacroRecorder, MacroPlayer, saveMacro, getMacros } from "../editor/macro";
import {
  SHORTCUTS,
  loadCustomBindings,
  buildBindingMap,
  eventToBinding,
  type ShortcutDef,
} from "./shortcutSchema";

/**
 * 监听全局快捷键。
 *
 * 快捷键绑定可通过设置面板自定义（存储于 localStorage）。
 * 每次按下按键时，将事件规范化为 binding 字符串，查表匹配对应动作。
 */

// 模块级缓存：避免每次 keydown 都读 localStorage
let customBindings = loadCustomBindings();
let bindingMap = buildBindingMap(customBindings);

/** 供设置面板调用：更新绑定后刷新缓存 */
export function refreshShortcutBindings() {
  customBindings = loadCustomBindings();
  bindingMap = buildBindingMap(customBindings);
}

/** 获取当前自定义绑定（供设置面板读取） */
export function getCustomBindings() {
  return { ...customBindings };
}

function isInputTarget(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  const tag = t.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    t.isContentEditable
  );
}

/** 快捷键动作执行器 */
function executeShortcut(id: string, _e: KeyboardEvent): void {
  const s = useAppStore.getState();
  switch (id) {
    case "file.new":
      s.newFile();
      break;
    case "file.open":
      void s.openFile();
      break;
    case "file.save":
      void s.saveFile();
      break;
    case "file.saveAs":
      void s.saveFileAs();
      break;
    case "edit.find":
      s.setFindReplaceOpen(true);
      break;
    case "edit.searchInFiles":
      s.setSearchInFilesOpen(true);
      break;
    case "edit.quickOpen":
      s.setQuickOpenOpen(true);
      break;
    case "edit.commandPalette":
      s.setCommandPaletteOpen(true);
      break;
    case "edit.gotoLine":
      window.dispatchEvent(new CustomEvent("textora-goto"));
      break;
    case "view.toggleSidebar":
      s.toggleSidebar();
      break;
    case "view.toggleSource":
      s.toggleSource();
      break;
    case "view.toggleReading":
      s.toggleReading();
      break;
    case "view.toggleTheme":
      s.toggleTheme();
      break;
    case "view.toggleFocus":
      s.toggleFocus();
      break;
    case "view.toggleTypewriter":
      s.toggleTypewriter();
      break;
    case "tabs.close": {
      const a = getActiveTab(s);
      if (a) s.closeTab(a.id);
      break;
    }
    case "tabs.next":
      switchTab(s, 1);
      break;
    case "tabs.prev":
      switchTab(s, -1);
      break;
    case "bookmark.toggle":
      toggleBookmark();
      break;
    case "bookmark.next":
      navigateBookmark(1);
      break;
    case "bookmark.prev":
      navigateBookmark(-1);
      break;

    case "macro.record":
      toggleMacroRecording();
      break;
    case "macro.play":
      playLastMacro();
      break;
    case "bookmark.clearAll":
      clearAllBookmarks();
      break;
    case "app.openSettings":
      useAppStore.getState().setSettingsPanelOpen(true);
      break;
    default:
      break;
  }
}


// ============================================================
// Bookmark management
// ============================================================

const BOOKMARKS_KEY = "textora.bookmarks";

interface Bookmark {
  path: string;
  line: number; // 0-based line number
}

function getBookmarks(): Bookmark[] {
  try {
    const raw = localStorage.getItem(BOOKMARKS_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as Bookmark[];
  } catch {
    return [];
  }
}

function saveBookmarks(bms: Bookmark[]) {
  try {
    localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(bms));
  } catch { /* ignore */ }
}

function toggleBookmark() {
  const s = useAppStore.getState();
  const tab = getActiveTab(s);
  if (!tab?.path) return;

  // Get cursor line from textarea
  const ta = document.querySelector(".textora-code-textarea") as HTMLTextAreaElement | null;
  let line = 0;
  if (ta) {
    const pos = ta.selectionStart;
    line = ta.value.slice(0, pos).split("\n").length - 1;
  }

  const path = tab.path;
  const bms = getBookmarks();
  const existing = bms.findIndex(b => b.path === path && b.line === line);
  if (existing >= 0) {
    bms.splice(existing, 1);
  } else {
    bms.push({ path, line });
    bms.sort((a, b) => {
      if (a.path !== b.path) return a.path.localeCompare(b.path);
      return a.line - b.line;
    });
  }
  saveBookmarks(bms);
  // Force gutter re-render
  dispatchEvent(new CustomEvent("textora:bookmarks-changed"));
}

function navigateBookmark(dir: number) {
  const s = useAppStore.getState();
  const tab = getActiveTab(s);
  if (!tab?.path) return;

  const ta = document.querySelector(".textora-code-textarea") as HTMLTextAreaElement | null;
  let currentLine = 0;
  if (ta) {
    const pos = ta.selectionStart;
    currentLine = ta.value.slice(0, pos).split("\n").length - 1;
  }

  const path = tab.path;
  const bms = getBookmarks().filter(b => b.path === path);
  if (bms.length === 0) return;

  // Find next bookmark in direction
  const sorted = [...bms].sort((a, b) => a.line - b.line);
  let target: Bookmark | undefined;
  if (dir > 0) {
    target = sorted.find(b => b.line > currentLine) || sorted[0]; // wrap to first
  } else {
    target = [...sorted].reverse().find(b => b.line < currentLine) || sorted[sorted.length - 1]; // wrap to last
  }

  if (target) {
    const lines = (ta?.value || "").split("\n");
    let pos = 0;
    for (let i = 0; i < target.line && i < lines.length; i++) {
      pos += lines[i].length + 1;
    }
    if (ta) {
      ta.focus();
      ta.setSelectionRange(pos, pos);
    }
  }
}

function clearAllBookmarks() {
  saveBookmarks([]);
  dispatchEvent(new CustomEvent("textora:bookmarks-changed"));
}


// ============================================================
// Macro recording/playback
// ============================================================

let recorder: any = null;
let lastMacroActions: any[] = [];
let macroToggling = false;

async function toggleMacroRecording() {
  if (macroToggling) return;
  macroToggling = true;
  try {
    if (!recorder) recorder = new MacroRecorder();
    if (recorder.isRecording()) {
      lastMacroActions = recorder.stopRecording();
      const name = await showPrompt("Macro name?", "Macro " + new Date().toLocaleTimeString());
      if (name && lastMacroActions.length > 0) {
        const macro: Macro = {
          id: "macro-" + Date.now(),
          name,
          actions: lastMacroActions,
          createdAt: Date.now(),
        };
        saveMacro(macro);
        console.log("[Macro] Saved:", macro.name, lastMacroActions.length, "actions");
      }
    } else {
      recorder.startRecording();
      console.log("[Macro] Recording started...");
    }
  } finally {
    macroToggling = false;
  }
}

async function playLastMacro() {
  if (lastMacroActions.length === 0) {
    // Try to load the most recent macro
    const macros = getMacros();
    if (macros.length === 0) return;
    const last = macros[macros.length - 1];
    lastMacroActions = last.actions;
  }
  if (lastMacroActions.length === 0) return;

  const player = new MacroPlayer();
  const api = useAppStore.getState().codeEditorApi;
  if (api) {
    await player.play(lastMacroActions, api);
    console.log("[Macro] Playback complete");
  }
}


export function useShortcuts() {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const binding = eventToBinding(e);
      if (!binding) return;

      const shortcutId = bindingMap.get(binding);
      if (!shortcutId) return;

      const def: ShortcutDef | undefined = SHORTCUTS.find((d) => d.id === shortcutId);
      if (!def) return;

      // repeat 过滤
      if (def.repeatGuard && e.repeat) return;

      // 输入框内过滤
      if (!def.allowInInput && isInputTarget(e.target)) return;

      e.preventDefault();
      executeShortcut(shortcutId, e);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
}

function switchTab(s: ReturnType<typeof useAppStore.getState>, dir: number) {
  if (s.tabs.length === 0) return;
  const idx = s.tabs.findIndex((t) => t.id === s.activeTabId);
  const nextIdx = (idx + dir + s.tabs.length) % s.tabs.length;
  s.setActiveTab(s.tabs[nextIdx].id);
}
