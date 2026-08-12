/**
 * IPC 处理器：窗口控制 + 标题设置
 *
 * 说明：原生菜单事件由 menu.ts 中的 click handler 直接
 * mainWindow.webContents.send('textora:menu', id) 派发到渲染进程，
 * 不经过主进程 IPC 中转，故此处不再注册 textora:menu handler。
 */
import { BrowserWindow, ipcMain } from 'electron';

export interface WindowHandlersDeps {
  getMainWindow: () => BrowserWindow | null;
}

export function registerWindowHandlers(deps: WindowHandlersDeps): void {
  const { getMainWindow } = deps;

  // 多窗口场景下必须使用事件来源窗口，否则副窗口的按钮会误操作主窗口
  const winOf = (event: Electron.IpcMainEvent): BrowserWindow | null => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win && !win.isDestroyed()) return win;
    return getMainWindow();
  };

  ipcMain.on('textora:window-minimize', (event) => {
    const win = winOf(event);
    if (!win) return;
    win.minimize();
  });

  ipcMain.on('textora:window-maximize-toggle', (event) => {
    const win = winOf(event);
    if (!win) return;
    if (win.isMaximized()) win.unmaximize();
    else win.maximize();
  });

  ipcMain.on('textora:set-title', (event, title: unknown) => {
    if (typeof title !== 'string') return;
    const win = winOf(event);
    if (!win) return;
    win.setTitle(title);
  });
}
