/**
 * 图片尺寸持久化（Typora 兼容 `=WxH` 语法）。
 *
 * 存储位置：图片节点的 title 属性（markdown 中为 `![alt](src "=200x150")`），
 * 这是 CommonMark/Milkdown 原生支持的字段，序列化-再解析往返无损。
 * 渲染时（编辑器/导出）据 title 应用 width/height。
 */

const SIZE_TITLE_RE = /^=\s*(\d+)\s*[xX]\s*(\d+)\s*$/;

/** 解析 title 中的尺寸（`=200x150` / `=200X150`）；非尺寸格式返回 null */
export function parseSizeFromTitle(title: string): { width: number; height: number } | null {
  const m = (title || "").trim().match(SIZE_TITLE_RE);
  if (!m) return null;
  const width = parseInt(m[1], 10);
  const height = parseInt(m[2], 10);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return null;
  }
  return { width, height };
}

/** 生成尺寸 title：`=200x150` */
export function buildSizeTitle(width: number, height: number): string {
  const w = Math.round(width);
  const h = Math.round(height);
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return "";
  return `=${w}x${h}`;
}

/** 判断 title 是否已是尺寸格式（可安全覆盖） */
export function isSizeTitle(title: string): boolean {
  return parseSizeFromTitle(title) !== null;
}

/**
 * 给 HTML 中的 `<img title="=WxH">` 应用 width/height style。
 * 用于源码模式导出（transformer 输出的 img 无 style）——
 * WYSIWYG 模式导出走 DOM，style 已在元素上，无需此处理。
 */
export function applySizeToHtml(html: string): string {
  return html.replace(
    /<img\b([^>]*)\btitle=("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')([^>]*)>/gi,
    (full, pre: string, titleAttr: string, post: string) => {
      // 提取 title 值（去引号）
      const raw = titleAttr.slice(1, -1).replace(/\\(["'])/g, "$1");
      const size = parseSizeFromTitle(raw);
      if (!size) return full;
      // 已带 style 的 img 不重复注入（避免覆盖原样式）
      if (/\bstyle\s*=/i.test(pre + post)) return full;
      return `<img${pre}title=${titleAttr} style="width:${size.width}px;height:${size.height}px"${post}>`;
    },
  );
}
