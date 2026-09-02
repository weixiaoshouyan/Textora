/**
 * Textora Electron 主进程入口
 *
 * 职责：
 * 1. 创建应用主窗口并管理其生命周期
 * 2. 处理单实例锁、文件打开（argv / open-file 事件）
 * 3. 注册全部 IPC 处理器（委托给 ipc-handlers 模块）
 * 4. 构建应用菜单（委托给 menu 模块）
 */

import { app, BrowserWindow, ipcMain } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import log from 'electron-log/main';
import { autoUpdater } from 'electron-updater';
import { detectFileFromArgv } from './shared';
import { buildMenu } from './menu';
import { registerIpcHandlers } from './ipc-handlers';
import { closeWatcherEntry, type WatcherCollection } from './watcherCleanup';
import { initCrashReporter } from './ipc/crashReporter';
import { hasOpenNativeDialog } from './ipc/dialogs';

// 初始化 electron-log：写入本地日志文件，便于用户反馈问题时附带
log.initialize();
log.transports.file.level = 'info';
log.transports.console.level = 'debug';

// 初始化崩溃报告器（必须在其他可能抛出异常的代码之前调用）
initCrashReporter();

// 部分 Windows GPU 驱动会导致渲染进程崩溃（白屏），默认保留硬件加速；
// 遇到此类问题时设置 TEXTORA_DISABLE_GPU=1 可禁用（必须在 app.ready 之前调用）
if (process.env.TEXTORA_DISABLE_GPU === '1') {
  app.disableHardwareAcceleration();
}

// E2E 测试模式：隔离 userData（设置/日志/缓存），避免污染真实用户数据
if (process.env.TEXTORA_E2E) {
  app.setPath('userData', path.join(app.getPath('temp'), 'textora-e2e-profile'));
}

// 配置自动更新
autoUpdater.logger = log;
autoUpdater.autoDownload = false; // 不自动下载，先通知用户

// ============================================================================
// 全局状态
// ============================================================================

const windows = new Set<BrowserWindow>();
let mainWindow: BrowserWindow | null = null;
let pendingOpenFile: string | null = null;
let isQuitting = false;
let currentLocale = 'zh';

const dirWatchers = new Map<string, WatcherCollection>();

// 渲染进程崩溃重载限频：webContentsId -> 最近 60 秒内的崩溃时间戳
const crashReloadTimes = new Map<number, number[]>();

interface WindowCloseState {
  requested: boolean;
  clearTimer: (() => void) | null;
}
// 每窗口关闭流程状态：防止重复发送 close-request；支持用户取消后重置
const windowCloseStates = new WeakMap<BrowserWindow, WindowCloseState>();

function getWindowCloseState(win: BrowserWindow): WindowCloseState {
  let state = windowCloseStates.get(win);
  if (!state) {
    state = { requested: false, clearTimer: null };
    windowCloseStates.set(win, state);
  }
  return state;
}

function safeSend(win: BrowserWindow | null, channel: string, ...args: unknown[]): void {
  if (win && !win.isDestroyed() && !win.webContents.isDestroyed()) {
    try {
      win.webContents.send(channel, ...args);
    } catch {
      // 窗口或 webContents 已销毁，忽略
    }
  }
}

