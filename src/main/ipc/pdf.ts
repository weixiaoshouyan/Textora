/**
 * IPC 处理器：PDF 文件读取（预览用）。
 *
 * 渲染层是 sandbox + contextIsolation，无法直接读本地文件，
 * 由主进程读取 PDF 并以 data URL 返回（带工作区边界校验 + 大小上限）。
 */
import { ipcMain } from 'electron';
import * as fsp from 'fs/promises';
import { createIpcError, validateWorkspacePath } from '../shared';
import { checkRateLimit } from '../rateLimiter';
import log from 'electron-log/main';

/** PDF 预览大小上限（25MB）：超过则拒绝，避免 data URL 撑爆渲染进程内存 */
export const PDF_PREVIEW_MAX_SIZE = 25 * 1024 * 1024;

export function registerPdfHandlers(): void {
  ipcMain.handle('textora:read_pdf_file', async (_evt, p: string): Promise<string> => {
    if (typeof p !== 'string') throw createIpcError('INVALID_ARGUMENT', 'Invalid path');
    if (!checkRateLimit('textora:read_pdf_file')) {
      log.warn('Rate limit exceeded for textora:read_pdf_file');
      throw createIpcError('INVALID_ARGUMENT', 'Rate limit exceeded. Please wait before retrying.');
    }
    const checked = await validateWorkspacePath(p);
    if (!checked.ok) throw createIpcError(checked.code, checked.message);
    const stat = await fsp.stat(checked.resolved);
    if (stat.size > PDF_PREVIEW_MAX_SIZE) {
      throw createIpcError('INVALID_ARGUMENT', 'PDF file is too large to preview (limit 25 MB)');
    }
    const buf = await fsp.readFile(checked.resolved);
    // 仅接受 PDF 魔数，防止任意二进制伪装成 PDF 注入渲染层
    if (buf.length < 5 || buf.slice(0, 5).toString('latin1') !== '%PDF-') {
      throw createIpcError('INVALID_ARGUMENT', 'Not a valid PDF file');
    }
    return `data:application/pdf;base64,${buf.toString('base64')}`;
  });
}
