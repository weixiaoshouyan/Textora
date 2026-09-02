/**
 * IPC 速率限制器
 *
 * 防止恶意脚本高频调用 IPC，保护主进程安全。
 */

interface RateLimitConfig {
  /** 时间窗口内最大调用次数 */
  maxCalls: number;
  /** 时间窗口大小（毫秒） */
  windowMs: number;
}

const DEFAULT_CONFIG: RateLimitConfig = {
  maxCalls: 100,
  windowMs: 10_000, // 10秒内最多100次调用
};

/** 严格限制的通道（更低的限制）——重 IO / 可被高频滥用的通道 */
const STRICT_CHANNELS = new Set([
  'textora:run_tool',
  'textora:fetch_url',
  'textora:search_in_files',
  'textora:export_pdf',
  'textora:export_png',
  // 高危/重 IO 通道：递归删除、二进制大文件读取、目录枚举、文件监听
  'textora:remove_path',
  'textora:read_binary_file',
  'textora:read_text_file',
  'textora:list_all_files',
  'textora:list_md_files',
  'textora:get_recent_lines',
  'textora:watch_dir',
  'textora:read_pdf_file',
]);

const STRICT_CONFIG: RateLimitConfig = {
  maxCalls: 20,
  windowMs: 10_000, // 10秒内最多20次调用
};

export class RateLimiter {
  private calls: number[] = [];

  constructor(private config: RateLimitConfig = DEFAULT_CONFIG) {}

  /** 检查是否允许调用，返回 true 表示允许 */
  check(): boolean {
    const now = Date.now();
    // 清理过期记录
    this.calls = this.calls.filter((t) => now - t < this.config.windowMs);
    if (this.calls.length >= this.config.maxCalls) {
      return false;
    }
    this.calls.push(now);
    return true;
  }

  /** 获取当前窗口内的调用次数 */
  getCallCount(): number {
    const now = Date.now();
    this.calls = this.calls.filter((t) => now - t < this.config.windowMs);
    return this.calls.length;
  }

  /** 重置计数器 */
  reset(): void {
    this.calls = [];
  }
}

/** 按 IPC channel 分别限制的映射（limiter + 其配置，供 getLimitedChannels 判断） */
const limiters = new Map<string, { limiter: RateLimiter; config: RateLimitConfig }>();

/** 获取或创建限制器 */
function getLimiter(channel: string): { limiter: RateLimiter; config: RateLimitConfig } {
  if (!limiters.has(channel)) {
    const config = STRICT_CHANNELS.has(channel) ? STRICT_CONFIG : DEFAULT_CONFIG;
    limiters.set(channel, { limiter: new RateLimiter(config), config });
  }
  return limiters.get(channel)!;
}

/** 检查指定通道的速率限制 */
export function checkRateLimit(channel: string): boolean {
  return getLimiter(channel).limiter.check();
}

/** 获取指定通道的当前调用计数 */
export function getChannelCallCount(channel: string): number {
  return getLimiter(channel).limiter.getCallCount();
}

/** 重置指定通道的限制计数 */
export function resetChannelLimit(channel: string): void {
  getLimiter(channel).limiter.reset();
}

/** 重置所有通道的限制计数 */
export function resetAllLimits(): void {
  for (const { limiter } of limiters.values()) {
    limiter.reset();
  }
}

/** 获取被限制的通道列表（用于日志） */
export function getLimitedChannels(): string[] {
  const result: string[] = [];
  for (const [channel, { limiter, config }] of limiters.entries()) {
    // 用该通道自己的配置判断（strict 通道上限是 20，不是 DEFAULT_CONFIG 的 100）
    if (limiter.getCallCount() >= config.maxCalls) {
      result.push(channel);
    }
  }
  return result;
}
