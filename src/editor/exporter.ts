/**
 * 导出工具：
 *  - exportHTML(content) -> 完整 HTML 字符串（自包含）
 *  - exportPDF()          -> 触发 WebView 打印对话框
 *  - exportDOCX(content)  -> 单文件 .doc（HTML 格式内嵌 Word XML 命名空间，Word 可打开；
 *    注意这是"Word 兼容 HTML"，并非真正的 OOXML .docx，UI 已如实标注为"Word 兼容 (.doc)"。
 *
 * 修复：
 *  1. 源码模式下用 Milkdown transformer 重新渲染 Markdown，而非抓 DOM innerHTML（避免退化为纯文本）
 *  2. 导出 HTML 时把相对路径图片内联为 base64，离开工作区也能显示
 *  3. 打印样式补充隐藏 Textora 实际 UI 类名
 */
import { invoke, saveDialog, message } from "../ipc";
import { useAppStore } from "../store/useAppStore";

/**
 * 净化 HTML：移除可能执行脚本的危险标签/属性。
 * 在导出 innerHTML 内容前调用，防止 Markdown 中嵌入的恶意 HTML 被一并导出。
 */
function sanitizeHtml(html: string): string {
  let s = html;
  // 移除 <script> 及其内容
  s = s.replace(/<script[\s\S]*?<\/script>/gi, "");
  // 移除 <iframe> <object> <embed> <style> 及其内容
  s = s.replace(/<(iframe|object|embed|style|link|meta|base|form)[\s\S]*?<\/\1>/gi, "");
  // 移除危险自闭合标签，但保留 img/br/hr
  s = s.replace(/<(iframe|object|embed|link|meta|base|form|input|button|select|textarea|video|audio|source|svg)[^>]*\/?>/gi, "");
  // 移除 on* 事件处理器属性
  s = s.replace(/\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*)/gi, "");
  // 移除 javascript: 危险协议
  s = s.replace(/(href|src|action|formaction)\s*=\s*(?:"javascript[^"]*"|'javascript[^']*'|javascript:[^\s>]*)/gi, '$1="#"');
  // 移除 data:text/html 危险协议（保留 data:image/*）
  s = s.replace(/(href|src|action|formaction)\s*=\s*(?:"data:text\/html[^"]*"|'data:text\/html[^']*'|data:text\/html[^\s>]*)/gi, '$1="#"');
  return s;
}

// ============== 共享 CSS ==============
const BASE_CSS = `
:root { color-scheme: light dark; }
body {
  margin: 0;
  background: #ffffff;
  color: #1f2328;
  font-family: Inter, "PingFang SC", "Microsoft YaHei", sans-serif;
  line-height: 1.7;
}
@media (prefers-color-scheme: dark) {
  body { background: #0d1117; color: #e6edf3; }
  .milkdown pre, .milkdown code, .milkdown table th, .milkdown table td { border-color: #30363d; }
  .milkdown pre, .milkdown code { background: #161b22; }
  .milkdown blockquote { color: #8b949e; border-left-color: #30363d; }
  .milkdown a { color: #58a6ff; }
}
.milkdown .ProseMirror {
  outline: none;
  padding: 32px clamp(24px, 8vw, 96px) 96px;
  max-width: 920px;
  margin: 0 auto;
  font-size: 16px;
}
.milkdown h1 { font-size: 2em; border-bottom: 1px solid #d0d7de; padding-bottom: 0.3em; }
.milkdown h2 { font-size: 1.5em; border-bottom: 1px solid #d0d7de; padding-bottom: 0.3em; }
.milkdown h3 { font-size: 1.25em; }
.milkdown a { color: #0969da; text-decoration: none; }
.milkdown pre { background: #f6f8fa; border: 1px solid #d0d7de; border-radius: 8px; padding: 16px 18px; overflow-x: auto; font-family: ui-monospace, Menlo, monospace; font-size: 0.9em; }
.milkdown code { font-family: ui-monospace, Menlo, monospace; font-size: 0.9em; background: #f6f8fa; padding: 0.1em 0.35em; border-radius: 4px; border: 1px solid #d0d7de; }
.milkdown pre code { background: transparent; border: none; padding: 0; }
.milkdown blockquote { border-left: 4px solid #d0d7de; padding: 0 1em; color: #57606a; }
.milkdown table { border-collapse: collapse; width: 100%; }
.milkdown table th, .milkdown table td { border: 1px solid #d0d7de; padding: 6px 12px; }
.milkdown table th { background: #f6f8fa; }
.milkdown img { max-width: 100%; }
.milkdown ul li { list-style: disc; }
.milkdown ol li { list-style: decimal; }
.milkdown hr { border: 0; border-top: 1px solid #d0d7de; margin: 1.5em 0; }
.milkdown .textora-mermaid { background: #f6f8fa; border: 1px solid #d0d7de; border-radius: 8px; padding: 16px; margin: 1em 0; text-align: center; }
.milkdown .textora-math-block { display: block; text-align: center; margin: 1em 0; }
.milkdown .textora-math-inline { display: inline-block; margin: 0 1px; }
`;

/**
 * 获取渲染后的 HTML。
 * 优先用 DOM innerHTML（WYSIWYG 模式）；
 * 若 DOM 不存在（源码模式），用 Milkdown transformer 重新渲染 Markdown。
 */
async function getRenderedHtml(): Promise<string> {
  const editor = document.querySelector(".milkdown .ProseMirror") as HTMLElement | null;
  if (editor && editor.children.length > 0) {
    let html = sanitizeHtml(editor.innerHTML);
    // 内联相对路径图片为 base64
    html = await inlineImages(html);
    return html;
  }
  // 源码模式：用 Milkdown transformer 把 Markdown 转为 HTML
  const raw = useAppStore.getState().content;
  try {
    const transformerMod = await import("@milkdown/transformer");
    const { commonmark } = await import("@milkdown/preset-commonmark");
    const { gfm } = await import("@milkdown/preset-gfm");
    const Transformer = (transformerMod as any).Transformer;
    const transformer = Transformer.utilityStr(commonmark, gfm);
    const doc = transformer(raw);
    let html = sanitizeHtml(transformer.nodeToHTML(doc));
    html = await inlineImages(html);
    return html;
  } catch {
    // transformer 失败：退化为简单 HTML 转义（保留可读性）
    return raw
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\n/g, "<br>");
  }
}

