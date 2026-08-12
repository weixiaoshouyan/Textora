/**
 * Line operations utility for CodeEditor
 * Provides: sort lines, remove duplicates, remove empty lines, indent conversion
 */

export interface LineOperations {
  sortLines: (text: string, startPos: number, endPos: number, direction: "asc" | "desc", numeric?: boolean) => { newText: string; newStart: number; newEnd: number };
  removeDuplicateLines: (text: string, startPos: number, endPos: number) => { newText: string; newStart: number; newEnd: number };
  removeEmptyLines: (text: string, startPos: number, endPos: number) => { newText: string; newStart: number; newEnd: number };
  indentToSpaces: (text: string, startPos: number, endPos: number, tabSize?: number) => { newText: string; newStart: number; newEnd: number };
  spacesToTabs: (text: string, startPos: number, endPos: number, tabSize?: number) => { newText: string; newStart: number; newEnd: number };
}

function getLineRange(text: string, startPos: number, endPos: number): { startLine: number; endLine: number } {
  const lines = text.split("\n");
  let startLine = 0;
  let pos = 0;
  for (let i = 0; i < lines.length; i++) {
    if (pos + lines[i].length >= startPos) { startLine = i; break; }
    pos += lines[i].length + 1;
    startLine = i + 1;
  }
  let endLine = startLine;
  pos = 0;
  for (let i = 0; i < lines.length; i++) {
    if (pos + lines[i].length >= endPos) { endLine = i; break; }
    pos += lines[i].length + 1;
    // endPos 恰好落在本行末尾换行符之后（即下一行行首）时，
    // 选区仍以本行结束，不应把下一行算进来
    if (pos >= endPos) { endLine = i; break; }
    if (i === lines.length - 1) endLine = i;
  }
  while (endLine > startLine && !lines[endLine]) endLine--;
  return { startLine, endLine };
}

export const lineOps: LineOperations = {
  sortLines: (text, startPos, endPos, direction, numeric) => {
    const { startLine, endLine } = getLineRange(text, startPos, endPos);
    const lines = text.split("\n");
    const before = lines.slice(0, startLine);
    const selected = lines.slice(startLine, endLine + 1);
    const after = lines.slice(endLine + 1);

    selected.sort((a, b) => {
      if (numeric) {
        const na = parseFloat(a) || 0;
        const nb = parseFloat(b) || 0;
        return direction === "asc" ? na - nb : nb - na;
      }
      return direction === "asc" ? a.localeCompare(b) : b.localeCompare(a);
    });

    const newText = [...before, ...selected, ...after].join("\n");
    const newStart = before.join("\n").length + (before.length > 0 ? 1 : 0);
    const newEnd = newStart + selected.join("\n").length;
    return { newText, newStart, newEnd };
  },

  removeDuplicateLines: (text, startPos, endPos) => {
    const { startLine, endLine } = getLineRange(text, startPos, endPos);
    const lines = text.split("\n");
    const before = lines.slice(0, startLine);
    const selected = lines.slice(startLine, endLine + 1);
    const after = lines.slice(endLine + 1);
    const seen = new Set<string>();
    const deduped = selected.filter(line => {
      if (seen.has(line)) return false;
      seen.add(line);
      return true;
    });
    const newText = [...before, ...deduped, ...after].join("\n");
    const newStart = before.join("\n").length + (before.length > 0 ? 1 : 0);
    const newEnd = newStart + deduped.join("\n").length;
    return { newText, newStart, newEnd };
  },

  removeEmptyLines: (text, startPos, endPos) => {
    const { startLine, endLine } = getLineRange(text, startPos, endPos);
    const lines = text.split("\n");
    const before = lines.slice(0, startLine);
    const selected = lines.slice(startLine, endLine + 1);
    const after = lines.slice(endLine + 1);
    const filtered = selected.filter(line => line.trim().length > 0);
    const newText = [...before, ...filtered, ...after].join("\n");
    const newStart = before.join("\n").length + (before.length > 0 ? 1 : 0);
    const newEnd = newStart + filtered.join("\n").length;
    return { newText, newStart, newEnd };
  },

  indentToSpaces: (text, startPos, endPos, tabSize = 4) => {
    const { startLine, endLine } = getLineRange(text, startPos, endPos);
    const lines = text.split("\n");
    const before = lines.slice(0, startLine);
    const selected = lines.slice(startLine, endLine + 1).map(line => {
      let spaceCount = 0;
      for (const ch of line) { if (ch === "\t") spaceCount += tabSize; else break; }
      return " ".repeat(spaceCount) + line.replace(/^\t+/, "");
    });
    const after = lines.slice(endLine + 1);
    const newText = [...before, ...selected, ...after].join("\n");
    const newStart = before.join("\n").length + (before.length > 0 ? 1 : 0);
    const newEnd = newStart + selected.join("\n").length;
    return { newText, newStart, newEnd };
  },

  spacesToTabs: (text, startPos, endPos, tabSize = 4) => {
    const { startLine, endLine } = getLineRange(text, startPos, endPos);
    const lines = text.split("\n");
    const before = lines.slice(0, startLine);
    const selected = lines.slice(startLine, endLine + 1).map(line => {
      let spaceCount = 0;
      for (const ch of line) { if (ch === " ") spaceCount++; else break; }
      const tabs = Math.floor(spaceCount / tabSize);
      const remainder = spaceCount % tabSize;
      return "\t".repeat(tabs) + " ".repeat(remainder) + line.slice(spaceCount);
    });
    const after = lines.slice(endLine + 1);
    const newText = [...before, ...selected, ...after].join("\n");
    const newStart = before.join("\n").length + (before.length > 0 ? 1 : 0);
    const newEnd = newStart + selected.join("\n").length;
    return { newText, newStart, newEnd };
  },
};
