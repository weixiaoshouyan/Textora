/**
 * Shiki 高亮渲染器（单例 + Promise 缓存）。
 *
 * 主题会随 Textora 的明/暗主题切换而改变（github-light / github-dark）。
 *
 * 懒加载策略：仅预载入 `text`（内置），其他语言在首次使用时通过
 * `highlighter.loadLanguage(...)` 动态加载，避免一次性加载全部 37 种语言
 * 造成首屏卡顿与大体积 chunk。
 */
import { codeToHtml, getHighlighter, type Highlighter, type BuiltinLanguage } from "shiki";

let highlighter: Promise<Highlighter> | null = null;
let currentTheme: "light" | "dark" = "light";

// 所有受支持的语言别名（仅做白名单校验，并不预加载）
export const SUPPORTED_LANGS = new Set<string>([
  "ts",
  "tsx",
  "js",
  "jsx",
  "json",
  "html",
  "css",
  "scss",
  "bash",
  "shell",
  "sh",
  "md",
  "markdown",
  "rs",
  "rust",
  "go",
  "py",
  "python",
  "java",
  "kt",
  "kotlin",
  "swift",
  "c",
  "cpp",
  "cs",
  "rb",
  "ruby",
  "php",
  "yaml",
  "yml",
  "toml",
  "sql",
  "diff",
  "vue",
  "svelte",
  "text",
  "plaintext",
  "txt",
]);

// 已加载语言集合，避免重复 loadLanguage
const loadedLangs = new Set<string>(["text"]);
// 正在加载中的语言 Promise，防止并发重复加载
const loadingLangs = new Map<string, Promise<boolean>>();

function getHl(): Promise<Highlighter> {
  if (!highlighter) {
    // 仅预加载主题与 text，其余语言按需加载
    highlighter = getHighlighter({
      themes: ["github-light", "github-dark"],
      langs: ["text"],
    });
  }
  return highlighter;
}

/**
 * 确保某个语言已加载；返回最终可用语言（无法加载则回退为 "text"）。
 */
async function ensureLang(hl: Highlighter, lang: string): Promise<string> {
  const normalized = lang.toLowerCase();
  if (!SUPPORTED_LANGS.has(normalized)) return "text";
  if (loadedLangs.has(normalized)) return normalized;

  // 并发去重：同一语言只加载一次
  let p = loadingLangs.get(normalized);
  if (!p) {
    p = (async () => {
      try {
        await hl.loadLanguage(normalized as BuiltinLanguage);
        loadedLangs.add(normalized);
        return true;
      } catch {
        return false;
      }
    })();
    loadingLangs.set(normalized, p);
  }
  const ok = await p;
  loadingLangs.delete(normalized);
  return ok ? normalized : "text";
}

export function setShikiTheme(theme: "light" | "dark") {
  currentTheme = theme;
}

function pickTheme(): "github-light" | "github-dark" {
  return currentTheme === "dark" ? "github-dark" : "github-light";
}

export async function codeToHtmlSafe(code: string, lang: string): Promise<string> {
  try {
    const hl = await getHl();
    const useLang = await ensureLang(hl, lang);
    return await codeToHtml(code, {
      lang: useLang as any,
      theme: pickTheme(),
    });
  } catch (e) {
    // 任何错误回退到纯文本
    const escaped = code
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    return `<pre class="textora-shiki-pre"><code class="textora-shiki-code">${escaped}</code></pre>`;
  }
}

/**
 * 销毁 Shiki 高亮器单例，释放内存。
 * 在应用退出或需要完全重置时调用。
 */
export async function disposeShiki(): Promise<void> {
  if (highlighter) {
    try {
      const hl = await highlighter;
      hl.dispose();
    } catch {
      // ignore dispose errors
    }
    highlighter = null;
  }
  loadedLangs.clear();
  loadedLangs.add("text");
  loadingLangs.clear();
}
