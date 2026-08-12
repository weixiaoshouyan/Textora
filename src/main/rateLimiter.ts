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

/** 严格限制的通道（更低的限制） */
const STRICT_CHANNELS = new Set([
  'textora:run_tool',
  'textora:fetch_url',
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

/** 按 IPC channel 分别限制的映射 */
const limiters = new Map<string, RateLimiter>();

/** 获取或创建限制器 */
function getLimiter(channel: string): RateLimiter {
  if (!limiters.has(channel)) {
    const config = STRICT_CHANNELS.has(channel) ? STRICT_CONFIG : DEFAULT_CONFIG;
    limiters.set(channel, new RateLimiter(config));
  }
  return limiters.get(channel)!;
}

/** 检查指定通道的速率限制 */
export function checkRateLimit(channel: string): boolean {
  return getLimiter(channel).check();
}

/** 获取指定通道的当前调用计数 */
export function getChannelCallCount(channel: string): number {
  return getLimiter(channel).getCallCount();
}

/** 重置指定通道的限制计数 */
export function resetChannelLimit(channel: string): void {
  getLimiter(channel).reset();
}

/** 重置所有通道的限制计数 */
export function resetAllLimits(): void {
  for (const limiter of limiters.values()) {
    limiter.reset();
  }
}

/** 获取被限制的通道列表（用于日志） */
export function getLimitedChannels(): string[] {
  const result: string[] = [];
  for (const [channel, limiter] of limiters.entries()) {
    if (limiter.getCallCount() >= DEFAULT_CONFIG.maxCalls) {
      result.push(channel);
    }
  }
  return result;
}
