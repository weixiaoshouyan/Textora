/**
 * 共享的 ReDoS 防护工具（渲染层与主进程共用，避免两处实现漂移）。
 * 启发式检测容易导致灾难性回溯（ReDoS）的正则模式。
 * 覆盖最常见的嵌套量词 / 相邻可重复分组 / 交替分支不等长：
 * (a+)+、(a*)*、(a?)+、(a+)(b+)+、(a|aa)+、(a?|a)+ 等。
 */

// 正则模式的最大长度：超长模式几乎必然是生成/恶意输入，直接拒绝
export const MAX_REGEX_PATTERN_LENGTH = 200;

const QUANT = "(?:[+*?]|\\{[0-9]+(?:,[0-9]*)?\\})";

/**
 * 任意深度的嵌套量词检测（含包装括号绕过）：
 * (a+)+、(a*)*、((a+)*)、(?:(a+)*)、a(a+)+b、(a+)(b+)+ 等。
 * 思路：反复剥掉最内层括号组。若某组内容（剥壳后）含量词标记，且该组后紧跟量词
 * （"紧跟"包括外层 `)` 之后由外层组再带的量词），即为经典灾难性回溯模式。
 */
function hasNestedQuantifier(p: string): boolean {
  let s = p;
  for (let k = 0; k < 64; k++) {
    // 最内层组：内容不含括号
    const m = s.match(/\(([^()]*)\)/);
    if (!m) break;
    const inner = m[1];
    // X 表示"已剥掉的含量词组"，x 表示普通组
    const innerHasQ = /[X+*?]|\{[0-9]+(?:,[0-9]*)?\}/.test(inner);
    const idx = m.index!;
    const after = s[idx + m[0].length];
    const afterQ = after === "+" || after === "*" || after === "?" ||
      /^\{[0-9]+(?:,[0-9]*)?\}/.test(s.slice(idx + m[0].length));
    if (innerHasQ && afterQ) return true;
    s = s.slice(0, idx) + (innerHasQ ? "X" : "x") + s.slice(idx + m[0].length);
  }
  return false;
}

export function isDangerousRegex(pattern: string): boolean {
  // 超长模式直接拒绝（用户几乎不会手写 200+ 字符的正则）
  if (pattern.length > MAX_REGEX_PATTERN_LENGTH) return true;
  // 去掉转义字符与字符类内容，避免误伤合法写法
  let p = pattern.replace(/\\./g, "");
  p = p.replace(/\[[^\]]*\]/g, "x");
  // 嵌套量词（任意深度，含包装括号绕过）
  if (hasNestedQuantifier(p)) return true;
  // 交替内分支不等长 + 外层量词：(a|aa)+ (a?|a)+ 等经典 ReDoS
  // （分支相同时如 (a|a)+ 无歧义回溯，放行）
  const alt = p.match(new RegExp(`\\(([^()]*)\\|([^()]*)\\)${QUANT}`));
  if (alt && alt[1] !== alt[2]) return true;
  return false;
}
