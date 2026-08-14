/**
 * i18n 核心：语言状态、翻译函数、系统语言检测。
 *
 * 字典按语言拆分到独立文件，便于维护与对比缺失 key：
 *  - zh 字典：src/i18n/zh.ts
 *  - en 字典：src/i18n/en.ts
 *
 * 翻译查找顺序：当前语言 → 另一语言回退 → 返回原始 key（并告警一次）。
 */
import { create } from "zustand";
import { emit, getSystemLocale } from "../ipc";
import { zh } from "./zh";
import { en } from "./en";

export type Locale = "zh" | "en";

export function getMessages(locale: Locale) {
  return locale === "zh" ? zh : en;
}

const warnedKeys = new Set<string>();

export function t(key: string, locale: Locale, params?: Record<string, string | number>): string {
  const messages = getMessages(locale);
  let value: string;
  if (messages[key] !== undefined) {
    value = messages[key];
  } else {
    // Fallback to other locale
    const fallback = getMessages(locale === 'zh' ? 'en' : 'zh');
    if (fallback[key] !== undefined) {
      value = fallback[key];
    } else {
      if (typeof console !== 'undefined') {
        // 去重：同一个缺失 key 只警告一次，避免刷屏
        if (!warnedKeys.has(key)) {
          warnedKeys.add(key);
          console.warn(`[i18n] Missing translation for key: "${key}"`);
        }
      }
      return key;
    }
  }
  // 替换占位符 {name} {count} 等
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      value = value.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
    }
  }
  return value;
}

// ---- zustand-based locale store ----

interface LocaleState {
  locale: Locale;
  setLocale: (l: Locale) => void;
}

const LOCALE_STORAGE_KEY = 'textora-locale';

/** 根据 Electron app.getLocale() 结果匹配支持的语言 */
function detectSystemLocale(): Locale {
  try {
    // 优先使用用户上次选择的语言
    const saved = typeof localStorage !== 'undefined' ? localStorage.getItem(LOCALE_STORAGE_KEY) : null;
    if (saved === 'zh' || saved === 'en') return saved;
  } catch {}
  return 'zh';
}

export const useLocale = create<LocaleState>((set) => ({
  locale: detectSystemLocale(),
  setLocale: (l) => {
    set({ locale: l });
    try { localStorage.setItem(LOCALE_STORAGE_KEY, l); } catch {}
    // 通知主进程重建原生菜单
    void emit("set-locale", l);
  },
}));

/** 应用启动时异步检测系统语言并应用（需窗口创建后 IPC 可用时调用） */
export async function initSystemLocale(): Promise<void> {
  try {
    // 如果用户已手动选择过语言，不覆盖
    const saved = typeof localStorage !== 'undefined' ? localStorage.getItem(LOCALE_STORAGE_KEY) : null;
    if (saved === 'zh' || saved === 'en') return;

    const sysLocale = await getSystemLocale();
    const normalized: Locale = sysLocale.toLowerCase().startsWith("zh") ? "zh" : "en";
    useLocale.getState().setLocale(normalized);
  } catch {
    // IPC 不可用时保持默认值（zh）
  }
}

export function tFor(locale: Locale) {
  return (key: string) => t(key, locale);
}
