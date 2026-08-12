/**
 * IPC 处理器：导出 PDF / PNG
 *
 * 安全措施：
 * 1. 临时窗口显式启用 sandbox、关闭 nodeIntegration / webSecurity
 * 2. 加载 sanitizeHtml 后的内容（在调用方完成）
 *
 * 修复：
 * 1. 用临时 HTML 文件替代超大 data: URL——长文档 + base64 内联图片会超过
 *    Chromium 的 URL 长度上限导致加载静默失败
 * 2. 用 did-finish-load 事件替代固定 setTimeout，避免页面未就绪就打印/截图
 * 3. 复用同一个隐藏窗口，避免每次导出都新建/销毁窗口造成抖动
 * 4. webPreferences 开启 paintWhenInitiallyHidden: false，保证隐藏窗口
 *    仍然参与绘制，否则 capturePage 在 Windows 上可能返回空白图
 */
import { BrowserWindow, ipcMain, app } from 'electron';
import * as fsp from 'fs/promises';
import * as path from 'path';
import { createIpcError, validateWorkspacePath } from '../shared';

async function requireExportTarget(targetPath: string): Promise<string> {
  const checked = await validateWorkspacePath(targetPath, { allowMissingLeaf: true });
  if (!checked.ok) throw createIpcError(checked.code, checked.message);
  return checked.resolved;
}

const SAFE_WEB_PREFERENCES = {
  contextIsolation: true,
  nodeIntegration: false,
  sandbox: true,
  webSecurity: true,
  allowRunningInsecureContent: false,
  images: true,
  // 隐藏窗口也参与绘制，否则 capturePage 可能输出空白
  paintWhenInitiallyHidden: false,
};

let exportWin: BrowserWindow | null = null;

// 导出串行化：导出窗口是单例，并发导出（PDF+PNG 同时、快速重复点击）会互相
// 覆盖窗口里的 HTML 内容，导致输出串台、空白或打印错页。用 promise 链排队。
let exportQueue: Promise<unknown> = Promise.resolve();
function enqueueExport<T>(task: () => Promise<T>): Promise<T> {
  const run = exportQueue.then(task, task);
  exportQueue = run.catch(() => undefined);
  return run;
}

function getExportWindow(): BrowserWindow {
  if (exportWin && !exportWin.isDestroyed()) return exportWin;
  exportWin = new BrowserWindow({
    show: false,
    width: 920,
    height: 600,
    webPreferences: SAFE_WEB_PREFERENCES,
  });
  exportWin.on('closed', () => {
    exportWin = null;
  });
  return exportWin;
}

/**
 * 导出页 CSP 兜底：即使上游 sanitizer 有遗漏，也不允许任何脚本执行。
 * 导出页是静态渲染（主进程用 executeJavaScript 测量高度，不受页面 CSP 约束），
 * 因此 script-src/connect-src 可全部关闭；仅放行内联图片、样式与字体。
 * 若文档自带 CSP meta，则不再重复注入，避免策略冲突。
 */
const EXPORT_CSP = "default-src 'none'; script-src 'none'; connect-src 'none'; " +
  "img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; " +
  "font-src 'self' data:; media-src 'self' data: blob:; base-uri 'none'; form-action 'none'";

