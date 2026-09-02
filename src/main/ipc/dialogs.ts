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
 * 注意：超时先返回后，原始 promise 的迟到 rejection 必须被吞掉——
 * 否则成为 unhandledRejection，触发全局错误处理器刷日志/崩溃上报。
 */
async function withDialogTimeout<T>(promise: Promise<T>, fallback: T, ms = 60_000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      // 把 rejection 转成 fallback：race 已结束（无论超时还是正常返回）时
      // 迟到的结果都会被安全丢弃，不产生 unhandled rejection
      promise.catch(() => fallback),
      new Promise<T>((resolve) => {
        timer = setTimeout(() => resolve(fallback), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

// 进行中的原生对话框计数（按发起的 webContents id）：
// 主进程关窗兜底定时器据此暂停强杀——用户还在另存为/确认对话框里操作时
// 强制销毁窗口会丢未保存修改（渲染层兜底同样基于此思路，见 hooks/useWindowClose.ts）
const openDialogCounts = new Map<number, number>();

/** 该窗口是否还有原生对话框等待用户操作 */
export function hasOpenNativeDialog(webContentsId: number): boolean {
  return (openDialogCounts.get(webContentsId) ?? 0) > 0;
}

/** 跟踪一次对话框生命周期：结束时递减对应窗口的计数（sender 缺失时跳过，如单元测试环境） */
function trackDialog<T>(evt: Electron.IpcMainInvokeEvent, promise: Promise<T>): Promise<T> {
  const id = evt?.sender?.id;
  if (typeof id !== 'number') return promise;
  openDialogCounts.set(id, (openDialogCounts.get(id) ?? 0) + 1);
  return promise.finally(() => {
    const next = (openDialogCounts.get(id) ?? 1) - 1;
    if (next <= 0) openDialogCounts.delete(id);
    else openDialogCounts.set(id, next);
  });
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
    const result = await trackDialog(
      _evt,
      withDialogTimeout(
        dialog.showSaveDialog(win, {
          title: options?.title,
          defaultPath: options?.defaultPath,
          filters: options?.filters,
        }),
        // 父窗口销毁导致对话框永不返回时，用空路径兜底（调用方按取消处理）
        { canceled: true, filePath: '' }
      ),
    );
    if (result.canceled || !result.filePath) return null;
    const checked = await validateWorkspacePath(result.filePath, { allowMissingLeaf: true });
    if (!checked.ok) throw createIpcError(checked.code, checked.message);
    return checked.resolved;
  });

  ipcMain.handle('textora:dialog_message', async (_evt, options: any): Promise<number> => {
    const win = getMainWindow();
    if (!win) return 0;
    const type = options?.type || 'info';
    const isError = type === 'error';
    // 多按钮支持：buttons 为字符串数组（1~4 个），返回值 = 选中按钮索引（0 起）
    const defaultButtons = isError ? ['确定'] : ['确定', '取消'];
    const buttons = Array.isArray(options?.buttons) && options.buttons.length > 0
      ? options.buttons
      : defaultButtons;
    if (buttons.length > 4 || buttons.some((b: unknown) => typeof b !== 'string')) {
      throw createIpcError('INVALID_ARGUMENT', 'Invalid dialog buttons');
    }
    const result = await withDialogTimeout(
      dialog.showMessageBox(win, {
        type,
        title: options?.title || 'Textora',
        message: options?.message || '',
        buttons,
        cancelId: isError ? -1 : 1,
      }),
      // 父窗口销毁/超时兜底：按「取消」处理（多按钮场景返回最后一个按钮的索引）
      { response: buttons.length - 1, checkboxChecked: false }
    );
    return result.response;
  });

  // 在文件管理器中显示指定文件
  // 使用 ensureWithinWorkspaceAsync 做 realpath 解析，防止 symlink 指向工作区外
  ipcMain.handle('textora:open_file_location', async (_evt, p: string): Promise<void> => {
    const checked = await validateWorkspacePath(p);
    if (!checked.ok) throw createIpcError(checked.code, checked.message);
    shell.showItemInFolder(path.resolve(checked.resolved));
  });
}
