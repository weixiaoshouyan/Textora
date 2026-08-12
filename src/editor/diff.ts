/**
 * 轻量行级 diff：基于 LCS（最长公共子序列）算法。
 * 不依赖外部库，纯函数实现，适合中小型文件（< 2000 行）。
 *
 * 用法：
 *   const result = diffTexts(textA, textB);
 *   // result: DiffLine[]，按顺序展示两边的行
 */

export type DiffLineType = "equal" | "add" | "del";

export interface DiffLine {
  type: DiffLineType;
  /** 该行文本内容（不含换行符） */
  text: string;
  /** 对应左文件行号（1-based），del/equal 有值，add 为 null */
  leftLine: number | null;
  /** 对应右文件行号（1-based），add/equal 有值，del 为 null */
  rightLine: number | null;
}

/** diff 统计信息 */
export interface DiffStats {
  additions: number;
  deletions: number;
  unchanged: number;
}

/**
 * 计算两个文本数组的 LCS 长度矩阵。
 * 为节省内存，仅保留前一行用于回溯路径时使用完整矩阵。
 * 对超过阈值的文件降级为简单逐行比较（避免 OOM 与卡顿）。
 * 阈值 800：800×800 约 64 万次迭代 + 5MB 矩阵，每次输入重算约 1-2ms；
 * 原 2000×2000 需 400 万次迭代并分配约 60MB 双层数组，输入时明显卡顿。
 */
const LCS_MAX_DIMENSION = 800;

function lcsMatrix(a: string[], b: string[]): number[][] {
  const n = a.length;
  const m = b.length;
  // 大文件保护：超过阈值则返回空矩阵，调用方会走退化路径
  if (n > LCS_MAX_DIMENSION || m > LCS_MAX_DIMENSION) return [];
  const dp: number[][] = Array.from({ length: n + 1 }, () =>
    new Array(m + 1).fill(0)
  );
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }
  return dp;
}

/**
 * 基于 LCS 矩阵回溯，生成 diff 序列。
 */
function backtrack(
  dp: number[][],
  a: string[],
  b: string[],
  i: number,
  j: number,
  out: DiffLine[]
): void {
  // 改为循环以避免大文件递归栈溢出
  const stack: Array<[number, number]> = [[i, j]];
  const temp: DiffLine[] = [];
  while (stack.length > 0) {
    const [ci, cj] = stack.pop()!;
    if (ci > 0 && cj > 0 && a[ci - 1] === b[cj - 1]) {
      temp.push({ type: "equal", text: a[ci - 1], leftLine: ci, rightLine: cj });
      stack.push([ci - 1, cj - 1]);
    } else if (cj > 0 && (ci === 0 || dp[ci][cj - 1] >= dp[ci - 1][cj])) {
      temp.push({ type: "add", text: b[cj - 1], leftLine: null, rightLine: cj });
      stack.push([ci, cj - 1]);
    } else if (ci > 0 && (cj === 0 || dp[ci][cj - 1] < dp[ci - 1][cj])) {
      temp.push({ type: "del", text: a[ci - 1], leftLine: ci, rightLine: null });
      stack.push([ci - 1, cj]);
    }
  }
  // 反转得到正确顺序
  for (let k = temp.length - 1; k >= 0; k--) out.push(temp[k]);
}

/**
 * 退化路径：大文件时先压缩公共前缀/后缀，再对中间差异区逐行比较。
 * 相比纯逐行比较，插入/删除若干行时其余行仍能正确对齐 equal，
 * 不会出现"插入一行导致后面所有行都变成 del+add 错位"的劣质结果。
 */
function fallbackDiff(a: string[], b: string[]): DiffLine[] {
  const out: DiffLine[] = [];
  // 公共前缀
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  for (let k = 0; k < i; k++) {
    out.push({ type: "equal", text: a[k], leftLine: k + 1, rightLine: k + 1 });
  }
  // 公共后缀（从后往前收集，最后反转）
  let ai = a.length - 1;
  let bi = b.length - 1;
  const suffix: DiffLine[] = [];
  while (ai >= i && bi >= i && a[ai] === b[bi]) {
    suffix.push({ type: "equal", text: a[ai], leftLine: ai + 1, rightLine: bi + 1 });
    ai--;
    bi--;
  }
  // 中间差异区：del 在前、add 在后（与 LCS 回溯的顺序语义一致）
  for (let k = i; k <= ai; k++) {
    out.push({ type: "del", text: a[k], leftLine: k + 1, rightLine: null });
  }
  for (let k = i; k <= bi; k++) {
    out.push({ type: "add", text: b[k], leftLine: null, rightLine: k + 1 });
  }
  for (let k = suffix.length - 1; k >= 0; k--) out.push(suffix[k]);
  return out;
}

/**
 * 计算两个文本的行级 diff。
 * @param textA 原始文本（左侧）
 * @param textB 修改后文本（右侧）
 * @returns DiffLine[] 按顺序展示差异
 */
export function diffTexts(textA: string, textB: string): DiffLine[] {
  // 统一换行处理：按 \n 切分，\r\n 自动处理
  const a = textA.length ? textA.replace(/\r\n/g, "\n").split("\n") : [];
  const b = textB.length ? textB.replace(/\r\n/g, "\n").split("\n") : [];

  const dp = lcsMatrix(a, b);
  if (dp.length === 0) return fallbackDiff(a, b);

  const out: DiffLine[] = [];
  backtrack(dp, a, b, a.length, b.length, out);
  return out;
}

/** 计算 diff 统计信息 */
export function diffStats(lines: DiffLine[]): DiffStats {
  let additions = 0;
  let deletions = 0;
  let unchanged = 0;
  for (const l of lines) {
    if (l.type === "add") additions++;
    else if (l.type === "del") deletions++;
    else unchanged++;
  }
  return { additions, deletions, unchanged };
}
