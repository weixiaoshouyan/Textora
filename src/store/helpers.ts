/**
 * Store 辅助函数
 *
 * 从 useAppStore.ts 中提取的纯工具函数，无状态依赖。
 */
import type { ThemeMode, Settings, Tab, AppState } from "./types";

// ===== 存储键 =====
export const THEME_KEY = "textora.theme";
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
  vimMode: false,
  pdfHeader: false,
  pdfFooter: false,
};

// ===== localStorage 安全读写 =====
/**
 * 读取 localStorage 中的 JSON 值。
 * 注意：JSON.parse 对 "null" / "{}" / "0" 等都会成功返回，仅靠 try/catch 挡不住
 * "解析成功但类型不符" 的损坏数据（旧版本数据、写入中途失败、清理工具部分清除）。
 * 调用方可传入 validate 做结构校验，校验失败时回退到 fallback，避免渲染层崩溃。
 */
export function safeReadLocal<T>(key: string, fallback: T, validate?: (v: unknown) => boolean): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed: unknown = JSON.parse(raw);
    if (validate && !validate(parsed)) return fallback;
    return parsed as T;
  } catch {
    return fallback;
  }
}

export function safeWriteLocal(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    console.warn(`[safeWriteLocal] Storage write failed for key "${key}":`, err);
    try {
      // If AI sessions grow too large, retain only the recent 10 sessions and truncate old message history
      if (key === "textora.ai_sessions" && Array.isArray(value)) {
        const trimmed = (value as Array<any>).slice(0, 10).map(s => ({
          ...s,
          messages: (s.messages || []).slice(-30),
        }));
        localStorage.setItem(key, JSON.stringify(trimmed));
      }
    } catch {
      // ignore secondary failure
    }
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
