const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('textora', {
  invoke: (cmd: string, ...args: any[]) => ipcRenderer.invoke(`textora:${cmd}`, ...args),
  on: (event: string, cb: (...args: any[]) => void) => {
    const handler = (_: any, payload: any) => cb(payload);
    ipcRenderer.on(`textora:${event}`, handler);
    return () => ipcRenderer.off(`textora:${event}`, handler);
  },
  emit: (event: string, ...args: any[]) => {
    ipcRenderer.send(`textora:${event}`, ...args);
  },
  dialog: {
    open: (opts: any) => ipcRenderer.invoke('textora:dialog_open', opts),
    save: (opts: any) => ipcRenderer.invoke('textora:dialog_save', opts),
    message: (opts: any) => ipcRenderer.invoke('textora:dialog_message', opts),
  },
  window: {
    minimize: () => ipcRenderer.send('textora:window-minimize'),
    maximizeToggle: () => ipcRenderer.send('textora:window-maximize-toggle'),
    close: () => ipcRenderer.send('textora:window-close'),
    setTitle: (t: string) => ipcRenderer.send('textora:set-title', t),
  },
});
