/**
 * 主进程共享模块：类型定义、常量、工具函数
 */
import { app } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import * as fsp from 'fs/promises';
import { randomUUID } from 'crypto';

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

export const TEXT_MAX_SIZE = 20 * 1024 * 1024;
export const IMAGE_MAX_SIZE = 50 * 1024 * 1024;
export const BINARY_MAX_SIZE = 50 * 1024 * 1024;

/** 编码白名单 */
export const ALLOWED_ENCODINGS = new Set([
  'utf-8', 'utf-8-bom', 'latin1', 'gbk', 'gb2312', 'utf-16le', 'utf-16be', 'ascii', 'binary',
]);

// ============================================================================
// 全局状态（跨模块共享）
// ============================================================================

export let workspaceRoot: string | null = null;
export function setWorkspaceRoot(p: string | null): void {
  workspaceRoot = p;
}

// ============================================================================
// 工具函数
// ============================================================================

export function ensureWithinWorkspace(p: string): void {
  if (!p || typeof p !== 'string') {
    throw new Error('无效路径参数');
  }
  // 拒绝包含 .. 的路径组件（即使 resolve 会规范化，也显式拒绝以防万一）
  if (p.includes('..')) {
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
    return 'utf-8';
  }
  return lower;
}

export async function atomicWrite(filePath: string, data: string | Buffer): Promise<void> {
  const dir = path.dirname(filePath);
  const tmp = path.join(dir, `.textora-tmp-${randomUUID()}`);
  await fsp.writeFile(tmp, data);
  await fsp.rename(tmp, filePath);
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
  return sanitized || 'untitled';
}

export function isHidden(base: string): boolean {
  return base.startsWith('.');
}

export function isSkipDir(name: string): boolean {
  return name === 'node_modules' || name === 'target' || name === '.git';
}

export function detectFileFromArgv(argv: string[]): string | null {
  const ownFile = __filename;
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('-')) continue;
    try {
      if (!path.isAbsolute(a)) continue;
      if (!fs.existsSync(a)) continue;
      const stat = fs.statSync(a);
      if (stat.isFile() && path.resolve(a) !== path.resolve(ownFile)) {
        return a;
      }
    } catch {
      // 忽略
    }
  }
  return null;
}

/** 读取 secrets.enc 文件中的加密数据 */
export function readSecrets(): Record<string, string> {
  try {
    const secretPath = path.join(app.getPath('userData'), 'secrets.enc');
    const raw = fs.readFileSync(secretPath, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

export const SECRET_FILE = (): string => path.join(app.getPath('userData'), 'secrets.enc');
