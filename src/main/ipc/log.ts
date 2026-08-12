/**
 * IPC 处理器：日志 / 版本 / 系统信息
 */
import { app, ipcMain } from 'electron';
import log from 'electron-log/main';
import { getRecentLogs, getSystemInfo, getLogFilePath } from './crashReporter';

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    try {
      return String(value);
    } catch {
      return '[Unserializable]';
    }
  }
}

export function registerLogHandlers(): void {
  // 渲染端日志统一转发（来自 window.textora.log）
  // 注意：preload.ts ALLOWED_SEND_CHANNELS 只放行 textora:renderer-log，
  // 旧的 textora:log 通道已废弃并从 preload 白名单移除，故此处不再注册。
  ipcMain.on('textora:renderer-log', (_evt, payload: { level: 'info' | 'warn' | 'error'; message: string; extra?: unknown }) => {
    const { level, message, extra } = payload || {};
    // 截断超长消息：渲染层可发送任意长度字符串，不限制会刷爆日志文件
    const maxLen = 8192;
    const msg = typeof message === 'string' ? message.slice(0, maxLen) : String(message ?? '').slice(0, maxLen);
    // JSON.stringify 对 BigInt/循环引用会抛异常；该回调内同步抛错会传播到
    // uncaughtException → app.exit(1)，等于把日志通道变成崩溃入口，必须兜底
    let suffix = '';
    if (extra !== undefined) {
      const rendered = typeof extra === 'string' ? extra : safeStringify(extra);
      suffix = ' ' + rendered.slice(0, maxLen);
    }
    if (level === 'error') log.error(`[Renderer] ${msg}${suffix}`);
    else if (level === 'warn') log.warn(`[Renderer] ${msg}${suffix}`);
    else log.info(`[Renderer] ${msg}${suffix}`);
  });

  ipcMain.handle('textora:get_app_version', (): string => app.getVersion());
  ipcMain.handle('textora:get_system_locale', (): string => app.getLocale());
  ipcMain.handle('textora:get_log_path', (): string => {
    // file transport 未初始化时 getFile() 可能抛错
    try {
      return getLogFilePath();
    } catch {
      return '';
    }
  });

  // 获取最近的日志内容（用于"打开日志"功能）
  ipcMain.handle('textora:get_recent_lines', (_evt, lines?: number): string => {
    return getRecentLogs(lines ?? 100);
  });

  // 获取系统信息（用于崩溃报告和调试）
  ipcMain.handle('textora:get_system_info', () => {
    return getSystemInfo();
  });
}
