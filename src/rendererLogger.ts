/**
 * 渲染端日志器：把渲染进程的日志统一转发到主进程的 electron-log，
 * 这样渲染端的报错也能在 %APPDATA%/Textora/logs/main.log 里看到。
 *
 * 用法：
 *   import { rlog } from './rendererLogger';
 *   rlog.info('xxx');
 *   rlog.error('crashed', err);
 */

type LogLevel = 'info' | 'warn' | 'error';

function send(level: LogLevel, message: string, extra?: unknown) {
  try {
    // 兼容 SSR / 测试环境（window.textora 不存在时降级到 console）
    const bridge = (window as any)?.textora;
    if (bridge && typeof bridge.log === 'function') {
      bridge.log(level, message, extra);
    } else {
      // 降级：本地 console
      const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
      fn(`[rlog][${level}] ${message}`, extra !== undefined ? extra : '');
    }
  } catch {
    // 忽略日志本身的错误，避免日志导致业务崩溃
  }
}

export const rlog = {
  info: (msg: string, extra?: unknown) => send('info', msg, extra),
  warn: (msg: string, extra?: unknown) => send('warn', msg, extra),
  error: (msg: string, extra?: unknown) => send('error', msg, extra),
};

/**
 * 安装全局未捕获异常钩子。在 App.tsx 顶层调用一次即可。
 */
let handlersInstalled = false;

export function installGlobalErrorHandlers() {
  if (typeof window === 'undefined') return;
  if (handlersInstalled) return;
  handlersInstalled = true;

  window.addEventListener('error', (e) => {
    rlog.error('Uncaught error', {
      message: e.message,
      filename: e.filename,
      line: e.lineno,
      col: e.colno,
      stack: (e.error as Error)?.stack,
    });
  });

  window.addEventListener('unhandledrejection', (e) => {
    rlog.error('Unhandled promise rejection', {
      reason: e.reason instanceof Error ? e.reason.stack : String(e.reason),
    });
  });
}