/**
 * 把 HTML 中的相对路径图片内联为 base64 data URL。
 * 仅处理 src 以非 http/https/data 开头的 img。
 */
async function inlineImages(html: string): Promise<string> {
  const ws = useAppStore.getState().workspaceRoot;
  if (!ws) return html;
  const imgRe = /<img[^>]+src="([^"]+)"[^>]*>/g;
  const matches: Array<{ src: string; full: string }> = [];
  let m: RegExpExecArray | null;
  while ((m = imgRe.exec(html)) !== null) {
    const src = m[1];
    if (/^(https?:|data:)/i.test(src)) continue;
    matches.push({ src, full: m[0] });
  }
  if (!matches.length) return html;

  // 跨平台绝对路径判定：Windows 盘符（C:\ D:\ …）、UNC（\\server）、Unix（/）
  const isAbsolute = (p: string): boolean =>
    /^[a-zA-Z]:[\\/]/.test(p) || p.startsWith("/") || p.startsWith("\\\\");
  const norm = (s: string) => s.replace(/\\/g, "/");
  const normWs = norm(ws).replace(/\/$/, "");
  const results = await Promise.all(
    matches.map(async ({ src, full }) => {
      try {
        // 解析相对路径为绝对路径；绝对路径（含非 C: 盘符 / UNC）原样保留
        const absPath = isAbsolute(src) ? src : `${normWs}/${norm(src)}`;
        // 读取文件并转 base64
        const bytes = await invoke<number[]>("read_binary_file", { path: absPath });
        const u8 = new Uint8Array(bytes);
        let binary = "";
        const chunk = 0x8000;
        for (let i = 0; i < u8.length; i += chunk) {
          binary += String.fromCharCode.apply(
            null,
            Array.from(u8.subarray(i, i + chunk))
          );
        }
        const base64 = btoa(binary);
        const ext = (src.split(".").pop() || "png").toLowerCase();
        const mime = ext === "jpg" || ext === "jpeg" ? "image/jpeg" : `image/${ext}`;
        const dataUrl = `data:${mime};base64,${base64}`;
        return { full, src, dataUrl };
      } catch {
        return null;
      }
    })
  );
  let result = html;
  for (const r of results) {
    if (r) {
      result = result.replace(r.full, r.full.replace(r.src, r.dataUrl));
    }
  }
  return result;
}

function titleFromPath(path: string | null) {
  if (!path) return "untitled";
  const parts = path.split(/[\\/]/).filter(Boolean);
  return parts.pop() || "untitled";
}

