/**
 * Textora Electron 主进程入口
 *
 * 职责：
 * 1. 创建应用主窗口并管理其生命周期
 * 2. 处理单实例锁、文件打开（argv / open-file 事件）
 * 3. 注册全部 IPC 处理器（委托给 ipc-handlers 模块）
 * 4. 构建应用菜单（委托给 menu 模块）
 */

import { app, BrowserWindow } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import log from 'electron-log/main';
import { autoUpdater } from 'electron-updater';
import { detectFileFromArgv } from './shared';
import { buildMenu } from './menu';
import { registerIpcHandlers } from './ipc-handlers';

// 初始化 electron-log：写入本地日志文件，便于用户反馈问题时附带
log.initialize();
log.transports.file.level = 'info';
log.transports.console.level = 'debug';

// 配置自动更新
autoUpdater.logger = log;
autoUpdater.autoDownload = false; // 不自动下载，先通知用户

// ============================================================================
// 全局状态
// ============================================================================

let mainWindow: BrowserWindow | null = null;
let pendingOpenFile: string | null = null;
let isQuitting = false;
let currentLocale = 'zh';

const dirWatchers = new Map<string, fs.FSWatcher[]>();

// ============================================================================
// 窗口创建
// ============================================================================

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: 'Textora',
    center: true,
    show: false,
    autoHideMenuBar: false,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
    if (pendingOpenFile) {
      mainWindow?.webContents.send('textora:open-file', pendingOpenFile);
      pendingOpenFile = null;
    }
  });

  const isDev = process.env.NODE_ENV === 'development' || process.env.TEXTORA_DEV === '1';
  if (isDev) {
    mainWindow.loadURL('http://localhost:1420');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'index.html'));
  }

  // 窗口关闭时检查未保存的文件
  mainWindow.on('close', (e) => {
    if (isQuitting) return;
    mainWindow?.webContents.send('textora:close-request');
    e.preventDefault();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  buildMenu(mainWindow, currentLocale);
}

// ============================================================================
// 启动
// ============================================================================

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  log.info('Another instance is running, quitting.');
  app.quit();
} else {
  log.info(`Textora v${app.getVersion()} starting...`);

  // 捕获未处理的异常/拒绝，写入日志
  process.on('uncaughtException', (err) => {
    log.error('Uncaught Exception:', err);
  });
  process.on('unhandledRejection', (reason) => {
    log.error('Unhandled Rejection:', reason);
  });

  app.on('second-instance', (_evt, argv) => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
      const fileToOpen = detectFileFromArgv(argv);
      if (fileToOpen) {
        mainWindow.webContents.send('textora:open-file', fileToOpen);
      }
    }
  });

  app.whenReady().then(() => {
    // 注册 IPC 处理器
    registerIpcHandlers({
      getMainWindow: () => mainWindow,
      dirWatchers,
    });

    // 渲染进程通知语言切换，重建菜单
    const { ipcMain } = require('electron');
    ipcMain.on('textora:set-locale', (_evt: unknown, locale: string) => {
      currentLocale = locale;
      buildMenu(mainWindow, locale);
    });

    // 渲染进程确认可以关闭时，主动退出
    ipcMain.on('textora:ready-to-close', () => {
      isQuitting = true;
      mainWindow?.destroy();
      if (process.platform !== 'darwin') {
        app.quit();
      }
    });

    // 窗口控制：关闭
    ipcMain.on('textora:window-close', () => {
      isQuitting = true;
      mainWindow?.close();
    });

    createWindow();
    log.info('App ready, window created.');

    // 自动更新：启动后 3 秒检查更新
    setTimeout(() => {
      autoUpdater.checkForUpdates().catch((err: Error) => {
        log.warn('Update check failed:', err.message);
      });
    }, 3000);

    autoUpdater.on('update-available', (info: { version: string; releaseNotes?: string | null }) => {
      log.info(`Update available: v${info.version}`);
      mainWindow?.webContents.send('textora:update-available', {
        version: info.version,
        releaseNotes: info.releaseNotes,
      });
    });

    autoUpdater.on('update-downloaded', (info: { version: string }) => {
      log.info(`Update downloaded: v${info.version}`);
      mainWindow?.webContents.send('textora:update-downloaded', { version: info.version });
    });

    // 渲染进程触发下载/安装更新
    ipcMain.on('textora:download-update', () => {
      autoUpdater.downloadUpdate().catch((err: Error) => log.error('Download update failed:', err));
    });
    ipcMain.on('textora:install-update', () => {
      isQuitting = true;
      autoUpdater.quitAndInstall();
    });

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });

  app.on('before-quit', async () => {
    // 关闭所有目录监听
    for (const ws of dirWatchers.values()) {
      for (const w of ws) {
        try { w.close(); } catch { /* ignore */ }
      }
    }
    dirWatchers.clear();
  });
}
