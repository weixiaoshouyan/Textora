/**
 * 代码折叠范围计算（源码编辑器）。
 * 支持花括号语言（JS/TS/C 等）与缩进语言（Python/YAML）。
 */
export interface FoldRange {
  startLine: number;
  endLine: number;
  folded: boolean;
}

export function computeFoldRanges(text: string, language: string): FoldRange[] {
  const lines = text.split("\n");
  const folds: FoldRange[] = [];

  if (["javascript","typescript","java","c","cpp","csharp","go","rust","swift","kt","php","css","scss","json"].includes(language)) {
    const stack: number[] = [];
    for (let i = 0; i < lines.length; i++) {
      for (const ch of lines[i]) {
        if (ch === "{") stack.push(i);
        else if (ch === "}" && stack.length > 0) {
          const start = stack.pop()!;
          if (i > start) folds.push({ startLine: start, endLine: i, folded: false });
        }
      }
    }
  }

  if (["python","yaml"].includes(language)) {
    const stack: { line: number; indent: number }[] = [];
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(/^(\s*)\S/);
      if (!m) continue;
      const indent = m[1].length;
      while (stack.length > 0 && stack[stack.length - 1].indent >= indent) {
        const e = stack.pop()!;
        if (i - e.line > 1) folds.push({ startLine: e.line, endLine: i - 1, folded: false });
      }
      stack.push({ line: i, indent });
    }
    while (stack.length > 0) {
      const e = stack.pop()!;
      if (lines.length - 1 - e.line > 0) folds.push({ startLine: e.line, endLine: lines.length - 1, folded: false });
    }
  }

  return folds;
}

/** 超过该行数启用虚拟滚动（大文件模式） */
export const VIRTUAL_LINE_THRESHOLD = 5000;
/** 虚拟滚动的缓冲行数 */
export const VIRTUAL_BUFFER_LINES = 200;