export function injectExportCsp(html: string): string {
  if (/<meta[^>]+http-equiv\s*=\s*["']?content-security-policy/i.test(html)) {
    return html;
  }
  const meta = `<meta http-equiv="Content-Security-Policy" content="${EXPORT_CSP}" />`;
  const headMatch = html.match(/<head[^>]*>/i);
  if (headMatch && headMatch.index !== undefined) {
    const at = headMatch.index + headMatch[0].length;
    return html.slice(0, at) + meta + html.slice(at);
  }
  return meta + html;
}

/** 把 HTML 写入临时文件并加载，等待页面真正加载完成。 */
async function loadExportHtml(win: BrowserWindow, html: string): Promise<void> {
  const tmpFile = path.join(
    app.getPath('temp'),
    `textora-export-${Date.now()}-${Math.random().toString(36).slice(2)}.html`
  );
  await fsp.writeFile(tmpFile, injectExportCsp(html), 'utf-8');
  try {
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      // 超时兜底：did-finish-load 永不触发（渲染崩溃/页面卡死）时，
      // 若不 reject，导出队列会永久挂起，之后所有导出都失效
      const timeout = setTimeout(() => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(new Error('Timed out while loading export page'));
      }, 20_000);
      const cleanup = () => {
        win.webContents.removeListener('did-finish-load', onLoad);
        win.webContents.removeListener('did-fail-load', onFail);
        win.webContents.removeListener('render-process-gone', onGone);
        if (timeout) clearTimeout(timeout);
      };
      const onLoad = () => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve();
      };
      const onFail = (_e: Electron.Event, code: number, desc: string) => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(new Error(`Failed to load export page (${code}): ${desc}`));
      };
      const onGone = (_e: Electron.Event, details: { reason: string }) => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(new Error(`Export renderer crashed: ${details.reason}`));
      };
      // 加载事件监听在 timeout 之后注册，避免竞态
      win.webContents.on('did-finish-load', onLoad);
      win.webContents.on('did-fail-load', onFail);
      win.webContents.on('render-process-gone', onGone);
      void win.loadFile(tmpFile);
    });
    // 同步 HTML 无外部依赖，加载完成即布局稳定；留少量缓冲确保字体/布局落定
    await new Promise((r) => setTimeout(r, 150));
  } finally {
    await fsp.unlink(tmpFile).catch(() => {});
  }
}

async function measureBodyHeight(win: BrowserWindow): Promise<number> {
  try {
    const h = await win.webContents.executeJavaScript(
      'document.documentElement ? document.documentElement.scrollHeight : 0'
    );
    return Number.isFinite(h) && h > 0 ? h : 600;
  } catch {
    return 600;
  }
}

// 导出 HTML 大小上限（20 MiB）：长文档 + 大量 base64 内联图片可能撑爆临时文件/隐藏窗口内存
const MAX_EXPORT_HTML_LENGTH = 20 * 1024 * 1024;

export function registerExportHandlers(): void {
  ipcMain.handle('textora:export_pdf', async (_evt, html: string, targetPath: string): Promise<void> => {
    if (typeof html !== 'string') throw createIpcError('INVALID_ARGUMENT', 'Invalid export content');
    if (html.length > MAX_EXPORT_HTML_LENGTH) throw createIpcError('INVALID_ARGUMENT', 'Export content too large');
    const resolvedTarget = await requireExportTarget(targetPath);
    await enqueueExport(async () => {
      const win = getExportWindow();
      await loadExportHtml(win, html);
      const pdfData = await win.webContents.printToPDF({
        printBackground: true,
        preferCSSPageSize: true,
        margins: { top: 0.4, bottom: 0.4, left: 0.4, right: 0.4 },
      });
      await fsp.writeFile(resolvedTarget, pdfData);
    });
  });

  ipcMain.handle('textora:export_png', async (_evt, html: string, targetPath: string): Promise<void> => {
    if (typeof html !== 'string') throw createIpcError('INVALID_ARGUMENT', 'Invalid export content');
    if (html.length > MAX_EXPORT_HTML_LENGTH) throw createIpcError('INVALID_ARGUMENT', 'Export content too large');
    const resolvedTarget = await requireExportTarget(targetPath);
    await enqueueExport(async () => {
      const win = getExportWindow();
      await loadExportHtml(win, html);
      const bodyHeight = await measureBodyHeight(win);
      win.setSize(920, Math.min(bodyHeight + 40, 16384));
      // 等 resize 后的重新布局完成再截图
      await new Promise((r) => setTimeout(r, 200));
      const image = await win.webContents.capturePage();
      await fsp.writeFile(resolvedTarget, image.toPNG());
    });
  });
}
