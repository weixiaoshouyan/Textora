/**
 * 主进程共享模块：类型定义、常量、工具函数
 */
import { app } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import * as fsp from 'fs/promises';
import { randomUUID } from 'crypto';
import { ErrorCode, createError, AppError } from './errors';
import { ALLOWED_ENCODINGS } from './constants';

// ============================================================================
// 类型定义
// ============================================================================

export interface DirEntryDto {
  name: string;
  path: string;
  is_dir: boolean;
  size: number;
}

export interface OpenFileResult {
  path: string;
  name: string;
  kind: string;
  language: string;
  encoding: string;
  line_ending: string;
  text?: string;
  data_base64?: string;
  mime?: string;
  size?: number;
  hex_preview?: string;
}

export interface MdFileItem {
  name: string;
  path: string;
  rel_path: string;
}

export interface SearchMatch {
  path: string;
  name: string;
  line: number;
  column: number;
  preview: string;
}

export interface AllFileItem {
  name: string;
  path: string;
  rel_path: string;
  size: number;
  is_dir: boolean;
}

export interface WatchEventPayload {
  id: string;
  eventType: string;
  path: string;
  source?: "external" | "self";
}

// ============================================================================
// 常量
// ============================================================================

export const MARKDOWN_EXTS = new Set(['md', 'markdown', 'mdx']);
export const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'svg', 'ico', 'avif']);
export const CODE_EXTS = new Set([
  'json', 'yaml', 'yml', 'ts', 'tsx', 'js', 'jsx', 'html', 'htm', 'css',
  'scss', 'less', 'py', 'rs', 'go', 'java', 'c', 'h', 'cpp', 'cc', 'cxx',
  'hpp', 'sh', 'bash', 'sql', 'xml', 'toml', 'txt',
]);

export const LANG_MAP: Record<string, string> = {
  ts: 'typescript', tsx: 'typescript',
  js: 'javascript', jsx: 'javascript',
  py: 'python', rs: 'rust', go: 'go', java: 'java',
  c: 'c', h: 'c',
  cpp: 'cpp', cc: 'cpp', cxx: 'cpp', hpp: 'cpp',
  sh: 'bash', bash: 'bash', sql: 'sql',
  html: 'html', htm: 'html', css: 'css',
  json: 'json', yaml: 'yaml', yml: 'yaml',
  xml: 'xml', toml: 'toml',
  md: 'markdown', markdown: 'markdown', mdx: 'markdown',
  txt: 'plaintext',
};

export const MIME_MAP: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
  gif: 'image/gif', bmp: 'image/bmp', webp: 'image/webp',
  svg: 'image/svg+xml', ico: 'image/x-icon', avif: 'image/avif',
};



// ============================================================================
// 全局状态（跨模块共享）
// ============================================================================

export let workspaceRoot: string | null = null;
export function setWorkspaceRoot(p: string | null): void {
  workspaceRoot = p;
}

/** @deprecated Use ErrorCode from './errors' instead */
export type WorkspaceErrorCode = ErrorCode;

export type WorkspaceCheck =
  | { ok: true; resolved: string }
  | { ok: false; code: ErrorCode; message: string };

export interface WorkspacePathOptions {
  allowMissingLeaf?: boolean;
}

function workspaceError(code: ErrorCode, message: string): WorkspaceCheck {
  return { ok: false, code, message };
}

function normalizeForComparison(value: string): string {
  const normalized = path.normalize(value).replace(/[\\/]+$/, '');
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
}

function isWithin(root: string, candidate: string): boolean {
  const normalizedRoot = normalizeForComparison(root);
  const normalizedCandidate = normalizeForComparison(candidate);
  return normalizedCandidate === normalizedRoot || normalizedCandidate.startsWith(`${normalizedRoot}${path.sep}`);
}

async function nearestExistingPath(input: string): Promise<string | null> {
  let current = path.resolve(input);
  while (true) {
    try {
      await fsp.lstat(current);
      return current;
    } catch {
      const parent = path.dirname(current);
      if (parent === current) return null;
      current = parent;
    }
  }
}

