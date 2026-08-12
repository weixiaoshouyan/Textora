const { contextBridge, ipcRenderer, webUtils } = require('electron');

// 白名单：与 ipc.ts CMD_ARGS 和各 ipc/ 子模块注册的 handler 一一对应
const ALLOWED_INVOKE_CHANNELS = new Set([
  // files.ts
  'read_text_file', 'write_text_file', 'is_file_exists', 'create_file',
  'list_dir', 'create_dir', 'rename_path', 'remove_path',
  'watch_dir', 'stop_watch', 'set_workspace_root',
  'save_base64_file', 'write_binary_file', 'read_binary_file', 'make_image_filename',
  'is_directory',
  'open_file', 'write_file', 'get_file_info',
  // search.ts
  'list_md_files', 'search_in_files', 'list_all_files',
  // secrets.ts
  'store_secret', 'read_secret', 'delete_secret',
  // export.ts
  'export_pdf', 'export_png',
  // dialogs.ts
  'dialog_open', 'dialog_save', 'dialog_message', 'open_file_location',
  // log.ts
  'get_app_version', 'get_system_locale', 'get_log_path',
  'get_recent_lines', 'get_system_info',
  // tools.ts
  'run_tool', 'fetch_url',
  // window.ts / index.ts
  'window-toggle-always-on-top', 'window-count',
]);

const ALLOWED_ON_CHANNELS = new Set([
  'watch-event', 'menu', 'open-file',
  'close-request', 'error', 'update-available', 'update-downloaded',
]);

const ALLOWED_SEND_CHANNELS = new Set([
  'textora:window-minimize', 'textora:window-maximize-toggle',
  'textora:window-close', 'textora:set-title',
  'textora:renderer-log', 'textora:ready-to-close', 'textora:close-cancel',
  'textora:download-update', 'textora:install-update',
  'textora:set-locale', 'textora:window-new',
]);

contextBridge.exposeInMainWorld('textora', {
  invoke: (cmd: string, ...args: any[]) => {
    if (!ALLOWED_INVOKE_CHANNELS.has(cmd)) {
      console.warn(`[preload] Blocked unauthorized invoke: textora:${cmd}`);
      return Promise.reject(new Error(`Unauthorized IPC channel: ${cmd}`));
    }
    return ipcRenderer.invoke(`textora:${cmd}`, ...args);
  },
  on: (event: string, cb: (...args: any[]) => void) => {
    if (!ALLOWED_ON_CHANNELS.has(event)) {
      console.warn(`[preload] Blocked unauthorized on: textora:${event}`);
      return () => {};
    }
    const handler = (_: any, payload: any) => cb(payload);
    ipcRenderer.on(`textora:${event}`, handler);
    return () => ipcRenderer.off(`textora:${event}`, handler);
  },
  emit: (event: string, ...args: any[]) => {
    const channel = `textora:${event}`;
    if (!ALLOWED_SEND_CHANNELS.has(channel)) {
      console.warn(`[preload] Blocked unauthorized send: ${channel}`);
      return;
    }
    ipcRenderer.send(channel, ...args);
  },
  dialog: {
    // namespace 内方法固定枚举，通道已在白名单中；对参数做基本校验
    open: (opts: any) => {
      if (opts !== undefined && opts !== null && typeof opts !== 'object') {
        return Promise.reject(new Error('dialog.open: opts must be an object'));
      }
      return ipcRenderer.invoke('textora:dialog_open', opts);
    },
    save: (opts: any) => {
      if (opts !== undefined && opts !== null && typeof opts !== 'object') {
        return Promise.reject(new Error('dialog.save: opts must be an object'));
      }
      return ipcRenderer.invoke('textora:dialog_save', opts);
    },
    message: (opts: any) => {
      if (typeof opts !== 'object' || opts === null) {
        return Promise.reject(new Error('dialog.message: opts must be an object'));
      }
      return ipcRenderer.invoke('textora:dialog_message', opts);
    },
  },
  window: {
    minimize: () => ipcRenderer.send('textora:window-minimize'),
    maximizeToggle: () => ipcRenderer.send('textora:window-maximize-toggle'),
    close: () => ipcRenderer.send('textora:window-close'),
    setTitle: (t: string) => {
      // 限制标题长度和类型，防止滥用
      if (typeof t !== 'string') return;
      const safe = t.length > 200 ? t.slice(0, 200) : t;
      ipcRenderer.send('textora:set-title', safe);
    },
  },
  log: (level: 'info' | 'warn' | 'error', message: string, extra?: any) => {
    // 限制日志大小，防止通过日志通道发送大量数据
    if (level !== 'info' && level !== 'warn' && level !== 'error') return;
    const safeMsg = typeof message === 'string' ? (message.length > 5000 ? message.slice(0, 5000) : message) : String(message);
    ipcRenderer.send('textora:renderer-log', { level, message: safeMsg, extra });
  },
  // 拖拽文件路径：Electron 30+ 移除了 File.path，必须用 webUtils.getPathForFile。
  // File 对象可通过 contextBridge 传入 preload；非 File 输入返回空串。
  getPathForFile: (file: unknown): string => {
    if (!file || typeof file !== 'object' || typeof (file as { name?: unknown }).name !== 'string') {
      return '';
    }
    try {
      return webUtils.getPathForFile(file as File);
    } catch {
      return '';
    }
  },
});