// ============================================================================
// 窗口创建
// ============================================================================

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
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

  windows.add(win);
  // 记录 webContents id，供窗口关闭时清理该窗口拥有的目录监听
  const ownerId = win.webContents.id;

  // ===== 导航防护 =====
  // 渲染层被注入/拖拽恶意内容后可能尝试 location.href 跳转到任意外部页面：
  // 主窗口只允许加载本地应用页面（生产 file://，开发 http://localhost:1420）。
  // 注意：不能用后面声明的 isDev 变量（TDZ），这里直接读环境变量。
  const devAppUrl = (process.env.NODE_ENV === 'development' || process.env.TEXTORA_DEV === '1')
    ? 'http://localhost:1420'
    : null;
  win.webContents.on('will-navigate', (e, url) => {
    if (devAppUrl && url.startsWith(devAppUrl)) return;
    if (!url.startsWith('file://')) {
      log.warn(`Blocked navigation to ${url}`);
      e.preventDefault();
    }
  });
  // 新窗口一律拒绝；http(s) 外链交给系统浏览器打开
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) {
      void import('electron').then(({ shell }) => shell.openExternal(url));
    } else {
      log.warn(`Blocked window.open to ${url}`);
    }
    return { action: 'deny' };
  });

  // 渲染进程加载失败时记录日志（原代码缺少该监听，导致 ready-to-show 不触发时无任何错误信息）
  win.webContents.on('did-fail-load', (_e, errorCode, errorDescription, validatedURL) => {
    log.error(`Renderer did-fail-load: code=${errorCode} desc=${errorDescription} url=${validatedURL}`);
  });
  win.webContents.on('render-process-gone', (_e, details) => {
    log.error('Renderer process gone:', JSON.stringify(details));
    // 渲染进程崩溃后窗口会白屏：在非主动退出场景下重新加载页面恢复。
    // 限频：60 秒内最多重载 3 次，防止崩溃循环时无限重载打满 CPU/日志
    const now = Date.now();
    const recent = (crashReloadTimes.get(ownerId) || []).filter((t) => now - t < 60_000);
    recent.push(now);
    crashReloadTimes.set(ownerId, recent);
    if (recent.length > 3) {
      log.error('Renderer crashed repeatedly; stop auto-reloading.');
      return;
    }
    if (!isQuitting && !win.isDestroyed()) {
      log.info('Reloading window after renderer crash...');
      win.webContents.reload();
    }
  });
  win.webContents.on('console-message', (_e, level, message, line, sourceId) => {
    // Electron level: 0=verbose 1=info 2=warning 3=error（旧式数字签名）
    const levelMap: Array<'debug' | 'info' | 'warn' | 'error'> = ['debug', 'info', 'warn', 'error'];
    const lvl = levelMap[level] ?? 'debug';
    const logger = lvl === 'error' ? log.error : lvl === 'warn' ? log.warn : lvl === 'info' ? log.info : log.debug;
    logger(`[Renderer][${lvl}] ${message} (${sourceId}:${line})`);
  });

  win.once('ready-to-show', () => {
    win.show();
    if (pendingOpenFile && win === mainWindow) {
      win.webContents.send('textora:open-file', pendingOpenFile);
      pendingOpenFile = null;
    }
  });

  // 兜底：若 ready-to-show 在 8 秒内未触发（渲染进程加载异常），强制显示窗口以便用户看到错误
  // 引用定时器以便窗口提前关闭时清理，避免泄漏
  const forceShowTimer = setTimeout(() => {
    if (!win.isVisible() && !win.isDestroyed()) {
      log.warn('ready-to-show not fired within 8s, force showing window.');
      win.show();
      // 渲染异常时自动打开 DevTools 以便诊断
      win.webContents.openDevTools({ mode: 'detach' });
    }
  }, 8000);
  win.once('ready-to-show', () => clearTimeout(forceShowTimer));
  win.once('closed', () => clearTimeout(forceShowTimer));

  const isDev = process.env.NODE_ENV === 'development' || process.env.TEXTORA_DEV === '1';
  if (isDev) {
    win.loadURL('http://localhost:1420');
    // E2E 测试模式不弹 DevTools，保持窗口干净
    if (!process.env.TEXTORA_E2E) win.webContents.openDevTools();
  } else {
    win.loadFile(path.join(__dirname, '..', 'index.html'));
  }

  // 窗口关闭时检查未保存的文件
  win.on('close', (e) => {
    if (isQuitting) return;
    e.preventDefault();
    const state = getWindowCloseState(win);
    if (state.requested) {
      // 关闭流程进行中再次点击关闭（双击标题栏/重复点击按钮）：
      // 幂等重发 close-request。渲染层 handler 会忽略重复请求，
      // 但若首次请求因渲染层监听器未就绪/IPC 偶发失败而丢失，
      // 这次重发能让确认流程恢复，避免窗口卡死 60 秒后被强制销毁丢数据。
      safeSend(win, 'textora:close-request');
      return;
    }
    state.requested = true;
    safeSend(win, 'textora:close-request');
    // 兜底：仅当渲染进程长时间无响应（崩溃/卡死）才强制关闭。
    // 用 60 秒而非 3 秒，避免用户在处理保存确认时被强制关窗导致数据丢失。
    // 若用户仍在原生对话框（另存为/确认）中操作，延后复查而不是强杀。
    const forceCloseTimer = setTimeout(function checkForceClose() {
      if (!win.isDestroyed() && !isQuitting) {
        if (hasOpenNativeDialog(ownerId)) {
          setTimeout(checkForceClose, 15_000);
          return;
        }
        log.warn('Renderer did not respond to close-request within 60s, force closing.');
        win.destroy();
      }
    }, 60_000);
    state.clearTimer = () => clearTimeout(forceCloseTimer);
    win.once('closed', () => clearTimeout(forceCloseTimer));
  });

  win.on('closed', () => {
    windows.delete(win);
    // 清理该窗口拥有的目录监听：防止 fs.watch 句柄随窗口关闭泄漏并保持事件循环活跃
    for (const [id, entry] of dirWatchers) {
      if (entry && !Array.isArray(entry) && entry.ownerId === ownerId) {
        closeWatcherEntry(entry);
        dirWatchers.delete(id);
      }
    }
    if (win === mainWindow) {
      mainWindow = null;
    }
  });

  buildMenu(win, currentLocale);
  return win;
}