/**
 * Validate a path against the configured workspace, including existing symlinks.
 * Missing leaves are allowed only when their nearest existing ancestor is safe.
 */
export async function validateWorkspacePath(
  input: string,
  options: WorkspacePathOptions = {},
): Promise<WorkspaceCheck> {
  if (typeof input !== 'string' || input.trim() === '') {
    return workspaceError(ErrorCode.INVALID_PATH, 'A non-empty path is required');
  }
  if (!workspaceRoot) {
    return workspaceError(ErrorCode.WORKSPACE_NOT_SET, 'Workspace root is not configured');
  }

  const segments = input.split(/[\\/]/);
  if (segments.some((segment) => segment === '..')) {
    return workspaceError(ErrorCode.INVALID_PATH, 'Path traversal is not allowed');
  }

  const root = path.resolve(workspaceRoot);
  let resolved: string;
  try {
    resolved = path.isAbsolute(input) ? path.resolve(input) : path.resolve(root, input);
  } catch {
    return workspaceError(ErrorCode.INVALID_PATH, 'Path cannot be resolved');
  }
  if (!isWithin(root, resolved)) {
    return workspaceError(ErrorCode.WORKSPACE_ESCAPE, 'Path is outside the workspace');
  }

  const existing = await nearestExistingPath(resolved);
  if (!existing) {
    return workspaceError(ErrorCode.INVALID_PATH, 'Path has no existing ancestor');
  }

  let realRoot: string;
  let realExisting: string;
  try {
    realRoot = await fsp.realpath(root);
    realExisting = await fsp.realpath(existing);
  } catch {
    return workspaceError(ErrorCode.INVALID_PATH, 'Workspace path cannot be resolved');
  }
  if (!isWithin(realRoot, realExisting)) {
    return workspaceError(ErrorCode.WORKSPACE_ESCAPE, 'Path resolves outside the workspace');
  }

  if (normalizeForComparison(existing) !== normalizeForComparison(resolved)) {
    if (!options.allowMissingLeaf) {
      try {
        await fsp.realpath(resolved);
      } catch {
        return workspaceError(ErrorCode.INVALID_PATH, 'Path does not exist');
      }
    }
    return { ok: true, resolved };
  }

  try {
    const realResolved = await fsp.realpath(resolved);
    if (!isWithin(realRoot, realResolved)) {
      return workspaceError(ErrorCode.WORKSPACE_ESCAPE, 'Path resolves outside the workspace');
    }
    return { ok: true, resolved };
  } catch {
    return workspaceError(ErrorCode.INVALID_PATH, 'Path cannot be resolved');
  }
}

export function assertWorkspaceSize(byteLength: number, limit: number, label: string): void {
  if (!Number.isFinite(byteLength) || byteLength < 0 || byteLength > limit) {
    throw createError(ErrorCode.SIZE_LIMIT, `${label} exceeds the ${limit}-byte limit`);
  }
}

export function createIpcError(code: ErrorCode | 'INVALID_ARGUMENT', message: string): AppError {
  return createError(code as ErrorCode, message);
}

// ============================================================================
// 工具函数
// ============================================================================

export function ensureWithinWorkspace(p: string): void {
  if (!p || typeof p !== 'string') {
    throw new Error('无效路径参数');
  }
  // 拒绝路径组件 ".."（遍历攻击）；用分隔符切分避免误拦 "foo.bar.baz" 这类合法名
  const segments = p.split(/[\\/]/);
  if (segments.some((seg) => seg === '..')) {
    throw new Error(`路径包含非法组件: ${p}`);
  }
  const resolved = path.resolve(p);
  // 禁止访问系统敏感目录
  const forbidden = [
    path.join(process.env.windir || 'C:\\Windows'),
    path.join(process.env.SystemRoot || 'C:\\Windows'),
  ];
  for (const f of forbidden) {
    if (resolved.toLowerCase().startsWith(f.toLowerCase())) {
      throw new Error(`禁止访问系统目录: ${p}`);
    }
  }
  if (!workspaceRoot) {
    // 无工作区时，限制在用户主目录下
    const home = app.getPath('home');
    if (resolved !== home && !resolved.startsWith(home + path.sep)) {
      throw new Error(`路径 ${p} 超出用户目录边界`);
    }
    return;
  }
  const root = path.resolve(workspaceRoot);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    throw new Error(`路径 ${p} 超出工作区边界 ${workspaceRoot}`);
  }
}

