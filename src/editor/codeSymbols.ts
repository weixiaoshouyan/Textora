/**
 * 代码符号提取器
 * 从源代码中提取函数、类、接口等符号，用于大纲视图
 */
import type { MilkdownEditor } from "./MilkdownEditor";

export interface CodeSymbol {
  name: string;
  kind: string;
  line: number;
  children?: CodeSymbol[];
}

interface SymbolPattern {
  pattern: RegExp;
  kind: string;
}

const LANGUAGE_PATTERNS: Record<string, SymbolPattern[]> = {
  javascript: [
    { pattern: /^(?:export\s+)?(?:async\s+)?function\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/, kind: "function" },
    { pattern: /^(?:export\s+)?class\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/, kind: "class" },
    { pattern: /^(?:export\s+)?(?:async\s+)?(?:const|let|var)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=\s*(?:async\s*)?\(/, kind: "function" },
    { pattern: /^\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\([^)]*\)\s*\{/, kind: "method" },
    { pattern: /^import\s+\{?\s*([^}]+)\s*\}?\s+from/, kind: "import" },
  ],
  typescript: [
    { pattern: /^(?:export\s+)?(?:async\s+)?function\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/, kind: "function" },
    { pattern: /^(?:export\s+)?class\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/, kind: "class" },
    { pattern: /^(?:export\s+)?interface\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/, kind: "interface" },
    { pattern: /^(?:export\s+)?(?:async\s+)?(?:const|let|var)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*[:=]/, kind: "variable" },
    { pattern: /^\s+(?:public\s+|private\s+|protected\s+|static\s+|async\s+|get\s+|set\s+)*([a-zA-Z_$][a-zA-Z0-9_$]*)\s*[<(]/, kind: "method" },
    { pattern: /^import\s+\{?\s*([^}]+)\s*\}?\s+from/, kind: "import" },
  ],
  python: [
    { pattern: /^def\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/, kind: "function" },
    { pattern: /^class\s+([a-zA-Z_][a-zA-Z0-9_]*)/, kind: "class" },
    { pattern: /^\s+def\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/, kind: "method" },
    { pattern: /^from\s+(\S+)\s+import/, kind: "import" },
    { pattern: /^import\s+(\S+)/, kind: "import" },
  ],
  java: [
    { pattern: /^(?:public\s+|private\s+|protected\s+)?(?:static\s+)?(?:abstract\s+)?(?:final\s+)?(?:class|interface|enum)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/, kind: "class" },
    { pattern: /^(?:public\s+|private\s+|protected\s+)?(?:static\s+)?(?:final\s+)?(?:<[\w<>,\s?]+>\s+)?[\w<>\[\]]+\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/, kind: "method" },
  ],
  c: [
    { pattern: /^(?:static\s+|inline\s+)?(?:const\s+)?(?:unsigned\s+)?(?:long\s+)?(?:int|char|void|float|double|short|long|struct\s+\w+)\s+\*?([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/, kind: "function" },
    { pattern: /^typedef\s+struct\s+\{/, kind: "struct" },
  ],
  cpp: [
    { pattern: /^(?:static\s+|inline\s+|virtual\s+|const\s+)?(?:unsigned\s+)?(?:long\s+)?(?:int|char|void|float|double|short|long|bool|auto|size_t|string)\s+\*?([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/, kind: "function" },
    { pattern: /^class\s+([a-zA-Z_][a-zA-Z0-9_]*)/, kind: "class" },
    { pattern: /^struct\s+([a-zA-Z_][a-zA-Z0-9_]*)/, kind: "struct" },
  ],
  go: [
    { pattern: /^func\s+(?:\([^)]+\)\s+)?([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/, kind: "function" },
    { pattern: /^type\s+([a-zA-Z_][a-zA-Z0-9_]*)\s+(?:struct|interface)/, kind: "type" },
  ],
  rust: [
    { pattern: /^(?:pub\s+)?(?:async\s+)?(?:unsafe\s+)?fn\s+([a-zA-Z_][a-zA-Z0-9_]*)/, kind: "function" },
    { pattern: /^(?:pub\s+)?(?:struct|enum|trait|impl)\s+([a-zA-Z_][a-zA-Z0-9_]*)/, kind: "type" },
  ],
};

/**
 * 从代码文本中提取符号列表
 */
export function extractSymbols(content: string, language: string): CodeSymbol[] {
  const patterns = LANGUAGE_PATTERNS[language];
  if (!patterns) return [];

  const lines = content.split("\n");
  const symbols: CodeSymbol[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const { pattern, kind } of patterns) {
      const match = line.match(pattern);
      if (match) {
        symbols.push({
          name: match[1] || match[0].trim(),
          kind,
          line: i + 1,
        });
        break;
      }
    }
  }

  return symbols;
}