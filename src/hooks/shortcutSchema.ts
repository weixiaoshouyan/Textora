/**
 * 快捷键配置系统：
 *  - 定义所有可用快捷键及其默认绑定
 *  - 支持用户自定义绑定（存储在 localStorage）
 *  - 提供绑定字符串规范化、冲突检测、事件匹配等工具函数
 *
 * 绑定格式（normalized）：
 *   "mod+n"        → Ctrl/Cmd + N
 *   "mod+shift+s"  → Ctrl/Cmd + Shift + S
 *   "mod+alt+s"    → Ctrl/Cmd + Alt + S
 *   "f8"           → F8（无修饰键）
 *   "mod+tab"      → Ctrl/Cmd + Tab
 */

export interface ShortcutDef {
  /** 唯一标识，如 "file.new" */
  id: string;
  /** 默认绑定，如 "mod+n" */
  defaultBinding: string;
  /** i18n 文案 key */
  descriptionKey: string;
  /** 分类 */
  category: "file" | "edit" | "view" | "tabs" | "app";
  /** 是否在输入框内也允许触发 */
  allowInInput: boolean;
  /** 是否过滤 e.repeat（避免长按连续触发） */
  repeatGuard: boolean;
}

/** 所有快捷键定义 */
export const SHORTCUTS: ShortcutDef[] = [
  // 文件
  {
    id: "file.new",
    defaultBinding: "mod+n",
    descriptionKey: "sc.newFile",
    category: "file",
    allowInInput: true,
    repeatGuard: false,
  },
  {
    id: "file.open",
    defaultBinding: "mod+o",
    descriptionKey: "sc.openFile",
    category: "file",
    allowInInput: true,
    repeatGuard: false,
  },
  {
    id: "file.save",
    defaultBinding: "mod+s",
    descriptionKey: "sc.save",
    category: "file",
    allowInInput: true,
    repeatGuard: true,
  },
  {
    id: "file.saveAs",
    defaultBinding: "mod+shift+s",
    descriptionKey: "sc.saveAs",
    category: "file",
    allowInInput: true,
    repeatGuard: true,
  },
  // 编辑
  {
    id: "edit.find",
    defaultBinding: "mod+f",
    descriptionKey: "sc.find",
    category: "edit",
    allowInInput: false,
    repeatGuard: false,
  },
  {
    id: "edit.searchInFiles",
    defaultBinding: "mod+shift+f",
    descriptionKey: "sc.searchInFiles",
    category: "edit",
    allowInInput: true,
    repeatGuard: false,
  },
  {
    id: "edit.quickOpen",
    defaultBinding: "mod+p",
    descriptionKey: "sc.quickOpen",
    category: "edit",
    allowInInput: false,
    repeatGuard: false,
  },
  {
    id: "edit.commandPalette",
    defaultBinding: "mod+shift+p",
    descriptionKey: "sc.commandPalette",
    category: "edit",
    allowInInput: true,
    repeatGuard: false,
  },
  {
    id: "edit.gotoLine",
    defaultBinding: "mod+g",
    descriptionKey: "sc.gotoLine",
    category: "edit",
    allowInInput: false,
    repeatGuard: false,
  },
  // 视图
  {
    id: "view.toggleSidebar",
    defaultBinding: "mod+b",
    descriptionKey: "sc.toggleSidebar",
    category: "view",
    allowInInput: true,
    repeatGuard: false,
  },
  {
    id: "view.toggleSource",
    defaultBinding: "mod+alt+s",
    descriptionKey: "sc.toggleSource",
    category: "view",
    allowInInput: true,
    repeatGuard: false,
  },
  {
    id: "view.toggleReading",
    defaultBinding: "mod+alt+r",
    descriptionKey: "sc.toggleReading",
    category: "view",
    allowInInput: true,
    repeatGuard: false,
  },
  {
    id: "view.toggleTheme",
    defaultBinding: "mod+j",
    descriptionKey: "sc.toggleTheme",
    category: "view",
    allowInInput: true,
    repeatGuard: false,
  },
  {
    id: "view.toggleFocus",
    defaultBinding: "f9",
    descriptionKey: "sc.toggleFocus",
    category: "view",
    allowInInput: true,
    repeatGuard: false,
  },
  {
    id: "view.toggleTypewriter",
    defaultBinding: "f8",
    descriptionKey: "sc.toggleTypewriter",
    category: "view",
    allowInInput: true,
    repeatGuard: false,
  },
  // 分屏
  {
    id: "view.toggleSplit",
    defaultBinding: "mod+\\",
    descriptionKey: "sc.toggleSplit",
    category: "view",
    allowInInput: true,
    repeatGuard: false,
  },
  // 标签
  {
    id: "tabs.close",
    defaultBinding: "mod+w",
    descriptionKey: "sc.closeTab",
    category: "tabs",
    allowInInput: true,
    repeatGuard: true,
  },
  {
    id: "tabs.next",
    defaultBinding: "mod+tab",
    descriptionKey: "sc.nextTab",
    category: "tabs",
    allowInInput: true,
    repeatGuard: false,
  },
  {
    id: "tabs.prev",
    defaultBinding: "mod+shift+tab",
    descriptionKey: "sc.prevTab",
    category: "tabs",
    allowInInput: true,
    repeatGuard: false,
  },
  // 书签
  {
    id: "bookmark.toggle",
    defaultBinding: "mod+f2",
    descriptionKey: "sc.toggleBookmark",
    category: "edit",
    allowInInput: false,
    repeatGuard: false,
  },
  {
    id: "bookmark.next",
    defaultBinding: "f2",
    descriptionKey: "sc.nextBookmark",
    category: "edit",
    allowInInput: false,
    repeatGuard: false,
  },
  {
    id: "bookmark.prev",
    defaultBinding: "shift+f2",
    descriptionKey: "sc.prevBookmark",
    category: "edit",
    allowInInput: false,
    repeatGuard: false,
  },
  {
    id: "bookmark.clearAll",
    defaultBinding: "mod+shift+f2",
    descriptionKey: "sc.clearBookmarks",
    category: "edit",
    allowInInput: false,
    repeatGuard: false,
  },
  // 宏
  {
    id: "macro.record",
    defaultBinding: "mod+shift+r",
    descriptionKey: "sc.macroRecord",
    category: "edit",
    allowInInput: false,
    repeatGuard: false,
  },
  {
    id: "macro.play",
    // 与 edit.commandPalette 的 mod+shift+p 冲突，改用 mod+shift+m
    defaultBinding: "mod+shift+m",
    descriptionKey: "sc.macroPlay",
    category: "edit",
    allowInInput: false,
    repeatGuard: false,
  },
  // 应用
  {
    id: "app.openSettings",
    defaultBinding: "mod+comma",
    descriptionKey: "menu.settings",
    category: "app",
    allowInInput: true,
    repeatGuard: true,
  },
];

