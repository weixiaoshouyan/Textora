/**
 * 源码编辑器通用工具。
 */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function getUniqueWords(text: string): string[] {
  const words = new Set<string>();
  const re = /\b[a-zA-Z_$][a-zA-Z0-9_$]{2,}\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) words.add(m[0]);
  return Array.from(words).sort();
}
