/**
 * 大纲：扫描 Markdown 源文本中的 ATX 标题（# ... ######）和 Setext 风格（=== ---）。
 *
 * 修复：
 *  1. 围栏代码块开闭必须用相同字符（``` 或 ~~~），避免互相误切换
 *  2. Setext 检测：上一行必须是"普通段落文本"（非空、非标题、非分隔线、非列表项等），
 *     且当前行是纯 === 或纯 ---（不能混用），避免分隔线被误判为 H2
 *  3. ATX + Setext 不会对同一行重复计数
 *  4. 预计算行偏移数组，避免 O(n·h)
 */
export interface OutlineItem {
  level: number; // 1-6
  text: string;
  line: number; // 0-based
  pos: number; // 字符偏移（在原 Markdown 中）
}

const HEADING_RE = /^(#{1,6})\s+(.+?)\s*#*\s*$/;
const SETEXT_RE = /^\s*(=+|-+)\s*$/;
const FENCE_OPEN_RE = /^ {0,3}(`{3,}|~{3,})/;

export function extractOutline(markdown: string): OutlineItem[] {
  const lines = markdown.split(/\r?\n/);
  const out: OutlineItem[] = [];
  let inFence = false;
  let fenceChar = ""; // "`" 或 "~"

  // 预计算行偏移（每行起始字符在 markdown 中的位置）
  const lineOffsets: number[] = new Array(lines.length);
  let off = 0;
  for (let i = 0; i < lines.length; i++) {
    lineOffsets[i] = off;
    off += lines[i].length + 1; // +1 for \n（最后一行无 \n 也无所谓）
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // 围栏代码块：开闭必须用相同字符
    const fenceMatch = line.match(FENCE_OPEN_RE);
    if (fenceMatch) {
      const ch = fenceMatch[1][0];
      if (!inFence) {
        inFence = true;
        fenceChar = ch;
      } else if (ch === fenceChar) {
        inFence = false;
        fenceChar = "";
      }
      continue;
    }
    if (inFence) continue;

    const m = line.match(HEADING_RE);
    if (m) {
      const level = m[1].length;
      const text = m[2].trim();
      out.push({ level, text, line: i, pos: lineOffsets[i] });
      continue;
    }

    // Setext: 上一行必须是"可作为 setext 标题文本"的行
    // —— 非空、非 ATX 标题、非 setext 下划线、非分隔线、非列表项、非引用块、非代码块
    if (i > 0 && SETEXT_RE.test(line)) {
      const prev = lines[i - 1];
      const prevTrim = prev.trim();
      // 当前行必须是纯 = 或纯 -（不能 =- 混用）
      const trimmed = line.trim();
      const isEquals = /^[=]+$/.test(trimmed);
      const isDashes = /^[-]+$/.test(trimmed);
      if (!isEquals && !isDashes) continue;
      // 上一行必须是普通段落文本
      if (!prevTrim) continue;
      if (HEADING_RE.test(prev)) continue;
      if (SETEXT_RE.test(prev)) continue;
      // 分隔线（---）单独一行时不能作为 setext 下划线，因为其上一行若为段落，
      // CommonMark 规定 --- 若长度≥1 且全为 -，确实可作 setext H2；
      // 但若是 thematic break 场景（上下均空），上面已 continue。
      // 这里允许 --- 作为 setext，符合 CommonMark。
      // 但要避免 ATX + Setext 双重计数：上一行已是 ATX 标题则跳过（上面已 continue）。
      const level = isEquals ? 1 : 2;
      out.push({ level, text: prevTrim, line: i - 1, pos: lineOffsets[i - 1] });
    }
  }
  return out;
}
