/**
 * 文本编码自动检测（纯函数，无副作用，无 Electron 依赖）
 *
 * 背景：Windows 上大量中文文本文件是「无 BOM 的 GBK/GB2312」，按 UTF-8 解码会出现
 * U+FFFD（替换字符），旧逻辑此时回退 latin1，同样会显示成乱码（"中文" → "ÖÐÎÄ"）。
 * 因此在不带 BOM 且 UTF-8 校验失败时，先尝试按 GBK 特征判定，再兜底 latin1。
 *
 * 判定顺序（与 Typora / VS Code 的思路一致）：
 *   1. BOM（UTF-8 / UTF-16LE / UTF-16BE）
 *   2. UTF-8 字节序列严格校验（合法即 utf-8，纯 ASCII 天然合法）
 *   3. GBK 特征匹配（无任何非法序列 + 汉字/全角符号达到阈值）
 *   4. latin1 兜底（逐字节可解，永不失败）
 */

export type DetectedEncoding =
  | 'utf-8'
  | 'utf-8-bom'
  | 'utf-16le'
  | 'utf-16be'
  | 'gbk'
  | 'latin1';

/**
 * GBK 判定阈值（详见 looksLikeGbk 注释）：
 * - 汉字/全角符号对数 >= 2 → 判定 GBK
 * - 或仅有 1 对、但这对字节占整个缓冲区 >= 30% → 判定 GBK
 *   （覆盖 "中" 这类只有单个汉字的极短文件；同时避免 "Übergröße" 这类
 *     latin1 西欧文本被误判，其汉字字节占比通常远低于 30%）
 */
const GBK_MIN_CJK_PAIRS = 2;
const GBK_MIN_CJK_RATIO = 0.3;

/** 严格 UTF-8 校验：手工逐字节扫描，拒绝超长编码（overlong）、
 *  UTF-16 代理区（U+D800–U+DFFF）、超出 U+10FFFF 以及被截断的序列。
 *  相比 `buf.toString('utf-8')` 后再比较，避免了一次完整的字符串分配。
 *  导出供单元测试使用。 */
export function isValidUtf8(buf: Buffer): boolean {
  const len = buf.length;
  let i = 0;
  while (i < len) {
    const b = buf[i];
    if (b <= 0x7f) {
      i++;
      continue;
    }

    let extra: number;
    let lower: number;
    let upper: number;
    if (b >= 0xc2 && b <= 0xdf) {
      extra = 1; lower = 0x80; upper = 0xbf;
    } else if (b === 0xe0) {
      // 首字节 0xe0：第二字节 >= 0xa0，排除三字节超长编码
      extra = 2; lower = 0xa0; upper = 0xbf;
    } else if (b >= 0xe1 && b <= 0xec) {
      extra = 2; lower = 0x80; upper = 0xbf;
    } else if (b === 0xed) {
      // 首字节 0xed：第二字节 <= 0x9f，排除代理区 U+D800–U+DFFF
      extra = 2; lower = 0x80; upper = 0x9f;
    } else if (b === 0xee || b === 0xef) {
      extra = 2; lower = 0x80; upper = 0xbf;
    } else if (b === 0xf0) {
      // 首字节 0xf0：第二字节 >= 0x90，排除四字节超长编码
      extra = 3; lower = 0x90; upper = 0xbf;
    } else if (b >= 0xf1 && b <= 0xf3) {
      extra = 3; lower = 0x80; upper = 0xbf;
    } else if (b === 0xf4) {
      // 首字节 0xf4：第二字节 <= 0x8f，排除 > U+10FFFF
      extra = 3; lower = 0x80; upper = 0x8f;
    } else {
      // 0x80–0xc1（孤立续字节 / 两字节超长编码）、0xf5–0xff
      return false;
    }

    if (i + extra >= len) return false; // 序列被截断
    const second = buf[i + 1];
    if (second < lower || second > upper) return false;
    for (let k = 2; k <= extra; k++) {
      const c = buf[i + k];
      if (c < 0x80 || c > 0xbf) return false;
    }
    i += extra + 1;
  }
  return true;
}

/**
 * GBK/GB2312 特征匹配。
 *
 * 字节规则：
 * - 单字节：0x00–0x80（ASCII，0x80 在 CP936 中映射为欧元符号）
 * - 双字节：首字节 0x81–0xFE，尾字节 0x40–0xFE（排除 0x7F）
 *
 * 只统计「汉字/全角符号」对（GB2312 汉字区首字节 0xB0–0xF7、符号区 0xA1–0xA9，
 * 且尾字节 0xA1–0xFE）作为强特征。这样既能在「中英混排」文本上命中，又能避免把
 * latin1 西欧文本（如 "cafés"、"Übergröße"）误判为 GBK——那些字节对虽然落在
 * 合法 GBK 双字节范围内，但尾字节落在 ASCII 区（0x40–0xA0），不构成汉字特征。
 */
function looksLikeGbk(buf: Buffer): boolean {
  const len = buf.length;
  let cjkPairs = 0;
  let i = 0;

  while (i < len) {
    const b = buf[i];
    if (b <= 0x80) {
      i++;
      continue;
    }
    if (b === 0xff) return false; // 0xff 不是合法 GBK 首字节

    if (i + 1 >= len) return false; // 首字节后无尾字节：非法序列
    const trail = buf[i + 1];
    if (trail < 0x40 || trail > 0xfe || trail === 0x7f) return false;

    const isHan = b >= 0xb0 && b <= 0xf7 && trail >= 0xa1 && trail <= 0xfe;
    const isSymbol = b >= 0xa1 && b <= 0xa9 && trail >= 0xa1 && trail <= 0xfe;
    if (isHan || isSymbol) cjkPairs++;

    i += 2;
  }

  if (cjkPairs === 0) return false;
  if (cjkPairs >= GBK_MIN_CJK_PAIRS) return true;
  // 仅 1 对：要求其字节占比足够高，避免长文本里偶发的 latin1 字节对被放大
  return (cjkPairs * 2) / len >= GBK_MIN_CJK_RATIO;
}

/**
 * 检测缓冲区最可能的文本编码。
 *
 * @param buf 文件原始字节（可为空；空缓冲按 utf-8 处理）
 */
export function detectTextEncoding(buf: Buffer): DetectedEncoding {
  if (!buf || buf.length === 0) return 'utf-8';

  // 1) BOM
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    return 'utf-8-bom';
  }
  if (buf.length >= 2) {
    if (buf[0] === 0xff && buf[1] === 0xfe) return 'utf-16le';
    if (buf[0] === 0xfe && buf[1] === 0xff) return 'utf-16be';
  }

  // 2) UTF-8 严格校验
  if (isValidUtf8(buf)) return 'utf-8';

  // 3) GBK 特征匹配
  if (looksLikeGbk(buf)) return 'gbk';

  // 4) 兜底
  return 'latin1';
}
