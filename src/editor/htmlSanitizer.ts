/**
 * 导出内容净化器。
 *
 * 安全边界：导出内容会进入一个 sandbox + contextIsolation 的隐藏窗口，
 * 但仍需删除脚本执行面（script / iframe / 事件属性 / javascript: URL），
 * 防止文档里的恶意 HTML 在导出窗口内执行。
 *
 * 与渲染展示不同，这里是"保留富文本"的策略：
 *  - 保留 <svg>：Mermaid 图表渲染结果是 SVG，整块丢弃会导致导出丢失图表
 *  - 保留 style 属性与 <style> 标签：KaTeX 公式布局大量依赖内联 style
 *  - 对 style 做内容级净化（expression / behavior / -moz-binding / @import / javascript: URL）
 *  - 同时处理 xlink:href 等命名空间 URL 属性（SVG <a>/<use> 的常见注入点）
 */
const DROP_TAGS = new Set(["SCRIPT", "IFRAME", "OBJECT", "EMBED", "LINK", "META", "BASE", "FORM", "INPUT", "BUTTON", "SELECT", "TEXTAREA", "VIDEO", "AUDIO", "SOURCE", "MATH", "XMP", "PLAINTEXT", "NOEMBED", "NOFRAMES", "TEMPLATE"]);
const URL_ATTRS = new Set(["href", "src", "action", "formaction", "srcset", "xlink:href"]);

const STYLE_BLOCK_RE =
  /(?:expression\s*\(|behavior\s*:|-moz-binding|@import|javascript\s*:|vbscript\s*:)/i;
const STYLE_URL_BLOCK_RE =
  /url\s*\(\s*['"]?\s*(?:javascript|vbscript|data:text\/html)/i;

/** 校验 style 内容是否安全；不安全则整段丢弃（KaTeX 的数值 style 不受影响）。 */
function isSafeStyle(value: string): boolean {
  const cleaned = value.replace(/[\t\n\r\0\x0b]/g, "");
  if (STYLE_BLOCK_RE.test(cleaned)) return false;
  if (STYLE_URL_BLOCK_RE.test(cleaned)) return false;
  return true;
}

function isUrlAttr(name: string): boolean {
  return URL_ATTRS.has(name) || name.endsWith(":href") || name.endsWith(":src");
}

export function sanitizeHtml(html: string): string {
  if (typeof document === "undefined") return fallbackSanitize(html);
  const template = document.createElement("template");
  template.innerHTML = html;
  const walker = document.createTreeWalker(template.content, NodeFilter.SHOW_ELEMENT);
  const elements: Element[] = [];
  let current: Node | null = walker.currentNode;
  while (current) {
    if (current.nodeType === Node.ELEMENT_NODE) elements.push(current as Element);
    current = walker.nextNode();
  }
  for (const element of elements) {
    const tag = element.tagName.toUpperCase();
    if (DROP_TAGS.has(tag)) {
      element.remove();
      continue;
    }
    // <style> 标签内容同样做净化和限制，防止 @import/expression 混入
    if (tag === "STYLE") {
      const text = element.textContent || "";
      if (!isSafeStyle(text)) {
        element.remove();
      }
      continue;
    }
    for (const attribute of Array.from(element.attributes)) {
      const name = attribute.name.toLowerCase();
      const value = attribute.value.trim();
      if (name.startsWith("on")) {
        element.removeAttribute(attribute.name);
        continue;
      }
      // style 属性：净化而非直接丢弃（KaTeX 依赖内联 style 完成排版）
      if (name === "style") {
        if (!isSafeStyle(value)) {
          element.removeAttribute(attribute.name);
        }
        continue;
      }
      // srcset 格式特殊：逗号分隔的 URL 列表，逐个校验
      if (name === "srcset") {
        const parts = value.split(",");
        const allSafe = parts.every((p) => {
          const url = p.trim().split(/\s+/)[0];
          // 移除控制字符（浏览器导航时会剥离 tab/newline 等，但正则不会）
          const cleaned = url.replace(/[\t\n\r\0\x0b]/g, "").toLowerCase();
          return !/^(?:javascript:|vbscript:|data:text\/html)/i.test(cleaned);
        });
        if (!allSafe) element.removeAttribute(attribute.name);
        continue;
      }
      if (isUrlAttr(name)) {
        // 移除控制字符（浏览器导航时会剥离 tab/newline 等，但正则不会）
        const cleaned = value.replace(/[\t\n\r\0\x0b]/g, "").trim().toLowerCase();
        if (/^(?:javascript:|vbscript:|data:text\/html)/i.test(cleaned)) {
          element.setAttribute(attribute.name, "#");
        }
      }
    }
  }
  const container = document.createElement("div");
  container.appendChild(template.content.cloneNode(true));
  return container.innerHTML;
}

function fallbackSanitize(html: string): string {
  let prev: string;
  let current = html;
  do {
    prev = current;
    current = current
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<iframe[^>]*>[\s\S]*?<\/iframe>/gi, "")
      .replace(/<object[^>]*>[\s\S]*?<\/object>/gi, "")
      .replace(/<embed[^>]*>/gi, "")
      .replace(/<script[^>]*>/gi, "")
      .replace(/<\/script>/gi, "");
  } while (current !== prev);
  return current;
}