/**
 * 异步版本：在同步检查基础上，对已存在文件额外做 realpath 解析，
 * 防止符号链接（symlink）指向工作区外部的绕过。
 */
export async function ensureWithinWorkspaceAsync(p: string): Promise<void> {
  ensureWithinWorkspace(p);
  try {
    const real = await fsp.realpath(p);
    const resolved = path.resolve(p);
    if (real !== resolved) {
      // realpath 与 resolve 不一致，说明存在 symlink，重新检查 real 路径
      if (workspaceRoot) {
        const root = path.resolve(workspaceRoot);
        if (real !== root && !real.startsWith(root + path.sep)) {
          throw new Error(`符号链接指向工作区外部: ${p}`);
        }
      } else {
        const home = app.getPath('home');
        if (real !== home && !real.startsWith(home + path.sep)) {
          throw new Error(`符号链接指向用户目录外部: ${p}`);
        }
      }
    }
  } catch (e) {
    if (e instanceof Error && e.message.includes('符号链接')) throw e;
    // realpath 失败（文件不存在等）可忽略，由后续操作处理
  }
}

export function validateEncoding(enc: string): string {
  const lower = (enc || 'utf-8').toLowerCase();
  if (!ALLOWED_ENCODINGS.has(lower)) {
    console.warn(`[shared] Invalid encoding "${enc}", falling back to utf-8`);
    return 'utf-8';
  }
  return lower;
}

export async function atomicWrite(filePath: string, data: string | Buffer): Promise<void> {
  const dir = path.dirname(filePath);
  const tmp = path.join(dir, `.textora-tmp-${randomUUID()}`);
  try {
    await fsp.writeFile(tmp, data);
    await fsp.rename(tmp, filePath);
  } catch (e) {
    try { await fsp.unlink(tmp); } catch { /* ignore */ }
    throw e;
  }
}

export interface RetryOptions {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
}

const DEFAULT_RETRY: RetryOptions = {
  maxAttempts: 3,
  baseDelayMs: 100,
  maxDelayMs: 2000,
};

function shouldRetry(code: string | undefined): boolean {
  if (!code) return true;
  const retryable = new Set([
    'EAGAIN',
    'EBUSY',
    'ETIMEDOUT',
    'ECONNRESET',
    'EIO',
  ]);
  return retryable.has(code);
}

/**
 * 收窄 TOCTOU 窗口：操作前重新解析目标父目录的真实路径，确认其仍位于
 * 工作区内。防止「校验通过后、操作执行前」父目录被替换为指向工作区外的
 * symlink/junction（Windows junction 无需特权即可创建，是实际攻击面）。
 * 父目录尚不存在时沿祖先链向上校验最近存在的祖先。
 */
export async function assertDirStillWithinWorkspace(filePath: string): Promise<void> {
  if (!workspaceRoot) return;
  const root = await fsp.realpath(path.resolve(workspaceRoot));
  const realDir = await resolveNearestExistingDir(path.dirname(path.resolve(filePath)));
  if (realDir && !isWithin(root, realDir)) {
    throw createIpcError(ErrorCode.WORKSPACE_ESCAPE, 'Directory resolves outside the workspace');
  }
}

