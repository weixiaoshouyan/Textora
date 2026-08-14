/**
 * 括号匹配（源码编辑器）：查找配对括号位置，供高亮覆盖层使用。
 */
export interface BracketPair {
  line1: number;
  col1: number;
  line2: number;
  col2: number;
}

const BRACKET_MAP: Record<string, string> = { "(": ")", "{": "}", "[": "]" };
const CLOSING_BRACKETS: Record<string, string> = { ")": "(", "}": "{", "]": "[" };

export function posToLineCol(text: string, pos: number): { line: number; col: number } {
  let line = 0;
  let col = 0;
  for (let i = 0; i < pos && i < text.length; i++) {
    if (text[i] === "\n") { line++; col = 0; } else { col++; }
  }
  return { line, col };
}

export function findMatchingBracket(text: string, line: number, col: number, lines: string[]): { line: number; col: number } | null {
  if (line >= lines.length) return null;
  const lineText = lines[line];
  if (col >= lineText.length) return null;
  const ch = lineText[col];

  if (BRACKET_MAP[ch]) {
    const open = ch; const close = BRACKET_MAP[ch];
    let depth = 1;
    for (let l = line; l < lines.length; l++) {
      const sc = l === line ? col + 1 : 0;
      for (let c = sc; c < lines[l].length; c++) {
        if (lines[l][c] === open) depth++;
        else if (lines[l][c] === close) { depth--; if (depth === 0) return { line: l, col: c }; }
      }
    }
  } else if (CLOSING_BRACKETS[ch]) {
    const close = ch; const open = CLOSING_BRACKETS[ch];
    let depth = 1;
    for (let l = line; l >= 0; l--) {
      const sc = l === line ? col - 1 : lines[l].length - 1;
      for (let c = sc; c >= 0; c--) {
        if (lines[l][c] === close) depth++;
        else if (lines[l][c] === open) { depth--; if (depth === 0) return { line: l, col: c }; }
      }
    }
  }
  return null;
}