const SHORTCUTS_KEY = "textora.shortcuts";

/** 读取用户自定义绑定 */
export function loadCustomBindings(): Record<string, string> {
  try {
    const raw = localStorage.getItem(SHORTCUTS_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, string>;
  } catch {
    return {};
  }
}

/** 保存用户自定义绑定 */
export function saveCustomBindings(bindings: Record<string, string>) {
  try {
    localStorage.setItem(SHORTCUTS_KEY, JSON.stringify(bindings));
  } catch {
    /* ignore */
  }
}

/** 获取某个快捷键的当前绑定（自定义优先） */
export function getBinding(def: ShortcutDef, custom: Record<string, string>): string {
  return custom[def.id] ?? def.defaultBinding;
}

/** 获取所有快捷键的当前绑定映射（binding → shortcutId），用于快速查找 */
export function buildBindingMap(custom: Record<string, string>): Map<string, string> {
  const map = new Map<string, string>();
  for (const def of SHORTCUTS) {
    const binding = getBinding(def, custom);
    map.set(binding, def.id);
  }
  return map;
}

/** 将 KeyboardEvent 转换为 normalized binding 字符串 */
export function eventToBinding(e: KeyboardEvent): string | null {
  const key = e.key.toLowerCase();
  // 纯修饰键按下不算快捷键
  if (key === "control" || key === "meta" || key === "shift" || key === "alt") {
    return null;
  }
  const parts: string[] = [];
  if (e.ctrlKey || e.metaKey) parts.push("mod");
  if (e.shiftKey) parts.push("shift");
  if (e.altKey) parts.push("alt");
  parts.push(key);
  return parts.join("+");
}

/** 将 binding 字符串格式化为人类可读标签 */
export function formatBinding(binding: string): string {
  const isMac = typeof navigator !== "undefined" && /Mac|iPod|iPhone|iPad/.test(navigator.platform);
  const modLabel = isMac ? "⌘" : "Ctrl";
  return binding
    .split("+")
    .map((part) => {
      switch (part) {
        case "mod":
          return modLabel;
        case "shift":
          return isMac ? "⇧" : "Shift";
        case "alt":
          return isMac ? "⌥" : "Alt";
        case "enter":
          return "↵";
        case "tab":
          return isMac ? "⇥" : "Tab";
        case "backspace":
          return "⌫";
        case "escape":
          return "Esc";
        default:
          return part.length === 1 ? part.toUpperCase() : part;
      }
    })
    .join(isMac ? "" : "+");
}

/** 检测绑定冲突：返回冲突的 shortcutId，无冲突返回 null */
export function findConflict(
  binding: string,
  exceptId: string,
  custom: Record<string, string>
): string | null {
  for (const def of SHORTCUTS) {
    if (def.id === exceptId) continue;
    if (getBinding(def, custom) === binding) return def.id;
  }
  return null;
}

/** 重置某个快捷键为默认绑定 */
export function resetBinding(def: ShortcutDef, custom: Record<string, string>): Record<string, string> {
  const next = { ...custom };
  delete next[def.id];
  return next;
}