// ============================================================================
// 启动
// ============================================================================

// E2E 测试模式跳过单实例锁（Playwright 可并行启动多个实例）
const gotLock = process.env.TEXTORA_E2E ? true : app.requestSingleInstanceLock();
if (!gotLock) {
  log.info('Another instance is running, quitting.');
  app.quit();
} else {
  log.info(`Textora v${app.getVersion()} starting...`);

  // 捕获未处理的异常/拒绝，写入日志
  process.on('uncaughtException', (err) => {
    log.error('Uncaught Exception:', err);
    safeSend(mainWindow, 'textora:error', {
      type: 'uncaught',
      message: err.message || String(err),
    });
  });
  process.on('unhandledRejection', (reason) => {
    log.error('Unhandled Rejection:', reason);
  });

  app.on('second-instance', (_evt, argv) => {
    if (mainWindow) {
      if (!mainWindow.isVisible()) mainWindow.show();
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
      const fileToOpen = detectFileFromArgv(argv);
      if (fileToOpen) {
        if (mainWindow.webContents.isLoading()) {
          pendingOpenFile = fileToOpen;
        } else {
          mainWindow.webContents.send('textora:open-file', fileToOpen);
        }
      }
    } else {
      pendingOpenFile = detectFileFromArgv(argv) || pendingOpenFile;
    }
  });

  app.whenReady().then(() => {
    // 注册 IPC 处理器
    registerIpcHandlers({
      getMainWindow: () => mainWindow,
      dirWatchers,
    });

    // 渲染进程通知语言切换，重建菜单
    const ALLOWED_LOCALES = new Set(['zh', 'en']);
    ipcMain.on('textora:set-locale', (_evt: unknown, locale: string) => {
      if (typeof locale !== 'string' || !ALLOWED_LOCALES.has(locale)) {
        log.warn(`Invalid locale: ${locale}`);
        return;
      }
      currentLocale = locale;
      // 为所有窗口重建菜单
      windows.forEach((win) => buildMenu(win, locale));
    });

    // 渲染进程确认可以关闭时，销毁发起窗口
    ipcMain.on('textora:ready-to-close', (event: Electron.IpcMainEvent) => {
      const win = BrowserWindow.fromWebContents(event.sender);
      if (!win || win.isDestroyed()) return;
      // 只允许在 close-request 流程中确认关闭：
      // 防止任意窗口/时机（渲染层异常、重复触发）直接销毁全部窗口，
      // 导致其他窗口未保存的编辑内容丢失
      const state = getWindowCloseState(win);
      if (!state.requested) return;
      // 只销毁发起窗口；其余窗口各自保留独立关闭确认流程。
      // 所有窗口关闭后由 window-all-closed 触发退出
      win.destroy();
    });

    // 渲染进程取消关闭（用户在保存确认中点"取消"），重置关闭流程并清掉兜底定时器
    ipcMain.on('textora:close-cancel', (event: Electron.IpcMainEvent) => {
      const win = BrowserWindow.fromWebContents(event.sender);
      if (!win || win.isDestroyed()) return;
      const state = getWindowCloseState(win);
      state.requested = false;
      state.clearTimer?.();
      state.clearTimer = null;
    });

    // 窗口控制：关闭当前窗口
    ipcMain.on('textora:window-close', () => {
      const win = BrowserWindow.getFocusedWindow() || mainWindow;
      if (win && !win.isDestroyed()) {
        win.close();
      }
    });

    // 新建窗口
    ipcMain.on('textora:window-new', () => {
      const newWin = createWindow();
      log.info(`New window created. Total windows: ${windows.size}`);
      // 如果有待打开的文件，在新窗口打开
      if (pendingOpenFile) {
        newWin.webContents.once('did-finish-load', () => {
          newWin.webContents.send('textora:open-file', pendingOpenFile);
          pendingOpenFile = null;
        });
      }
    });

    // 始终置顶切换
    ipcMain.handle('textora:window-toggle-always-on-top', (event: Electron.IpcMainInvokeEvent) => {
      const win = BrowserWindow.fromWebContents(event.sender);
      if (win) {
        const newState = !win.isAlwaysOnTop();
        win.setAlwaysOnTop(newState);
        return newState;
      }
      return false;
    });

    // 获取窗口数量
    ipcMain.handle('textora:window-count', () => windows.size);

    mainWindow = createWindow();
    log.info('App ready, window created.');

    // 自动更新：仅在已打包且存在 app-update.yml 时检查，避免每次启动报错
    setTimeout(() => {
      if (!app.isPackaged) {
        log.info('Skip update check: app not packaged.');
        return;
      }
      const updateYml = path.join(process.resourcesPath, 'app-update.yml');
      if (!fs.existsSync(updateYml)) {
        log.info('Skip update check: app-update.yml not found (no publish config).');
        return;
      }
      autoUpdater.checkForUpdates().catch((err: Error) => {
        log.warn('Update check failed:', err.message);
      });
    }, 3000);

    autoUpdater.on('update-available', (info: { version: string; releaseNotes?: string | null }) => {
      log.info(`Update available: v${info.version}`);
      safeSend(mainWindow, 'textora:update-available', {
        version: info.version,
        releaseNotes: info.releaseNotes,
      });
    });

    autoUpdater.on('update-downloaded', (info: { version: string }) => {
      log.info(`Update downloaded: v${info.version}`);
      safeSend(mainWindow, 'textora:update-downloaded', { version: info.version });
    });

    // autoUpdater 是 EventEmitter：下载/安装阶段的失败会 emit 'error'。
    // 不挂监听器时，未捕获的 'error' 事件会直接抛异常崩掉主进程。
    autoUpdater.on('error', (err: Error) => {
      log.error('Auto updater error:', err);
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
      if (BrowserWindow.getAllWindows().length === 0) {
        // 必须赋值给 mainWindow，否则后续 safeSend/menu 等对主窗口的操作全部失效
        mainWindow = createWindow();
      }
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });

  app.on('before-quit', () => {
    // 关闭所有目录监听
    for (const entry of dirWatchers.values()) closeWatcherEntry(entry);
    dirWatchers.clear();
  });
}
