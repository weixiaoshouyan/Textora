/**
 * IPC Handlers 注册模块
 *
 * 将所有 IPC 处理器从主入口分离，提高可维护性。
 */
import { app, BrowserWindow, ipcMain, dialog, shell, safeStorage } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import * as fsp from 'fs/promises';
import log from 'electron-log/main';
import {
  DirEntryDto, OpenFileResult, MdFileItem, SearchMatch, AllFileItem, WatchEventPayload,
  MARKDOWN_EXTS, TEXT_MAX_SIZE, BINARY_MAX_SIZE,
  ensureWithinWorkspace, validateEncoding, atomicWrite, detectLineEnding,
  kindForExt, langForExt, mimeForExt, looksLikeBinary, hexDump,
  sanitizeFilename, isHidden, isSkipDir, readSecrets, setWorkspaceRoot,
} from './shared';

export interface IpcDeps {
  getMainWindow: () => BrowserWindow | null;
  dirWatchers: Map<string, fs.FSWatcher[]>;
}

export function registerIpcHandlers(deps: IpcDeps): void {
  const { getMainWindow, dirWatchers } = deps;

  // ===== 文件读写 =====
  ipcMain.handle('textora:read_text_file', async (_evt, p: string): Promise<string> => {
    ensureWithinWorkspace(p);
    const buf = await fsp.readFile(p);
    if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
      return buf.slice(3).toString('utf-8');
    }
    const text = buf.toString('utf-8');
    if (!text.includes('\uFFFD') || Buffer.from(text, 'utf-8').equals(buf)) {
      return text;
    }
    return buf.toString('latin1');
  });

  ipcMain.handle('textora:write_text_file', async (_evt, p: string, contents: string, encoding?: string): Promise<void> => {
    ensureWithinWorkspace(p);
    if (encoding && encoding !== "utf-8" && encoding !== "utf8") {
      try {
        const iconv = await import("iconv-lite");
        const buf = iconv.encode(contents, encoding);
        await fsp.writeFile(p, buf);
        return;
      } catch {
        // fallback to text write
      }
    }
    await atomicWrite(p, contents);
  });

  ipcMain.handle('textora:is_file_exists', async (_evt, p: string): Promise<boolean> => {
    try {
      await fsp.access(p);
      return true;
    } catch {
      return false;
    }
  });

  ipcMain.handle('textora:create_file', async (_evt, p: string): Promise<void> => {
    ensureWithinWorkspace(p);
    const dir = path.dirname(p);
    await fsp.mkdir(dir, { recursive: true });
    await fsp.writeFile(p, '');
  });

  ipcMain.handle('textora:list_dir', async (_evt, p: string): Promise<DirEntryDto[]> => {
    ensureWithinWorkspace(p);
    const result: DirEntryDto[] = [];
    let entries: fs.Dirent[];
    try {
      entries = await fsp.readdir(p, { withFileTypes: true });
    } catch {
      return result;
    }
    for (const entry of entries) {
      if (isHidden(entry.name)) continue;
      const fullPath = path.join(p, entry.name);
      try {
        const stat = await fsp.lstat(fullPath);
        result.push({ name: entry.name, path: fullPath, is_dir: entry.isDirectory(), size: stat.size });
      } catch { /* ignore */ }
    }
    result.sort((a, b) => {
      if (a.is_dir !== b.is_dir) return a.is_dir ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    return result;
  });

  ipcMain.handle('textora:create_dir', async (_evt, p: string): Promise<void> => {
    ensureWithinWorkspace(p);
    await fsp.mkdir(p, { recursive: true });
  });

  ipcMain.handle('textora:rename_path', async (_evt, from: string, to: string): Promise<void> => {
    ensureWithinWorkspace(from);
    ensureWithinWorkspace(to);
    await fsp.rename(from, to);
  });

  ipcMain.handle('textora:remove_path', async (_evt, p: string): Promise<void> => {
    ensureWithinWorkspace(p);
    const stat = await fsp.lstat(p);
    if (stat.isDirectory()) {
      await fsp.rm(p, { recursive: true, force: true });
    } else {
      await fsp.unlink(p);
    }
  });

  // ===== 文件监听（带防抖） =====
  ipcMain.handle('textora:watch_dir', async (_evt, id: string, p: string): Promise<void> => {
    ensureWithinWorkspace(p);
    const old = dirWatchers.get(id);
    if (old) {
      for (const w of old) w.close();
    }

    const watchers: fs.FSWatcher[] = [];
    const pendingEvents = new Map<string, WatchEventPayload>();
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    function flushEvents() {
      debounceTimer = null;
      const win = getMainWindow();
      for (const payload of pendingEvents.values()) {
        win?.webContents.send('textora:watch-event', payload);
      }
      pendingEvents.clear();
    }

    try {
      const w = fs.watch(p, { recursive: true }, (eventType, filename) => {
        if (!filename) return;
        const fullPath = path.join(p, filename);
        if (isSkipDir(filename)) return;
        pendingEvents.set(fullPath, { id, eventType, path: fullPath });
        if (!debounceTimer) {
          debounceTimer = setTimeout(flushEvents, 300);
        }
      });
      watchers.push(w);
    } catch { /* ignore */ }

    dirWatchers.set(id, watchers);
  });

  ipcMain.handle('textora:stop_watch', async (_evt, id: string): Promise<void> => {
    const watchers = dirWatchers.get(id);
    if (watchers) {
      for (const w of watchers) w.close();
      dirWatchers.delete(id);
    }
  });

  ipcMain.handle('textora:set_workspace_root', async (_evt, p: string): Promise<void> => {
    setWorkspaceRoot(p);
  });

  // ===== 版本 / 日志 =====
  ipcMain.handle('textora:get_app_version', (): string => app.getVersion());

  ipcMain.handle('textora:get_system_locale', (): string => app.getLocale());

  ipcMain.on('textora:log', (_evt, payload: { level?: string; message?: string; stack?: string }) => {
    const level = payload?.level || 'info';
    const logFn = level === 'error' ? log.error : level === 'warn' ? log.warn : log.info;
    logFn('[Renderer]', payload?.message, payload?.stack);
  });

  ipcMain.handle('textora:get_log_path', (): string => {
    return log.transports.file.getFile().path;
  });

  // ===== 图片 / 二进制 =====
  ipcMain.handle('textora:save_base64_file', async (_evt, dir: string, filename: string, dataBase64: string): Promise<string> => {
    ensureWithinWorkspace(dir);
    const safe = sanitizeFilename(filename);
    const filePath = path.join(dir, safe);
    const buffer = Buffer.from(dataBase64, 'base64');
    await atomicWrite(filePath, buffer);
    return filePath;
  });

  ipcMain.handle('textora:write_binary_file', async (_evt, p: string, bytes: number[]): Promise<void> => {
    ensureWithinWorkspace(p);
    await atomicWrite(p, Buffer.from(bytes));
  });

  ipcMain.handle('textora:read_binary_file', async (_evt, p: string): Promise<string> => {
    ensureWithinWorkspace(p);
    const buf = await fsp.readFile(p);
    return buf.toString('base64');
  });

  ipcMain.handle('textora:make_image_filename', async (_evt, ext: string): Promise<string> => {
    return `image-${Date.now()}.${ext}`;
  });

  // ===== 搜索 =====
  ipcMain.handle('textora:list_md_files', async (_evt, root: string): Promise<MdFileItem[]> => {
    ensureWithinWorkspace(root);
    const result: MdFileItem[] = [];
    const visit = async (currentDir: string) => {
      let entries: fs.Dirent[];
      try {
        entries = await fsp.readdir(currentDir, { withFileTypes: true });
      } catch { return; }
      for (const entry of entries) {
        if (isHidden(entry.name) || isSkipDir(entry.name)) continue;
        if (entry.isSymbolicLink()) continue;
        const fullPath = path.join(currentDir, entry.name);
        if (entry.isDirectory()) {
          await visit(fullPath);
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).slice(1).toLowerCase();
          if (MARKDOWN_EXTS.has(ext)) {
            result.push({ name: entry.name, path: fullPath, rel_path: path.relative(root, fullPath) });
          }
        }
      }
    };
    await visit(root);
    return result;
  });

  ipcMain.handle('textora:search_in_files', async (_evt, root: string, query: string, useRegex: boolean, caseSensitive: boolean, fileFilter?: string, excludeDirs?: string): Promise<SearchMatch[]> => {
    ensureWithinWorkspace(root);
    const result: SearchMatch[] = [];
    if (!query) return result;
    const regex = useRegex ? new RegExp(query, caseSensitive ? '' : 'i') : null;
    const MAX_RESULTS = 500; // 提前终止：最多返回 500 条匹配

    // File type filtering and directory exclusion
    const filterPatterns = (fileFilter || "").split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
    const excludes = (excludeDirs || "node_modules,.git").split(",").map(s => s.trim()).filter(Boolean);

    const matchesFileFilter = (filePath: string): boolean => {
      if (filterPatterns.length === 0) return true;
      const lower = filePath.toLowerCase();
      return filterPatterns.some(p => {
        if (p.startsWith("*.")) return lower.endsWith(p.slice(1));
        return lower.endsWith(p);
      });
    };

    const shouldExcludeDir = (dirName: string): boolean => {
      return excludes.some(e => dirName === e || dirName.startsWith(e + "/") || dirName.startsWith(e + "\\\\"));
    };
    let aborted = false;

    // 收集所有待搜索文件，然后并发处理（限制并发数）
    const files: { fullPath: string; name: string }[] = [];
    const collectFiles = async (currentDir: string) => {
      if (aborted) return;
      let entries: fs.Dirent[];
      try {
        entries = await fsp.readdir(currentDir, { withFileTypes: true });
      } catch { return; }
      for (const entry of entries) {
        if (aborted) return;
        // Skip excluded directories
        if (entry.isDirectory() && shouldExcludeDir(entry.name)) continue;
        if (isHidden(entry.name) || isSkipDir(entry.name)) continue;
        if (entry.isSymbolicLink()) continue;
        const fullPath = path.join(currentDir, entry.name);
        if (entry.isDirectory()) {
          await collectFiles(fullPath);
        } else if (entry.isFile()) {
        if (matchesFileFilter(entry.name)) { files.push({ fullPath, name: entry.name }); } else { continue; }
        }
      }
    };
    await collectFiles(root);

    // 并发搜索（限制 8 个并发）
    const CONCURRENCY = 8;
    const searchFile = async (file: { fullPath: string; name: string }) => {
      if (aborted) return;
      try {
        const stat = await fsp.stat(file.fullPath);
        if (stat.size > TEXT_MAX_SIZE) return;
        const buf = await fsp.readFile(file.fullPath);
        if (looksLikeBinary(buf)) return;
        const text = buf.toString('utf-8');
        const lines = text.split('\n');
        for (let i = 0; i < lines.length; i++) {
          if (aborted) return;
          const line = lines[i];
          let col = -1;
          if (regex) {
            const m = regex.exec(line);
            if (m) col = m.index;
          } else {
            const searchLine = caseSensitive ? line : line.toLowerCase();
            const searchQuery = caseSensitive ? query : query.toLowerCase();
            col = searchLine.indexOf(searchQuery);
          }
          if (col >= 0) {
            result.push({ path: file.fullPath, name: file.name, line: i + 1, column: col + 1, preview: line.slice(0, 80) });
            if (result.length >= MAX_RESULTS) {
              aborted = true;
              return;
            }
          }
        }
      } catch { /* ignore */ }
    };

    // 分批并发执行
    for (let i = 0; i < files.length && !aborted; i += CONCURRENCY) {
      const batch = files.slice(i, i + CONCURRENCY);
      await Promise.all(batch.map(searchFile));
    }

    return result;
  });

  ipcMain.handle('textora:list_all_files', async (_evt, root: string): Promise<AllFileItem[]> => {
    ensureWithinWorkspace(root);
    const result: AllFileItem[] = [];
    const visit = async (currentDir: string) => {
      let entries: fs.Dirent[];
      try {
        entries = await fsp.readdir(currentDir, { withFileTypes: true });
      } catch { return; }
      for (const entry of entries) {
        if (isHidden(entry.name) || isSkipDir(entry.name)) continue;
        if (entry.isSymbolicLink()) continue;
        const fullPath = path.join(currentDir, entry.name);
        if (entry.isDirectory()) {
          try {
            const stat = await fsp.stat(fullPath);
            result.push({ name: entry.name, path: fullPath, rel_path: path.relative(root, fullPath), size: stat.size, is_dir: true });
          } catch { /* ignore */ }
          await visit(fullPath);
        } else if (entry.isFile()) {
          try {
            const stat = await fsp.stat(fullPath);
            result.push({ name: entry.name, path: fullPath, rel_path: path.relative(root, fullPath), size: stat.size, is_dir: false });
          } catch { /* ignore */ }
        }
      }
    };
    await visit(root);
    return result;
  });

  // ===== 高级文件打开 / 写入 =====
  ipcMain.handle('textora:open_file', async (_evt, p: string, forceEncoding?: string): Promise<OpenFileResult> => {
    ensureWithinWorkspace(p);
    const name = path.basename(p);
    const ext = path.extname(p).slice(1);
    const kind = kindForExt(ext);
    const language = langForExt(ext);
    const mime = mimeForExt(ext);
    const stat = await fsp.stat(p);
    const size = stat.size;

    if (kind === 'image') {
      const buf = await fsp.readFile(p);
      return { path: p, name, kind, language, encoding: 'binary', line_ending: 'lf', data_base64: buf.toString('base64'), mime, size };
    }

    if (kind === 'unknown') {
      if (size > BINARY_MAX_SIZE) {
        return { path: p, name, kind, language, encoding: 'binary', line_ending: 'lf', size, hex_preview: '...' };
      }
      const buf = await fsp.readFile(p);
      if (looksLikeBinary(buf)) {
        return { path: p, name, kind, language, encoding: 'binary', line_ending: 'lf', size, hex_preview: hexDump(buf) };
      }
      const text = buf.toString('utf-8');
      return { path: p, name, kind: 'code', language, encoding: forceEncoding || 'utf-8', line_ending: detectLineEnding(text), text, size };
    }

    const buf = await fsp.readFile(p);
    let encoding = 'utf-8';
    let text: string;

    if (forceEncoding) {
      encoding = forceEncoding;
      text = buf.toString(forceEncoding as BufferEncoding);
    } else if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
      encoding = 'utf-8-bom';
      text = buf.slice(3).toString('utf-8');
    } else {
      text = buf.toString('utf-8');
      if (text.includes('\uFFFD') && !Buffer.from(text, 'utf-8').equals(buf)) {
        encoding = 'latin1';
        text = buf.toString('latin1');
      }
    }

    return { path: p, name, kind, language, encoding, line_ending: detectLineEnding(text), text, size };
  });

  ipcMain.handle('textora:write_file', async (_evt, p: string, text: string, encoding: string, lineEnding: string): Promise<void> => {
    ensureWithinWorkspace(p);
    const enc = validateEncoding(encoding);
    let finalText = text;
    if (lineEnding === 'crlf' && !enc.includes('crlf')) {
      finalText = text.replace(/\r?\n/g, '\r\n');
    }
    let buf: Buffer;
    if (enc === 'utf-8-bom') {
      buf = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(finalText, 'utf-8')]);
    } else if (enc === 'latin1') {
      buf = Buffer.from(finalText, 'latin1');
    } else {
      buf = Buffer.from(finalText, 'utf-8');
    }
    await atomicWrite(p, buf);
  });

  // ===== 在文件管理器中打开 =====
  ipcMain.handle('textora:open_file_location', async (_evt, p: string): Promise<void> => {
    ensureWithinWorkspace(p);
    shell.showItemInFolder(path.resolve(p));
  });

  // ===== safeStorage: 加密存储敏感信息 =====
  const secretFile = path.join(app.getPath('userData'), 'secrets.enc');

  ipcMain.handle('textora:store_secret', async (_evt, key: string, value: string): Promise<void> => {
    const data = readSecrets();
    if (!safeStorage.isEncryptionAvailable()) {
      data[key] = value;
    } else {
      const encrypted = safeStorage.encryptString(value);
      data[key] = encrypted.toString('base64');
    }
    await fsp.writeFile(secretFile, JSON.stringify(data), 'utf-8');
  });

  ipcMain.handle('textora:read_secret', async (_evt, key: string): Promise<string | null> => {
    const data = readSecrets();
    const raw = data[key];
    if (!raw) return null;
    if (!safeStorage.isEncryptionAvailable()) return raw;
    try {
      return safeStorage.decryptString(Buffer.from(raw, 'base64'));
    } catch {
      return null;
    }
  });

  ipcMain.handle('textora:delete_secret', async (_evt, key: string): Promise<void> => {
    const data = readSecrets();
    delete data[key];
    await fsp.writeFile(secretFile, JSON.stringify(data), 'utf-8');
  });

  // ===== 导出: PDF / PNG =====
  ipcMain.handle('textora:export_pdf', async (_evt, html: string, targetPath: string): Promise<void> => {
    const win = new BrowserWindow({
      show: false, width: 800, height: 600,
      webPreferences: { contextIsolation: true, nodeIntegration: false },
    });
    try {
      await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
      await new Promise((r) => setTimeout(r, 500));
      const pdfData = await win.webContents.printToPDF({
        printBackground: true, preferCSSPageSize: true,
        margins: { top: 0.4, bottom: 0.4, left: 0.4, right: 0.4 },
      });
      await fsp.writeFile(targetPath, pdfData);
    } finally {
      win.destroy();
    }
  });

  ipcMain.handle('textora:export_png', async (_evt, html: string, targetPath: string): Promise<void> => {
    const win = new BrowserWindow({
      show: false, width: 920, height: 600,
      webPreferences: { contextIsolation: true, nodeIntegration: false },
    });
    try {
      await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
      await new Promise((r) => setTimeout(r, 500));
      const bodyHeight = await win.webContents.executeJavaScript('document.body.scrollHeight');
      win.setSize(920, Math.min(bodyHeight + 40, 16384));
      await new Promise((r) => setTimeout(r, 200));
      const image = await win.webContents.capturePage();
      await fsp.writeFile(targetPath, image.toPNG());
    } finally {
      win.destroy();
    }
  });

  // ===== 对话框 =====
  ipcMain.handle('textora:dialog_open', async (_evt, options: any): Promise<string | string[] | null> => {
    const properties: string[] = [];
    if (options?.directory) properties.push('openDirectory');
    if (options?.multiple) properties.push('multiSelections');
    if (!options?.directory) properties.push('openFile');
    const finalProperties = options?.properties || properties;
    const win = getMainWindow();
    if (!win) return null;
    const result = await dialog.showOpenDialog(win, {
      properties: finalProperties.length ? finalProperties : ['openFile'],
      filters: options?.filters,
      title: options?.title,
      defaultPath: options?.defaultPath,
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths.length === 1 ? result.filePaths[0] : result.filePaths;
  });

  ipcMain.handle('textora:dialog_save', async (_evt, options: any): Promise<string | null> => {
    const win = getMainWindow();
    if (!win) return null;
    const result = await dialog.showSaveDialog(win, {
      title: options?.title,
      defaultPath: options?.defaultPath,
      filters: options?.filters,
    });
    if (result.canceled || !result.filePath) return null;
    return result.filePath;
  });

  ipcMain.handle('textora:dialog_message', async (_evt, options: any): Promise<boolean> => {
    const win = getMainWindow();
    if (!win) return false;
    const type = options?.type || 'info';
    const isError = type === 'error';
    const result = await dialog.showMessageBox(win, {
      type,
      title: options?.title || 'Textora',
      message: options?.message || '',
      buttons: options?.buttons || (isError ? ['确定'] : ['确定', '取消']),
      cancelId: isError ? -1 : 1,
    });
    return result.response === 0;
  });

  // ===== 窗口控制 =====
  ipcMain.on('textora:window-minimize', () => getMainWindow()?.minimize());
  ipcMain.on('textora:window-maximize-toggle', () => {
    const win = getMainWindow();
    if (!win) return;
    if (win.isMaximized()) win.unmaximize();
    else win.maximize();
  });

  // ===== 菜单 / 标题 / 语言 =====
  ipcMain.on('textora:menu', (_evt, menuId: string) => {
    getMainWindow()?.webContents.send('textora:menu', menuId);
  });

  ipcMain.on('textora:set-title', (_evt, title: string) => {
    getMainWindow()?.setTitle(title);
  });

  // ===== External Tools =====
  ipcMain.handle('textora:run_tool', async (_evt, tool: any, vars: Record<string, string>) => {
    const { spawn } = await import('child_process');
    const path = await import('path');
    const cwd = tool.cwd || vars.DIR || process.cwd();
    const args = (tool.args || []).map((arg: string) => {
      let expanded = arg;
      for (const [key, value] of Object.entries(vars)) {
        expanded = expanded.replace(new RegExp('\\$' + key, 'g'), value);
      }
      return expanded;
    });

    const startTime = Date.now();
    return new Promise((resolve) => {
      try {
        const proc = spawn(tool.command, args, { cwd, shell: true });
        let stdout = '';
        let stderr = '';
        proc.stdout?.on('data', (d: Buffer) => { stdout += d.toString(); });
        proc.stderr?.on('data', (d: Buffer) => { stderr += d.toString(); });
        proc.on('close', (exitCode: number) => {
          resolve({
            toolId: tool.id,
            toolName: tool.name,
            stdout,
            stderr,
            exitCode: exitCode || 0,
            duration: Date.now() - startTime,
          });
        });
        proc.on('error', (err: Error) => {
          resolve({
            toolId: tool.id,
            toolName: tool.name,
            stdout: '',
            stderr: err.message,
            exitCode: 1,
            duration: Date.now() - startTime,
          });
        });
      } catch (err: any) {
        resolve({
          toolId: tool.id,
          toolName: tool.name,
          stdout: '',
          stderr: err.message || String(err),
          exitCode: 1,
          duration: Date.now() - startTime,
        });
      }
    });
  });

}
