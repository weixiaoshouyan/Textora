/**
 * IPC 处理器：原生对话框（打开 / 保存 / 消息提示）+ 在文件管理器中打开
 */
import { BrowserWindow, ipcMain, dialog, shell } from 'electron';
import * as path from 'path';
import { createIpcError, validateWorkspacePath } from '../shared';

export interface DialogHandlersDeps {
  getMainWindow: () => BrowserWindow | null;
}

/**
 * 原生对话框在父窗口被销毁（如关闭/退出）时可能永不 resolve，
 * 这里加超时兜底，避免渲染进程的 invoke 永远挂起。
 */
async function withDialogTimeout<T>(promise: Promise<T>, fallback: T, ms = 60_000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((resolve) => {
        timer = setTimeout(() => resolve(fallback), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function registerDialogHandlers(deps: DialogHandlersDeps): void {
  const { getMainWindow } = deps;

  // E2E 测试钩子：设置 TEXTORA_E2E_DIR 时，目录/文件对话框直接返回该目录，
  // 保存对话框直接接受 defaultPath，避免测试卡在原生对话框上。
  const e2eDir = process.env.TEXTORA_E2E_DIR;

  ipcMain.handle('textora:dialog_open', async (_evt, options: any): Promise<string | string[] | null> => {
    if (e2eDir && options?.directory) return e2eDir;
    const properties: string[] = [];
    if (options?.directory) properties.push('openDirectory');
    if (options?.multiple) properties.push('multiSelections');
    if (!options?.directory) properties.push('openFile');
    const finalProperties = options?.properties || properties;
    const win = getMainWindow();
    if (!win) return null;
    const result = await withDialogTimeout(
      dialog.showOpenDialog(win, {
        properties: finalProperties.length ? finalProperties : ['openFile'],
        filters: options?.filters,
        title: options?.title,
        defaultPath: options?.defaultPath,
      }),
      { canceled: true, filePaths: [] }
    );
    if (result.canceled || result.filePaths.length === 0) return null;
    if (!options?.directory) {
      const checkedPaths = await Promise.all(result.filePaths.map(async (filePath) => {
        const checked = await validateWorkspacePath(filePath);
        if (!checked.ok) throw createIpcError(checked.code, checked.message);
        return checked.resolved;
      }));
      return checkedPaths.length === 1 ? checkedPaths[0] : checkedPaths;
    }
    return result.filePaths.length === 1 ? result.filePaths[0] : result.filePaths;
  });

  ipcMain.handle('textora:dialog_save', async (_evt, options: any): Promise<string | null> => {
    if (e2eDir && options?.defaultPath) return path.join(e2eDir, options.defaultPath);
    const win = getMainWindow();
    if (!win) return null;
    const result = await withDialogTimeout(
      dialog.showSaveDialog(win, {
        title: options?.title,
        defaultPath: options?.defaultPath,
        filters: options?.filters,
      }),
      // 父窗口销毁导致对话框永不返回时，用空路径兜底（调用方按取消处理）
      { canceled: true, filePath: '' }
    );
    if (result.canceled || !result.filePath) return null;
    const checked = await validateWorkspacePath(result.filePath, { allowMissingLeaf: true });
    if (!checked.ok) throw createIpcError(checked.code, checked.message);
    return checked.resolved;
  });

  ipcMain.handle('textora:dialog_message', async (_evt, options: any): Promise<boolean> => {
    const win = getMainWindow();
    if (!win) return false;
    const type = options?.type || 'info';
    const isError = type === 'error';
    const result = await withDialogTimeout(
      dialog.showMessageBox(win, {
        type,
        title: options?.title || 'Textora',
        message: options?.message || '',
        buttons: options?.buttons || (isError ? ['确定'] : ['确定', '取消']),
        cancelId: isError ? -1 : 1,
      }),
      { response: isError ? 0 : 1, checkboxChecked: false }
    );
    return result.response === 0;
  });

  // 在文件管理器中显示指定文件
  // 使用 ensureWithinWorkspaceAsync 做 realpath 解析，防止 symlink 指向工作区外
  ipcMain.handle('textora:open_file_location', async (_evt, p: string): Promise<void> => {
    const checked = await validateWorkspacePath(p);
    if (!checked.ok) throw createIpcError(checked.code, checked.message);
    shell.showItemInFolder(path.resolve(checked.resolved));
  });
}
