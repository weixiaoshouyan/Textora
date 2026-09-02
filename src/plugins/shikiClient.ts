/**
 * Shiki 高亮渲染器（单例 + Promise 缓存）。
 *
 * 主题会随 Textora 的明/暗主题切换而改变（github-light / github-dark）。
 *
 * 懒加载策略：仅预载入 `text`（内置），其他语言在首次使用时通过
 * `highlighter.loadLanguage(...)` 动态加载，避免一次性加载全部 37 种语言
 * 造成首屏卡顿与大体积 chunk。
 *
 * 注意：shiki 本体（约 9MB 未压缩）通过动态 import 按需加载，避免拖慢
 * 应用首屏；首次真正执行代码高亮时才拉取对应 chunk。
 */
import type { Highlighter, BuiltinLanguage } from "shiki";

let highlighter: Promise<Highlighter> | null = null;
let currentTheme: "light" | "dark" = "light";
// 主题切换世代号，用于让外部判断是否需要重渲染
let themeGeneration = 0;

/** Files above this size skip syntax highlighting to keep typing responsive. */
export const LARGE_FILE_THRESHOLD = 10 * 1024 * 1024;

// 所有受支持的语言别名（仅做白名单校验，并不预加载）。
// 与 src/main/shared.ts 的 LANG_MAP 保持一致（值侧），新增语言须经 shiki 探测确认存在。
export const SUPPORTED_LANGS = new Set<string>([
  "ts", "tsx", "mts", "cts", "js", "jsx", "mjs", "cjs",
  "json", "jsonc", "json5", "html", "css", "scss", "less",
  "bash", "shell", "sh", "zsh", "fish", "bat", "cmd", "ps1",
  "md", "markdown", "mdx", "rs", "rust", "go", "py", "python",
  "java", "kt", "kotlin", "kts", "swift", "c", "cpp", "cs", "csharp",
  "rb", "ruby", "php", "yaml", "yml", "toml", "sql", "diff",
  "vue", "svelte", "lua", "scala", "dart",
  "perl", "r", "groovy", "julia", "elixir", "erlang", "haskell",
  "ocaml", "clojure", "zig", "nim", "proto", "graphql", "gql",
  "prisma", "vb", "coffee", "make", "dockerfile", "dotenv",
  "properties", "ini", "csv", "tsv", "asm", "tex", "http", "regex",
  "text", "plaintext", "txt",
]);

// 语言别名归一化映射：把常见别名映射到 Shiki 实际语言名
const LANG_ALIASES: Record<string, string> = {
  ts: "typescript",
  js: "javascript",
  py: "python",
  rs: "rust",
  go: "go",
  sh: "bash",
  bash: "bash",
  yml: "yaml",
  md: "markdown",
};

function normalizeLang(lang: string): string {
  return LANG_ALIASES[lang.toLowerCase()] || lang.toLowerCase();
}

// 已加载语言集合，避免重复 loadLanguage
const loadedLangs = new Set<string>(["text"]);
// 正在加载中的语言 Promise，防止并发重复加载
const loadingLangs = new Map<string, Promise<boolean>>();

function getHl(): Promise<Highlighter> {
  if (!highlighter) {
    // 动态 import：shiki 与主 bundle 分离，仅在首次高亮时加载
    highlighter = import("shiki")
      .then(({ getHighlighter }) =>
        getHighlighter({
          themes: ["github-light", "github-dark"],
          langs: ["text"],
        }),
      )
      .catch((err) => {
        // 加载失败（瞬时磁盘/网络错误）：复位单例，允许下次调用重试。
        // 否则 rejected promise 被永久缓存，整场会话高亮都回退为纯文本
        highlighter = null;
        throw err;
      });
  }
  return highlighter;
}

/**
 * 确保某个语言已加载；返回最终可用语言（无法加载则回退为 "text"）。
 */
async function ensureLang(hl: Highlighter, lang: string): Promise<string> {
  const lower = lang.toLowerCase();
  if (!SUPPORTED_LANGS.has(lower)) return "text";
  // 归一化别名后再传给 Shiki（如 ts -> typescript）
  const normalized = normalizeLang(lang);
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
  themeGeneration++;
}

export function getShikiThemeGeneration(): number {
  return themeGeneration;
}

function pickTheme(): "github-light" | "github-dark" {
  return currentTheme === "dark" ? "github-dark" : "github-light";
}

function escapedCodeHtml(code: string): string {
  const escaped = code
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return `<pre class="textora-shiki-pre"><code class="textora-shiki-code">${escaped}</code></pre>`;
}

export async function codeToHtmlSafe(
  code: string,
  lang: string,
  options: { largeFile?: boolean } = {},
): Promise<string> {
  if (options.largeFile || new TextEncoder().encode(code).byteLength > LARGE_FILE_THRESHOLD) {
    return escapedCodeHtml(code);
  }
  try {
    const hl = await getHl();
    const useLang = await ensureLang(hl, lang);
    return await hl.codeToHtml(code, {
      lang: useLang as any,
      theme: pickTheme(),
    });
  } catch {
    // 任何错误回退到纯文本
    return escapedCodeHtml(code);
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