/** 向上寻找最近存在的祖先目录并返回其真实路径；不存在时返回 null */
async function resolveNearestExistingDir(dir: string): Promise<string | null> {
  while (true) {
    try {
      return await fsp.realpath(dir);
    } catch {
      const parent = path.dirname(dir);
      if (parent === dir) return null;
      dir = parent;
    }
  }
}

export async function atomicWriteWithRetry(
  filePath: string,
  data: string | Buffer,
  retry: RetryOptions = DEFAULT_RETRY,
): Promise<void> {
  const dir = path.dirname(filePath);
  const tmp = path.join(dir, `.textora-tmp-${randomUUID()}`);

  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= retry.maxAttempts; attempt++) {
    try {
      await fsp.writeFile(tmp, data);
      // rename 前复核父目录仍位于工作区内（防校验后父目录被 symlink 替换）
      await assertDirStillWithinWorkspace(filePath);
      await fsp.rename(tmp, filePath);
      return;
    } catch (e) {
      lastError = e as Error;
      try { await fsp.unlink(tmp); } catch { /* ignore */ }
      if (attempt === retry.maxAttempts) break;
      const errorCode = (lastError as NodeJS.ErrnoException).code;
      if (!shouldRetry(errorCode)) break;
      const delay = Math.min(
        retry.baseDelayMs * Math.pow(2, attempt - 1),
        retry.maxDelayMs,
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

export function detectLineEnding(text: string): string {
  if (text.includes('\r\n')) return 'crlf';
  if (text.includes('\r')) return 'cr';
  return 'lf';
}

export function kindForExt(ext: string): string {
  const e = ext.toLowerCase();
  if (MARKDOWN_EXTS.has(e)) return 'markdown';
  if (IMAGE_EXTS.has(e)) return 'image';
  if (CODE_EXTS.has(e)) return 'code';
  return 'unknown';
}

export function langForExt(ext: string): string {
  return LANG_MAP[ext.toLowerCase()] || 'plaintext';
}

export function mimeForExt(ext: string): string {
  return MIME_MAP[ext.toLowerCase()] || 'application/octet-stream';
}

export function looksLikeBinary(bytes: Uint8Array): boolean {
  const len = Math.min(bytes.length, 8000);
  for (let i = 0; i < len; i++) {
    if (bytes[i] === 0) return true;
  }
  return false;
}

export function hexDump(bytes: Uint8Array): string {
  const len = Math.min(bytes.length, 512);
  const lines: string[] = [];
  for (let i = 0; i < len; i += 16) {
    const slice = bytes.subarray(i, Math.min(i + 16, len));
    const hex = Array.from(slice)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join(' ');
    lines.push(hex);
  }
  return lines.join('\n');
}

export function sanitizeFilename(name: string): string {
  const sanitized = name
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
    .replace(/\.\.+/g, '.')
    .trim();
  const reserved = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;
  if (reserved.test(sanitized)) {
    return `_${sanitized}`;
  }
  return sanitized || 'untitled';
}

export function isHidden(base: string): boolean {
  return base.startsWith('.');
}

export function isSkipDir(name: string): boolean {
  const lower = name.toLowerCase();
  return lower === 'node_modules' || lower === 'target' || lower === '.git'
    || lower === '.next' || lower === '.nuxt' || lower === 'dist'
    || lower === 'build' || lower === 'coverage' || lower === '.cache';
}

export function detectFileFromArgv(argv: string[]): string | null {
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('-')) continue;
    try {
      if (!path.isAbsolute(a)) continue;
      if (!fs.existsSync(a)) continue;
      const stat = fs.statSync(a);
      if (stat.isFile()) {
        return a;
      }
    } catch {
      // ignore
    }
  }
  return null;
}

export function readSecrets(): Record<string, string> {
  try {
    const secretPath = path.join(app.getPath('userData'), 'secrets.enc');
    const raw = fs.readFileSync(secretPath, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

/** secrets.enc 文件路径（与 ipc/secrets.ts 中的 secretFile 保持一致） */
export function getSecretFilePath(): string {
  return path.join(app.getPath('userData'), 'secrets.enc');
}
