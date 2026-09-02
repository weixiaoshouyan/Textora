/**
 * IPC 处理器：文件读写、目录列表、文件监听、工作区根目录
 */
import { BrowserWindow, ipcMain, webContents, shell } from 'electron';
import log from 'electron-log/main';
import * as path from 'path';
import * as fs from 'fs';
import * as fsp from 'fs/promises';
import { ErrorCode, createError } from '../errors';
import {
  DirEntryDto, OpenFileResult, WatchEventPayload,
  validateWorkspacePath, assertWorkspaceSize, createIpcError,
  validateEncoding, atomicWriteWithRetry, detectLineEnding,
  assertDirStillWithinWorkspace,
  kindForExt, langForExt, mimeForExt, looksLikeBinary, hexDump,
  sanitizeFilename, isHidden, isSkipDir, setWorkspaceRoot, workspaceRoot,
} from '../shared';
import { FILE_SIZE_LIMITS, DIR_LISTING, WATCHER } from '../constants';
import { checkRateLimit } from '../rateLimiter';
import { detectTextEncoding } from '../encodingDetect';

export interface WatcherEntry {
  watchers: fs.FSWatcher[];
  cleanup: () => void; // 关闭 watcher 并清理防抖定时器、待发事件等
  /** 归属的渲染进程 webContents id，用于窗口关闭时自动清理与事件定向 */
  ownerId?: number;
}

export interface FileHandlersDeps {
  getMainWindow: () => BrowserWindow | null;
  // 支持新旧两种形式：旧形式 Map<string, fs.FSWatcher[]>；新形式 Map<string, WatcherEntry>
  dirWatchers: Map<string, fs.FSWatcher[] | WatcherEntry>;
}