// ============== HTML 导出 ==============
export async function exportAsHTML() {
  const s = useAppStore.getState();
  const html = await getRenderedHtml();
  const title = titleFromPath(s.currentPath);
  const full = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<style>${BASE_CSS}</style>
</head>
<body>
<div class="milkdown">
  <div class="ProseMirror">${html}</div>
</div>
</body>
</html>`;
  const target = await saveDialog({
    title: "Export HTML",
    defaultPath: `${title}.html`,
    filters: [{ name: "HTML", extensions: ["html"] }],
  });
  if (!target) return;
  try {
    await invoke("write_text_file", { path: target, contents: full });
    await message(`Exported to ${target}`, { title: "Export Complete" });
  } catch (e) {
    await message(String(e), { title: "Export Failed", kind: "error" });
  }
}

// ============== DOCX (HTML) 导出 ==============
export async function exportAsDOCX() {
  const s = useAppStore.getState();
  const html = await getRenderedHtml();
  const title = titleFromPath(s.currentPath);
  const full = `<!doctype html>
<html xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:w="urn:schemas-microsoft-com:office:word"
      xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<!--[if gte mso 9]><xml>
  <w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom></w:WordDocument>
</xml><![endif]-->
<style>${BASE_CSS}</style>
</head>
<body>
<div class="milkdown">
  <div class="ProseMirror">${html}</div>
</div>
</body>
</html>`;
  const target = await saveDialog({
    title: "Export Word 兼容 (.doc)",
    defaultPath: `${title}.doc`,
    filters: [{ name: "Word 兼容 (.doc)", extensions: ["doc"] }],
  });
  if (!target) return;
  try {
    await invoke("write_text_file", { path: target, contents: full });
    await message(`Exported to ${target}`, { title: "Export Complete" });
  } catch (e) {
    await message(String(e), { title: "Export Failed", kind: "error" });
  }
}

// ============== PDF 导出（Electron printToPDF） ==============
/**
 * PDF 导出：
 *  通过 Electron 主进程的 printToPDF API 生成真正的 PDF 文件。
 *  渲染进程构造完整 HTML，发送给主进程，主进程创建隐藏窗口渲染并导出 PDF。
 */
export async function exportAsPDF() {
  const s = useAppStore.getState();
  const title = titleFromPath(s.currentPath);
  const html = await getRenderedHtml();

  const fullHtml = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<style>${BASE_CSS}
@media print {
  .milkdown h1, .milkdown h2, .milkdown h3, .milkdown h4, .milkdown h5, .milkdown h6 {
    break-after: avoid-page; page-break-after: avoid;
  }
  .milkdown pre, .milkdown table, .milkdown img, .milkdown blockquote,
  .milkdown .textora-mermaid, .milkdown .textora-math-block {
    break-inside: avoid; page-break-inside: avoid;
  }
  .milkdown p { orphans: 3; widows: 3; }
}
</style>
</head>
<body>
<div class="milkdown">
  <div class="ProseMirror">${html}</div>
</div>
</body>
</html>`;

  const target = await saveDialog({
    title: "Export PDF",
    defaultPath: `${title}.pdf`,
    filters: [{ name: "PDF", extensions: ["pdf"] }],
  });
  if (!target) return;
  try {
    await invoke("export_pdf", { html: fullHtml, target_path: target });
    await message(`Exported to ${target}`, { title: "Export Complete" });
  } catch (e) {
    await message(String(e), { title: "Export Failed", kind: "error" });
  }
}

// ============== PNG 导出（Electron capturePage） ==============
/**
 * PNG 导出：
 *  通过 Electron 主进程的 capturePage API 将渲染内容截图为 PNG。
 *  自动调整窗口高度以捕获全部内容。
 */
export async function exportAsPNG() {
  const s = useAppStore.getState();
  const title = titleFromPath(s.currentPath);
  const html = await getRenderedHtml();

  const fullHtml = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<style>${BASE_CSS}</style>
</head>
<body>
<div class="milkdown">
  <div class="ProseMirror">${html}</div>
</div>
</body>
</html>`;

  const target = await saveDialog({
    title: "Export PNG",
    defaultPath: `${title}.png`,
    filters: [{ name: "PNG Image", extensions: ["png"] }],
  });
  if (!target) return;
  try {
    await invoke("export_png", { html: fullHtml, target_path: target });
    await message(`Exported to ${target}`, { title: "Export Complete" });
  } catch (e) {
    await message(String(e), { title: "Export Failed", kind: "error" });
  }
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
