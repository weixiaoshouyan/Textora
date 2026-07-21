/**
 * 轻量行级 diff：基于 LCS（最长公共子序列）算法。
 * 不依赖外部库，纯函数实现，适合中小型文件（< 5000 行）。
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
 * 对超过 5000 行的文件降级为简单逐行比较（避免 OOM）。
 */
function lcsMatrix(a: string[], b: string[]): number[][] {
  const n = a.length;
  const m = b.length;
  // 大文件保护：超过阈值则返回空矩阵，调用方会走退化路径
  if (n > 5000 || m > 5000) return [];
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
 * 退化路径：大文件时逐行比较，相同行标记 equal，其余作为整体替换。
 * 虽不精确，但保证可用且不卡死。
 */
function fallbackDiff(a: string[], b: string[]): DiffLine[] {
  const out: DiffLine[] = [];
  const max = Math.max(a.length, b.length);
  for (let i = 0; i < max; i++) {
    const la = a[i];
    const lb = b[i];
    if (la !== undefined && lb !== undefined && la === lb) {
      out.push({ type: "equal", text: la, leftLine: i + 1, rightLine: i + 1 });
    } else {
      if (la !== undefined) {
        out.push({ type: "del", text: la, leftLine: i + 1, rightLine: null });
      }
      if (lb !== undefined) {
        out.push({ type: "add", text: lb, leftLine: null, rightLine: i + 1 });
      }
    }
  }
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
