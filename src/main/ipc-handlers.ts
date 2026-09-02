/**
 * IPC Handlers 聚合注册入口
 *
 * 实际处理逻辑已按职责拆分到 ./ipc/ 子目录：
 *   - log.ts      日志 / 版本 / 系统信息
 *   - files.ts    文件读写 / 目录列表 / 文件监听 / 图片二进制 / 高级编码
 *   - search.ts   文件搜索 / 列表
 *   - secrets.ts  加密敏感信息存储
 *   - export.ts   PDF / PNG 导出
 *   - dialogs.ts  原生对话框 + 在文件管理器中打开
 *   - window.ts   窗口控制 / 菜单派发 / 标题
 *   - tools.ts    外部工具调用
 *
 * 本文件只负责把 deps 透传给各子模块，保持入口（index.ts）调用不变。
 */
import { BrowserWindow } from 'electron';
import { registerLogHandlers } from './ipc/log';
import { registerFileHandlers } from './ipc/files';
import { registerSearchHandlers } from './ipc/search';
import { registerSecretHandlers } from './ipc/secrets';
import { registerExportHandlers } from './ipc/export';
import { registerDialogHandlers } from './ipc/dialogs';
import { registerWindowHandlers } from './ipc/window';
import { registerToolHandlers } from './ipc/tools';
import { registerPdfHandlers } from './ipc/pdf';
import type { WatcherCollection } from './watcherCleanup';

export interface IpcDeps {
  getMainWindow: () => BrowserWindow | null;
  dirWatchers: Map<string, WatcherCollection>;
}

export function registerIpcHandlers(deps: IpcDeps): void {
  registerLogHandlers();
  registerFileHandlers(deps);
  registerSearchHandlers();
  registerSecretHandlers();
  registerExportHandlers();
  registerDialogHandlers(deps);
  registerWindowHandlers(deps);
  registerToolHandlers();
  registerPdfHandlers();
}
