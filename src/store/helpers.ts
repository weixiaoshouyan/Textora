/**
 * Store 辅助函数
 *
 * 从 useAppStore.ts 中提取的纯工具函数，无状态依赖。
 */
import type { ThemeMode, Settings, Tab, AppState } from "./types";

// ===== 存储键 =====
export const THEME_KEY = "textora.theme";
export const RECENT_KEY = "textora.recent";
export const SETTINGS_KEY = "textora.settings";
export const WORKSPACE_KEY = "textora.workspace";
export const SESSION_KEY = "textora.session";

// ===== 默认设置 =====
export const DEFAULT_SETTINGS: Settings = {
  autoSaveSeconds: 0,
  fontSize: 16,
  fontFamily: "Inter, 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif",
  focusMode: false,
  typewriterMode: false,
  sourceMode: false,
  readingMode: false,
  spellcheck: false,
  sidebarVisible: true,
  outlineVisible: true,
  sidebarWidth: 240,
};

// ===== localStorage 安全读写 =====
export function safeReadLocal<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function safeWriteLocal(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore
  }
}

// ===== 主题 =====
export function detectInitialTheme(): ThemeMode {
  const stored = safeReadLocal<ThemeMode | null>(THEME_KEY, null);
  if (stored === "light" || stored === "dark" || stored === "sepia" || stored === "nord") {
    return stored;
  }
  const prefersDark =
    window.matchMedia &&
    window.matchMedia("(prefers-color-scheme: dark)").matches;
  return prefersDark ? "dark" : "light";
}

export function applyThemeToDom(theme: ThemeMode): void {
  document.documentElement.setAttribute("data-theme", theme);
}

// ===== 路径工具 =====
export function basenameOf(p: string): string {
  return p.split(/[\\/]/).filter(Boolean).pop() || p;
}

export function parentDirOf(p: string): string {
  const parts = p.split(/[\\/]/).filter(Boolean);
  if (parts.length <= 1) return p;
  parts.pop();
  return parts.join("/");
}

export function normalizePath(p: string): string {
  return p.replace(/\\/g, "/");
}

// ===== ID 生成 =====
export function genId(): string {
  return `tab-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// ===== Tab 辅助 =====
export function getActiveTab(state: AppState): Tab | null {
  if (!state.activeTabId) return null;
  return state.tabs.find((t) => t.id === state.activeTabId) ?? null;
}
