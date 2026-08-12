/**
 * 崩溃报告模块
 *
 * 收集应用崩溃信息，包括：
 * - 未捕获的异常
 * - 未处理的 Promise 拒绝
 * - 渲染进程崩溃
 * - 系统信息（OS、内存、版本等）
 *
 * 这些信息保存在本地日志文件中，用户可以查看并反馈给开发者。
 */

import log from 'electron-log/main';
import { app } from 'electron';
import * as fs from 'fs';
import { cpus, totalmem, freemem, platform, release, arch } from 'node:os';
import { randomUUID } from 'crypto';

let initialized = false;
let inUncaughtHandler = false;

/**
 * 崩溃报告信息接口
 */
export interface CrashReport {
  /** 报告 ID */
  id: string;
  /** 时间戳 */
  timestamp: string;
  /** 崩溃类型 */
  type: 'uncaught-exception' | 'unhandled-rejection' | 'renderer-crash' | 'ipc-error';
  /** 错误消息 */
  message: string;
  /** 堆栈跟踪 */
  stack?: string;
  /** 额外上下文信息 */
  context?: Record<string, unknown>;
  /** 系统信息 */
  systemInfo: SystemInfo;
}

/**
 * 系统信息接口
 */
export interface SystemInfo {
  /** 应用版本 */
  appVersion: string;
  /** Electron 版本 */
  electronVersion: string;
  /** Chromium 版本 */
  chromiumVersion: string;
  /** 操作系统平台 */
  platform: string;
  /** 操作系统版本 */
  osRelease: string;
  /** CPU 架构 */
  arch: string;
  /** CPU 核心数 */
  cpuCount: number;
  /** CPU 型号 */
  cpuModel: string;
  /** 总内存（GB） */
  totalMemoryGB: number;
  /** 可用内存（GB） */
  freeMemoryGB: number;
  /** 应用运行时间（秒） */
  uptime: number;
}

/**
 * 获取系统信息
 */
export function getSystemInfo(): SystemInfo {
  const cpuList = cpus();
  const totalMem = totalmem();
  const freeMem = freemem();

  return {
    appVersion: app.getVersion(),
    electronVersion: process.versions.electron,
    chromiumVersion: process.versions.chrome,
    platform: platform(),
    osRelease: release(),
    arch: arch(),
    cpuCount: cpuList.length,
    cpuModel: cpuList[0]?.model ?? 'Unknown',
    totalMemoryGB: Math.round((totalMem / (1024 ** 3)) * 10) / 10,
    freeMemoryGB: Math.round((freeMem / (1024 ** 3)) * 10) / 10,
    uptime: Math.round(process.uptime()),
  };
}

/**
 * 生成唯一报告 ID
 */
function generateReportId(): string {
  return randomUUID();
}

/**
 * 记录崩溃报告
 */
export function logCrashReport(
  type: CrashReport['type'],
  message: string,
  stack?: string,
  context?: Record<string, unknown>,
): CrashReport {
  const report: CrashReport = {
    id: generateReportId(),
    timestamp: new Date().toISOString(),
    type,
    message,
    stack,
    context,
    systemInfo: getSystemInfo(),
  };

  // 写入日志文件
  log.error('═══════════════════════════════════════════════════════');
  log.error(`CRASH REPORT: ${report.id}`);
  log.error(`Type: ${type}`);
  log.error(`Message: ${message}`);
  if (stack) log.error(`Stack: ${stack}`);
  // safeStringify：context 若含循环引用，JSON.stringify 会抛异常导致崩溃报告整体丢失
  if (context) {
    try {
      log.error(`Context: ${JSON.stringify(context, null, 2)}`);
    } catch {
      log.error(`Context: ${String(context)}`);
    }
  }
  log.error(`System: ${JSON.stringify(report.systemInfo, null, 2)}`);
  log.error('═══════════════════════════════════════════════════════');

  return report;
}

/**
 * 初始化崩溃报告器
 *
 * 注册全局错误处理钩子，捕获未处理的异常和 Promise 拒绝。
 */
export function initCrashReporter(): void {
  if (initialized) return;
  initialized = true;

  // 捕获未捕获的同步异常
  process.on('uncaughtException', (error: Error) => {
    if (inUncaughtHandler) return;
    inUncaughtHandler = true;
    try {
      logCrashReport('uncaught-exception', error.message, error.stack, {
        name: error.name,
      });
      // electron-log 默认异步写盘，app.exit 不会等待它；先同步刷新确保崩溃报告落盘
      try {
        (log.transports.file as unknown as { flushSync?: () => void }).flushSync?.();
      } catch {
        // 忽略 flush 失败
      }
    } catch {
      // 忽略
    } finally {
      inUncaughtHandler = false;
    }
    app.exit(1);
  });

  // 捕获未处理的 Promise 拒绝
  process.on('unhandledRejection', (reason: unknown) => {
    const message = reason instanceof Error ? reason.message : String(reason);
    const stack = reason instanceof Error ? reason.stack : undefined;
    logCrashReport('unhandled-rejection', message, stack, {
      reasonType: typeof reason,
    });
  });

  log.info('Crash reporter initialized.');
}

/**
 * 获取日志文件路径
 */
export function getLogFilePath(): string {
  if (!log.transports.file) return '';
  return log.transports.file.getFile().path;
}

/**
 * 读取最近的日志行
 */
export function getRecentLogs(lines: number = 100): string {
  try {
    const logPath = getLogFilePath();

    if (!fs.existsSync(logPath)) {
      return 'Log file not found.';
    }

    // 校验 lines 参数，避免非法值导致异常或整文件输出
    const safeLines = Number.isFinite(lines) ? Math.min(10000, Math.max(1, Math.floor(lines))) : 100;
    const content = fs.readFileSync(logPath, 'utf-8');
    const allLines = content.split('\n');
    return allLines.slice(-safeLines).join('\n');
  } catch (err) {
    return `Failed to read logs: ${err instanceof Error ? err.message : String(err)}`;
  }
}