export function registerFileHandlers(deps: FileHandlersDeps): void {
  const { dirWatchers } = deps;
  const selfWritePaths = new Set<string>();
  const normalizeEventPath = (value: string) => path.normalize(value).toLowerCase();

  async function writeAtomically(filePath: string, data: string | Buffer): Promise<void> {
    const key = normalizeEventPath(filePath);
    selfWritePaths.add(key);
    try {
      await atomicWriteWithRetry(filePath, data);
      // fs.watch may deliver the event after the write promise resolves.
      setTimeout(() => selfWritePaths.delete(key), WATCHER.SELF_WRITE_COOLDOWN_MS);
    } catch (err) {
      // 写入失败也要清理 selfWritePaths，避免路径永久残留导致后续外部变更被误判为 self
      selfWritePaths.delete(key);
      throw err;
    }
  }

  async function requireWorkspacePath(p: string, allowMissingLeaf = false): Promise<string> {
    const result = await validateWorkspacePath(p, { allowMissingLeaf });
    if (!result.ok) throw createIpcError(result.code, result.message);
    return result.resolved;
  }

  /** 高危通道限流：超限直接抛错（渲染层弹提示），防止失控渲染层高频重 IO */
  function assertRateLimit(channel: string): void {
    if (!checkRateLimit(channel)) {
      log.warn(`Rate limit exceeded for ${channel}`);
      throw createIpcError('INVALID_ARGUMENT', 'Rate limit exceeded. Please wait before retrying.');
    }
  }

  // ===== 基础文本读写 =====
  ipcMain.handle('textora:read_text_file', async (_evt, p: string): Promise<string> => {
    assertRateLimit('textora:read_text_file');
    const resolved = await requireWorkspacePath(p);
    const stat = await fsp.stat(resolved);
    assertWorkspaceSize(stat.size, FILE_SIZE_LIMITS.TEXT_MAX_SIZE, 'Text file');
    const buf = await fsp.readFile(resolved);
    // UTF-8 BOM
    if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
      return buf.slice(3).toString('utf-8');
    }
    // UTF-16 LE BOM
    if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) {
      return buf.slice(2).toString('utf16le');
    }
    // UTF-16 BE BOM
    if (buf.length >= 2 && buf[0] === 0xfe && buf[1] === 0xff) {
      // 交换字节序后以 utf16le 解码
      const swapped = Buffer.allocUnsafe(buf.length - 2);
      for (let i = 2; i < buf.length - 1; i += 2) {
        swapped[i - 2] = buf[i + 1];
        swapped[i - 1] = buf[i];
      }
      return swapped.toString('utf16le');
    }
    const text = buf.toString('utf-8');
    if (!text.includes('\uFFFD') || Buffer.from(text, 'utf-8').equals(buf)) {
      return text;
    }
    return buf.toString('latin1');
  });

  ipcMain.handle('textora:write_text_file', async (_evt, p: string, contents: string, encoding?: string): Promise<void> => {
    const resolved = await requireWorkspacePath(p, true);
    let buf: Buffer;
    if (encoding && encoding !== "utf-8" && encoding !== "utf8") {
      const enc = validateEncoding(encoding);
      if (enc === 'latin1') {
        buf = Buffer.from(contents, 'latin1');
      } else if (enc === 'utf-8-bom') {
        buf = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(contents, 'utf-8')]);
      } else {
        try {
          const iconv = await import("iconv-lite");
          buf = iconv.encode(contents, enc);
        } catch {
          // 编码失败必须报错，避免静默按 UTF-8 写入损坏文件
          throw new Error(`Unsupported encoding: ${encoding}`);
        }
      }
    } else {
      buf = Buffer.from(contents, 'utf-8');
    }
    assertWorkspaceSize(buf.length, FILE_SIZE_LIMITS.TEXT_MAX_SIZE, 'Text file');
    await writeAtomically(resolved, buf);
  });

  ipcMain.handle('textora:is_file_exists', async (_evt, p: string): Promise<boolean> => {
    const resolved = await requireWorkspacePath(p, true);
    try {
      await fsp.access(resolved);
      return true;
    } catch {
      return false;
    }
  });

  ipcMain.handle('textora:create_file', async (_evt, p: string): Promise<void> => {
    const resolved = await requireWorkspacePath(p, true);
    const dir = path.dirname(resolved);
    await fsp.mkdir(dir, { recursive: true });
    // 'wx' 标志：文件已存在时报 EEXIST 而非静默截断——「新建文件」的语义是创建
    // 而不是清空（检查 is_file_exists 与写入之间存在竞态窗口，直接 writeFile('')
    // 会把恰好已存在的文件清空，导致数据丢失）
    await fsp.writeFile(resolved, '', { flag: 'wx' });
  });

  ipcMain.handle('textora:list_dir', async (_evt, p: string): Promise<DirEntryDto[]> => {
    const resolved = await requireWorkspacePath(p);
    const result: DirEntryDto[] = [];
    let entries: fs.Dirent[];
    try {
      entries = await fsp.readdir(resolved, { withFileTypes: true });
    } catch {
      return result;
    }
    // 限制条目数量，避免超大目录（如 node_modules）导致渲染卡顿
    for (const entry of entries) {
      if (isHidden(entry.name)) continue;
      const fullPath = path.join(resolved, entry.name);
      try {
        const stat = await fsp.lstat(fullPath);
        result.push({ name: entry.name, path: fullPath, is_dir: entry.isDirectory(), size: stat.size });
      } catch { /* ignore */ }
      if (result.length >= DIR_LISTING.MAX_ENTRIES) break;
    }
    result.sort((a, b) => {
      if (a.is_dir !== b.is_dir) return a.is_dir ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    return result;
  });

  ipcMain.handle('textora:create_dir', async (_evt, p: string): Promise<void> => {
    const resolved = await requireWorkspacePath(p, true);
    await fsp.mkdir(resolved, { recursive: true });
  });

  ipcMain.handle('textora:rename_path', async (_evt, from: string, to: string): Promise<void> => {
    const resolvedFrom = await requireWorkspacePath(from);
    const resolvedTo = await requireWorkspacePath(to, true);
    // 收窄 TOCTOU：rename 前复核源/目标父目录仍位于工作区内
    await assertDirStillWithinWorkspace(resolvedFrom);
    await assertDirStillWithinWorkspace(resolvedTo);
    await fsp.rename(resolvedFrom, resolvedTo);
  });

  ipcMain.handle('textora:remove_path', async (_evt, p: string): Promise<void> => {
    assertRateLimit('textora:remove_path');
    const resolved = await requireWorkspacePath(p);
    const stat = await fsp.lstat(resolved);
    if (stat.isDirectory()) {
      // 收窄 TOCTOU：递归删除前复核目录自身仍位于工作区内（防校验后被替换为指向外部的 junction）
      await assertDirStillWithinWorkspace(path.join(resolved, '.placeholder'));
    } else {
      await assertDirStillWithinWorkspace(resolved);
    }
    // 优先移入系统回收站（可恢复），失败（跨盘/平台不支持等）再回退永久删除
    try {
      await shell.trashItem(resolved);
      return;
    } catch (err) {
      log.warn(`trashItem failed for ${resolved}, falling back to permanent delete:`, err);
    }
    if (stat.isDirectory()) {
      await fsp.rm(resolved, { recursive: true, force: true });
    } else {
      await fsp.unlink(resolved);
    }
  });

  // ===== 文件监听（带防抖） =====
  ipcMain.handle('textora:watch_dir', async (evt, id: string, p: string): Promise<void> => {
    assertRateLimit('textora:watch_dir');
    const resolved = await requireWorkspacePath(p);
    const ownerId = evt.sender.id;
    // 清理旧 watcher：兼容新旧两种存储形式
    const old = dirWatchers.get(id);
    if (old) {
      if (Array.isArray(old)) {
        for (const w of old) w.close();
      } else {
        old.cleanup();
      }
    }

    const watchers: fs.FSWatcher[] = [];
    const pendingEvents = new Map<string, WatchEventPayload>();
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    function flushEvents() {
      debounceTimer = null;
      // 只把事件发给发起监听的窗口，避免多窗口串扰；
      // 发起窗口已销毁时直接清空 pending，避免事件堆积导致内存泄漏
      const wc = webContents.fromId(ownerId);
      if (wc && !wc.isDestroyed()) {
        for (const payload of pendingEvents.values()) {
          wc.send('textora:watch-event', payload);
        }
      }
      pendingEvents.clear();
    }

    try {
      const w = fs.watch(resolved, { recursive: true }, (eventType, filename) => {
        if (!filename) return;
        // filename 可能是路径（如 subdir/file.ts），取第一段检查是否需跳过
        const firstSegment = filename.split(/[/\\]/)[0];
        if (isSkipDir(firstSegment)) return;
        const fullPath = path.join(resolved, filename);
        if (path.basename(fullPath).startsWith('.textora-tmp-')) return;
        const eventPath = normalizeEventPath(fullPath);
        const source = selfWritePaths.has(eventPath) ? "self" : "external";
        pendingEvents.set(fullPath, { id, eventType, path: fullPath, source });
        if (!debounceTimer) {
          debounceTimer = setTimeout(flushEvents, WATCHER.DEBOUNCE_MS);
        }
      });
      watchers.push(w);
      // fs.watch 返回的 FSWatcher 是 EventEmitter：不挂 'error' 监听器时，
      // 目录被删除/权限变化/句柄溢出会 emit 'error'，无监听器将抛未捕获异常直接崩掉主进程。
      // 挂上监听器：记录日志、关闭并移除该 watcher、通知渲染层监听已失效。
      w.on('error', (err) => {
        console.warn(`[watch_dir] watcher error for ${resolved}:`, err);
        try { w.close(); } catch { /* ignore */ }
        const idx = watchers.indexOf(w);
        if (idx >= 0) watchers.splice(idx, 1);
        const wc = webContents.fromId(ownerId);
        if (wc && !wc.isDestroyed()) {
          wc.send('textora:watch-event', { id, eventType: 'error', path: resolved, source: 'external' });
        }
      });
    } catch (err) {
      // 同步失败（路径不存在/无权限等）：watch_dir 必须向渲染层报错，
      // 否则渲染层以为监听成功，文件树变成"静默不更新"
      console.warn(`[watch_dir] failed to watch ${resolved}:`, err);
      throw createError(ErrorCode.INVALID_PATH, `Failed to watch directory: ${err instanceof Error ? err.message : String(err)}`);
    }

    const entry: WatcherEntry = {
      watchers,
      ownerId,
      cleanup: () => {
        if (debounceTimer) {
          clearTimeout(debounceTimer);
          debounceTimer = null;
        }
        pendingEvents.clear();
        for (const w of watchers) {
          try { w.close(); } catch { /* ignore */ }
        }
      },
    };
    dirWatchers.set(id, entry);
  });

  ipcMain.handle('textora:stop_watch', async (_evt, id: string): Promise<void> => {
    const entry = dirWatchers.get(id);
    if (entry) {
      if (Array.isArray(entry)) {
        // 兼容旧形式
        for (const w of entry) w.close();
      } else {
        entry.cleanup();
      }
      dirWatchers.delete(id);
    }
  });

  ipcMain.handle('textora:set_workspace_root', async (_evt, p: string | null): Promise<void> => {
    if (p === null) {
      setWorkspaceRoot(null);
      return;
    }
    const previousRoot = workspaceRoot;
    setWorkspaceRoot(p);
    try {
      const resolved = await requireWorkspacePath(p);
      const stat = await fsp.stat(resolved);
      if (!stat.isDirectory()) {
        throw createError(ErrorCode.NOT_DIRECTORY, 'Workspace root must be a directory');
      }
      setWorkspaceRoot(resolved);
    } catch (error) {
      setWorkspaceRoot(previousRoot);
      throw error;
    }
  });

  // ===== 图片 / 二进制 =====
  ipcMain.handle('textora:save_base64_file', async (_evt, dir: string, filename: string, dataBase64: string): Promise<string> => {
    const resolvedDir = await requireWorkspacePath(dir);
    const safe = sanitizeFilename(filename);
    const filePath = await requireWorkspacePath(path.join(resolvedDir, safe), true);
    // 先检查再分配：base64 解码后字节数 ≈ 长度 × 3/4（上界估算），
    // 超限输入在分配大 Buffer 之前就拒绝，避免内存被恶意超大 base64 撑爆
    assertWorkspaceSize(Math.floor((dataBase64.length * 3) / 4), FILE_SIZE_LIMITS.IMAGE_MAX_SIZE, 'Image file');
    const buffer = Buffer.from(dataBase64, 'base64');
    assertWorkspaceSize(buffer.length, FILE_SIZE_LIMITS.IMAGE_MAX_SIZE, 'Image file');
    await writeAtomically(filePath, buffer);
    return filePath;
  });

  ipcMain.handle('textora:write_binary_file', async (_evt, p: string, bytes: Uint8Array): Promise<void> => {
    const resolved = await requireWorkspacePath(p, true);
    // 先检查再分配：bytes 是 Uint8Array（结构化克隆直接传输，避免 number[] 逐元素序列化开销）。
    // 用 ArrayBuffer.isView 判断（跨 realm 安全）：jsdom 测试环境中全局 Uint8Array 与 Node Buffer 不同源，
    // instanceof 会误判；BYTES_PER_ELEMENT === 1 确保是单字节视图
    if (!ArrayBuffer.isView(bytes) || bytes.BYTES_PER_ELEMENT !== 1) {
      throw createError(ErrorCode.INVALID_PATH, 'Binary data must be a Uint8Array');
    }
    assertWorkspaceSize(bytes.byteLength, FILE_SIZE_LIMITS.BINARY_MAX_SIZE, 'Binary file');
    const buffer = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    await writeAtomically(resolved, buffer);
  });

  ipcMain.handle('textora:read_binary_file', async (_evt, p: string): Promise<string> => {
    assertRateLimit('textora:read_binary_file');
    const resolved = await requireWorkspacePath(p);
    const stat = await fsp.stat(resolved);
    assertWorkspaceSize(stat.size, FILE_SIZE_LIMITS.BINARY_MAX_SIZE, 'Binary file');
    const buf = await fsp.readFile(resolved);
    return buf.toString('base64');
  });

  // 图片扩展名白名单：make_image_filename 的 ext 来自渲染层，必须校验，
  // 防止任意后缀进入文件名（与 IMAGE_EXTS 保持一致的子集）
  const IMAGE_EXT_WHITELIST = new Set(['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'svg', 'ico', 'avif']);
  ipcMain.handle('textora:make_image_filename', async (_evt, ext: string): Promise<string> => {
    const safeExt = typeof ext === 'string' ? ext.toLowerCase() : '';
    if (!IMAGE_EXT_WHITELIST.has(safeExt)) {
      return `image-${Date.now()}.png`;
    }
    return `image-${Date.now()}.${safeExt}`;
  });

  // ===== 路径类型探测（用于拖拽等场景明确区分文件/目录） =====
  ipcMain.handle('textora:is_directory', async (_evt, p: string): Promise<boolean> => {
    const resolved = await requireWorkspacePath(p, true);
    try {
      // The path has already passed the workspace boundary check.
      const stat = await fsp.stat(resolved);
      return stat.isDirectory();
    } catch (error: unknown) {
      const code = error && typeof error === 'object' && 'code' in error ? (error as { code?: string }).code : undefined;
      if (code === 'ENOENT' || code === 'ENOTDIR') return false;
      throw error;
    }
  });

  // ===== 高级文件打开 / 写入（带编码检测） =====
  ipcMain.handle('textora:open_file', async (_evt, p: string, forceEncoding?: string): Promise<OpenFileResult> => {
    const resolved = await requireWorkspacePath(p);
    const name = path.basename(resolved);
    const ext = path.extname(resolved).slice(1);
    const kind = kindForExt(ext);
    const language = langForExt(ext);
    const mime = mimeForExt(ext);
    const stat = await fsp.stat(resolved);
    const size = stat.size;

    if (kind === 'image') {
      assertWorkspaceSize(size, FILE_SIZE_LIMITS.IMAGE_MAX_SIZE, 'Image file');
      const buf = await fsp.readFile(resolved);
      return { path: resolved, name, kind, language, encoding: 'binary', line_ending: 'lf', data_base64: buf.toString('base64'), mime, size };
    }

    if (kind === 'unknown') {
      if (size > FILE_SIZE_LIMITS.BINARY_MAX_SIZE) {
        return { path: resolved, name, kind, language, encoding: 'binary', line_ending: 'lf', size, hex_preview: '...' };
      }
      const buf = await fsp.readFile(resolved);
      if (looksLikeBinary(buf)) {
        return { path: resolved, name, kind, language, encoding: 'binary', line_ending: 'lf', size, hex_preview: hexDump(buf) };
      }
      const text = buf.toString('utf-8');
      return { path: resolved, name, kind: 'code', language, encoding: forceEncoding || 'utf-8', line_ending: detectLineEnding(text), text, size };
    }

    assertWorkspaceSize(size, FILE_SIZE_LIMITS.TEXT_MAX_SIZE, 'Text file');
    const buf = await fsp.readFile(resolved);
    let encoding = 'utf-8';
    let text: string;

    if (forceEncoding) {
      const enc = validateEncoding(forceEncoding);
      encoding = enc;
      if (enc === 'utf-8' || enc === 'utf-8-bom') {
        if (enc === 'utf-8-bom' && buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
          text = buf.slice(3).toString('utf-8');
        } else {
          text = buf.toString('utf-8');
        }
      } else if (enc === 'latin1') {
        text = buf.toString('latin1');
      } else {
        // gbk/gb2312/utf-16le/utf-16be 等：用 iconv-lite 解码，
        // 避免 buf.toString() 对不支持的编码抛 ERR_UNKNOWN_ENCODING 导致打开失败
        try {
          const iconv = await import('iconv-lite');
          text = iconv.decode(buf, enc);
        } catch {
          text = buf.toString('utf-8');
        }
      }
    } else if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
      encoding = 'utf-8-bom';
      text = buf.slice(3).toString('utf-8');
    } else if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) {
      // UTF-16 LE BOM
      encoding = 'utf-16le';
      try {
        const iconv = await import('iconv-lite');
        text = iconv.decode(buf.slice(2), 'utf-16le');
      } catch {
        text = buf.slice(2).toString('utf16le');
      }
    } else if (buf.length >= 2 && buf[0] === 0xfe && buf[1] === 0xff) {
      // UTF-16 BE BOM：交换字节序后以 utf16le 解码
      encoding = 'utf-16be';
      try {
        const iconv = await import('iconv-lite');
        text = iconv.decode(buf.slice(2), 'utf-16be');
      } catch {
        const swapped = Buffer.allocUnsafe(buf.length - 2);
        for (let i = 2; i < buf.length - 1; i += 2) {
          swapped[i - 2] = buf[i + 1];
          swapped[i - 1] = buf[i];
        }
        text = swapped.toString('utf16le');
      }
    } else {
      // 无 BOM：UTF-8 → GBK → latin1。旧逻辑在 UTF-8 解码出现 U+FFFD 时直接回退
      // latin1，导致无 BOM 的 GBK 中文文件打开即乱码，因此改为先做编码检测
      const detected = detectTextEncoding(buf);
      if (detected === 'gbk') {
        try {
          const iconv = await import('iconv-lite');
          text = iconv.decode(buf, 'gbk');
          encoding = 'gbk';
        } catch {
          text = buf.toString('utf-8');
        }
      } else if (detected === 'latin1') {
        encoding = 'latin1';
        text = buf.toString('latin1');
      } else {
        text = buf.toString('utf-8');
      }
    }

    return { path: resolved, name, kind, language, encoding, line_ending: detectLineEnding(text), text, size };
  });

  ipcMain.handle('textora:write_file', async (_evt, p: string, text: string, encoding: string, lineEnding: string): Promise<void> => {
    const resolved = await requireWorkspacePath(p, true);
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
    } else if (enc === 'utf-8') {
      buf = Buffer.from(finalText, 'utf-8');
    } else {
      // gbk/gb2312/utf-16le/utf-16be/ascii 等：用 iconv-lite 编码。
      // 编码失败必须报错，绝不能静默按 UTF-8 写入——那会把 GBK 文件内容重写为 UTF-8 字节而仍标记为 GBK，直接损坏文件
      try {
        const iconv = await import('iconv-lite');
        buf = iconv.encode(finalText, enc);
      } catch {
        throw new Error(`Unsupported encoding: ${enc}`);
      }
    }
    assertWorkspaceSize(buf.length, FILE_SIZE_LIMITS.TEXT_MAX_SIZE, 'Text file');
    await writeAtomically(resolved, buf);
  });

  // ===== 文件信息（属性） =====
  interface FileInfoResult {
    path: string;
    name: string;
    dir: string;
    ext: string;
    size: number;
    sizeFormatted: string;
    created: string;
    modified: string;
    accessed: string;
    isFile: boolean;
    isDirectory: boolean;
    isSymbolicLink: boolean;
    encoding?: string;
    lineCount?: number;
    wordCount?: number;
    charCount?: number;
  }

  ipcMain.handle('textora:get_file_info', async (_evt, p: string): Promise<FileInfoResult> => {
    const resolved = await requireWorkspacePath(p, true);
    const stat = await fsp.stat(resolved);
    const lstat = await fsp.lstat(resolved);

    const name = path.basename(resolved);
    const dir = path.dirname(resolved);
    const ext = path.extname(resolved).toLowerCase();

    // 格式化文件大小
    const formatSize = (bytes: number): string => {
      if (bytes === 0) return '0 B';
      const units = ['B', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(bytes) / Math.log(1024));
      const size = (bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0);
      return `${size} ${units[i]}`;
    };

    const result: FileInfoResult = {
      path: resolved,
      name,
      dir,
      ext,
      size: stat.size,
      sizeFormatted: formatSize(stat.size),
      created: stat.birthtime.toISOString(),
      modified: stat.mtime.toISOString(),
      accessed: stat.atime.toISOString(),
      isFile: stat.isFile(),
      isDirectory: stat.isDirectory(),
      isSymbolicLink: lstat.isSymbolicLink(),
    };

    // 如果是文本文件，读取统计信息
    if (stat.isFile() && stat.size < FILE_SIZE_LIMITS.TEXT_MAX_SIZE) {
      try {
        const buf = await fsp.readFile(resolved);
        let text: string;
        if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
          text = buf.slice(3).toString('utf-8');
          result.encoding = 'utf-8-bom';
        } else {
          text = buf.toString('utf-8');
          if (!text.includes('\uFFFD') || Buffer.from(text, 'utf-8').equals(buf)) {
            result.encoding = 'utf-8';
          } else {
            text = buf.toString('latin1');
            result.encoding = 'latin1';
          }
        }
        result.lineCount = text.split('\n').length;
        result.charCount = text.length;
        // 中英文混合字数统计
        const cjkRegex = /[\u4e00-\u9fff]/g;
        const cjkChars = (text.match(cjkRegex) || []).length;
        const words = text.split(/\s+/).filter(Boolean).length;
        result.wordCount = words + cjkChars;
      } catch {
        // 读取失败不影响基本信息
      }
    }

    return result;
  });
}
