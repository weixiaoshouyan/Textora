/**
 * Electron 原生菜单构建（支持 i18n）
 */
import { BrowserWindow, Menu, shell } from 'electron';

export function buildMenu(
  mainWindow: BrowserWindow | null,
  locale: string = 'zh'
): void {
  const isDev = process.env.NODE_ENV === 'development' || process.env.TEXTORA_DEV === '1';
  const en = locale === 'en';

  const sendToWindow = (channel: string, ...args: unknown[]) => {
    // 应用菜单是全局单例（Menu.setApplicationMenu），buildMenu 会被每个新窗口重建，
    // 闭包里的 mainWindow 只是「最后一次构建时的窗口」。必须在点击时路由到
    // 当前聚焦的窗口，否则多窗口下旧窗口按 Ctrl+S 会把内容保存进另一个窗口的文件。
    const target = BrowserWindow.getFocusedWindow() ?? mainWindow;
    if (target && !target.isDestroyed()) {
      target.webContents.send(channel, ...args);
    }
  };

  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: en ? 'File' : '文件',
      submenu: [
        {
          label: en ? 'New File' : '新建文件',
          accelerator: 'CmdOrCtrl+N',
          click: () => sendToWindow('textora:menu', 'file:new'),
        },
        {
          label: en ? 'New Window' : '新建窗口',
          accelerator: 'CmdOrCtrl+Shift+N',
          // 交由渲染进程处理（复用 window-new IPC 链路）
          click: () => sendToWindow('textora:menu', 'file:new-window'),
        },
        { type: 'separator' },
        {
          label: en ? 'Open File…' : '打开文件…',
          accelerator: 'CmdOrCtrl+O',
          click: () => sendToWindow('textora:menu', 'file:open'),
        },
        {
          label: en ? 'Open Folder…' : '打开文件夹…',
          accelerator: 'CmdOrCtrl+Shift+O',
          click: () => sendToWindow('textora:menu', 'file:open-folder'),
        },
        { type: 'separator' },
        {
          label: en ? 'Save' : '保存',
          accelerator: 'CmdOrCtrl+S',
          click: () => sendToWindow('textora:menu', 'file:save'),
        },
        {
          label: en ? 'Save As…' : '另存为…',
          accelerator: 'CmdOrCtrl+Shift+S',
          click: () => sendToWindow('textora:menu', 'file:save-as'),
        },
        { type: 'separator' },
        {
          label: en ? 'File Properties…' : '文件属性…',
          // 不能用 CmdOrCtrl+I：原生菜单加速键优先于渲染层，会吞掉 Milkdown
          // 编辑器的斜体快捷键（Ctrl+I），导致 WYSIWYG 模式下永远无法用快捷键加斜体
          accelerator: 'CmdOrCtrl+Alt+I',
          // 渲染端通过 textora:menu 通道处理（派发 textora:show-file-info DOM 事件）
          click: () => sendToWindow('textora:menu', 'file:info'),
        },
        { type: 'separator' },
        { role: 'quit', label: en ? 'Quit' : '退出' },
      ],
    },
    {
      label: en ? 'Edit' : '编辑',
      submenu: [
        { role: 'undo', label: en ? 'Undo' : '撤销' },
        { role: 'redo', label: en ? 'Redo' : '重做' },
        { type: 'separator' },
        { role: 'cut', label: en ? 'Cut' : '剪切' },
        { role: 'copy', label: en ? 'Copy' : '复制' },
        { role: 'paste', label: en ? 'Paste' : '粘贴' },
        { role: 'selectAll', label: en ? 'Select All' : '全选' },
        { type: 'separator' },
        {
          label: en ? 'Find' : '查找',
          accelerator: 'CmdOrCtrl+F',
          click: () => sendToWindow('textora:menu', 'edit:find'),
        },
        {
          label: en ? 'Replace' : '替换',
          accelerator: 'CmdOrCtrl+Shift+H',
          click: () => sendToWindow('textora:menu', 'edit:replace'),
        },
      ],
    },
    {
      label: en ? 'View' : '视图',
      submenu: [
        { role: 'reload', label: en ? 'Reload' : '重新加载' },
        { role: 'forceReload', label: en ? 'Force Reload' : '强制重新加载' },
        { type: 'separator' },
        { role: 'resetZoom', label: en ? 'Reset Zoom' : '重置缩放' },
        { role: 'zoomIn', label: en ? 'Zoom In' : '放大' },
        { role: 'zoomOut', label: en ? 'Zoom Out' : '缩小' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: en ? 'Fullscreen' : '全屏' },
        ...(isDev
          ? [{ role: 'toggleDevTools' as const, label: en ? 'DevTools' : '开发者工具' }]
          : []),
      ],
    },
    {
      label: en ? 'Help' : '帮助',
      submenu: [
        {
          label: en ? 'About Textora' : '关于 Textora',
          click: () => sendToWindow('textora:menu', 'help:about'),
        },
        {
          label: en ? 'Open Website' : '打开官方网站',
          click: () => shell.openExternal('https://github.com/textora/textora'),
        },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}
