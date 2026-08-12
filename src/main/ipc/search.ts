/** Workspace listing and bounded content search handlers. */
import { ipcMain } from "electron";
import * as path from "path";
import * as fs from "fs";
import * as fsp from "fs/promises";
import {
  MdFileItem,
  SearchMatch,
  AllFileItem,
  MARKDOWN_EXTS,
  isHidden,
  isSkipDir,
  looksLikeBinary,
  validateWorkspacePath,
} from "../shared";
import { FILE_SIZE_LIMITS } from "../constants";

export const MAX_FILES_SCANNED = 10_000;
export const MAX_TOTAL_BYTES_SCANNED = 512 * 1024 * 1024;
export const MAX_LISTED_FILES = 50_000;
/** 正则模式下参与匹配的最大单行长度，避免超长行触发灾难性回溯 */
const MAX_REGEX_LINE_LENGTH = 4096;

import { isDangerousRegex } from "../../shared/safeRegex";
export { isDangerousRegex };

export interface SearchResponse {
  matches: SearchMatch[];
  truncated: boolean;
}

export interface SearchOptions {
  maxFilesScanned?: number;
  maxTotalBytesScanned?: number;
  signal?: AbortSignal;
}

export async function searchWorkspace(
  root: string,
  query: string,
  useRegex: boolean,
  caseSensitive: boolean,
  fileFilter?: string,
  excludeDirs?: string,
  options: SearchOptions = {},
): Promise<SearchResponse> {
  const result: SearchMatch[] = [];
  if (!query) return { matches: result, truncated: false };

  let regex: RegExp | null = null;
  if (useRegex) {
    try {
      regex = new RegExp(query, caseSensitive ? "" : "i");
    } catch {
      regex = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), caseSensitive ? "" : "i");
    }
    // ReDoS 防护：拒绝明显会灾难性回溯的模式，避免主进程事件循环被锁死
    if (isDangerousRegex(query)) {
      throw new Error(
        "The regular expression may cause catastrophic backtracking (ReDoS). Please simplify it."
      );
    }
  }

  const maxFiles = options.maxFilesScanned ?? MAX_FILES_SCANNED;
  const maxBytes = options.maxTotalBytesScanned ?? MAX_TOTAL_BYTES_SCANNED;
  const filterPatterns = (fileFilter || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  const excludes = (excludeDirs || "node_modules,.git").split(",").map((s) => s.trim()).filter(Boolean);
  const matchesFileFilter = (filePath: string): boolean => {
    if (filterPatterns.length === 0) return true;
    const lower = filePath.toLowerCase();
    return filterPatterns.some((p) => p.startsWith("*.") ? lower.endsWith(p.slice(1)) : lower.endsWith(p));
  };
  const shouldExcludeDir = (dirName: string): boolean =>
    excludes.some((e) => dirName === e || dirName.startsWith(e + "/") || dirName.startsWith(e + "\\"));

  let truncated = false;
  let scannedFiles = 0;
  let scannedBytes = 0;
  const files: { fullPath: string; name: string; size: number }[] = [];
  const collectFiles = async (currentDir: string): Promise<void> => {
    if (truncated || options.signal?.aborted) { truncated = true; return; }
    let entries: fs.Dirent[];
    try { entries = await fsp.readdir(currentDir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      if (truncated || options.signal?.aborted) { truncated = true; return; }
      if (entry.isDirectory() && shouldExcludeDir(entry.name)) continue;
      if (isHidden(entry.name) || isSkipDir(entry.name) || entry.isSymbolicLink()) continue;
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        await collectFiles(fullPath);
      } else if (entry.isFile() && matchesFileFilter(entry.name)) {
        const stat = await fsp.stat(fullPath).catch(() => null);
        if (!stat) continue;
        const size = stat.size;
        if (scannedFiles >= maxFiles || scannedBytes + size > maxBytes) {
          truncated = true;
          return;
        }
        scannedFiles += 1;
        scannedBytes += size;
        files.push({ fullPath, name: entry.name, size });
      }
    }
  };
  await collectFiles(root);

  let aborted = truncated || Boolean(options.signal?.aborted);
  const searchFile = async (file: { fullPath: string; name: string; size: number }) => {
    if (aborted || options.signal?.aborted) { aborted = true; return; }
    try {
      if (file.size > FILE_SIZE_LIMITS.TEXT_MAX_SIZE) return;
      const buf = await fsp.readFile(file.fullPath);
      if (looksLikeBinary(buf)) return;
      const lines = buf.toString("utf-8").split("\n");
      for (let i = 0; i < lines.length; i++) {
        if (aborted || options.signal?.aborted) { aborted = true; return; }
        const line = lines[i];
        let col = -1;
        if (regex) {
          // 超长行跳过正则匹配，防止灾难性回溯锁死主进程
          if (line.length > MAX_REGEX_LINE_LENGTH) continue;
          regex.lastIndex = 0;
          const match = regex.exec(line);
          if (match) col = match.index;
        } else {
          const searchLine = caseSensitive ? line : line.toLowerCase();
          const searchQuery = caseSensitive ? query : query.toLowerCase();
          col = searchLine.indexOf(searchQuery);
        }
        if (col >= 0) {
          result.push({ path: file.fullPath, name: file.name, line: i + 1, column: col + 1, preview: line.slice(0, 80) });
          if (result.length >= 500) { aborted = true; truncated = true; return; }
        }
      }
    } catch {
      // Ignore files that disappear or cannot be decoded while scanning.
    }
  };

  for (let i = 0; i < files.length && !aborted; i += 8) {
    await Promise.all(files.slice(i, i + 8).map(searchFile));
  }
  return { matches: result, truncated: truncated || aborted };
}

export function registerSearchHandlers(): void {
  ipcMain.handle("textora:list_md_files", async (_evt, root: string): Promise<MdFileItem[]> => {
    const checked = await validateWorkspacePath(root);
    if (!checked.ok) throw new Error(checked.message);
    root = checked.resolved;
    const result: MdFileItem[] = [];
    const visit = async (currentDir: string): Promise<void> => {
      if (result.length >= MAX_LISTED_FILES) return;
      let entries: fs.Dirent[];
      try { entries = await fsp.readdir(currentDir, { withFileTypes: true }); } catch { return; }
      for (const entry of entries) {
        if (result.length >= MAX_LISTED_FILES) return;
        if (isHidden(entry.name) || isSkipDir(entry.name) || entry.isSymbolicLink()) continue;
        const fullPath = path.join(currentDir, entry.name);
        if (entry.isDirectory()) await visit(fullPath);
        else if (entry.isFile() && MARKDOWN_EXTS.has(path.extname(entry.name).slice(1).toLowerCase())) {
          result.push({ name: entry.name, path: fullPath, rel_path: path.relative(root, fullPath) });
        }
      }
    };
    await visit(root);
    return result;
  });

  ipcMain.handle("textora:search_in_files", async (_evt, root: string, query: string, useRegex: boolean, caseSensitive: boolean, fileFilter?: string, excludeDirs?: string): Promise<SearchResponse> => {
    const checked = await validateWorkspacePath(root);
    if (!checked.ok) throw new Error(checked.message);
    root = checked.resolved;
    return searchWorkspace(root, query, useRegex, caseSensitive, fileFilter, excludeDirs);
  });

  ipcMain.handle("textora:list_all_files", async (_evt, root: string): Promise<AllFileItem[]> => {
    const checked = await validateWorkspacePath(root);
    if (!checked.ok) throw new Error(checked.message);
    root = checked.resolved;
    const result: AllFileItem[] = [];
    const visit = async (currentDir: string): Promise<void> => {
      if (result.length >= MAX_LISTED_FILES) return;
      let entries: fs.Dirent[];
      try { entries = await fsp.readdir(currentDir, { withFileTypes: true }); } catch { return; }
      for (const entry of entries) {
        if (result.length >= MAX_LISTED_FILES) return;
        if (isHidden(entry.name) || isSkipDir(entry.name) || entry.isSymbolicLink()) continue;
        const fullPath = path.join(currentDir, entry.name);
        if (entry.isDirectory()) {
          try {
            const stat = await fsp.stat(fullPath);
            result.push({ name: entry.name, path: fullPath, rel_path: path.relative(root, fullPath), size: stat.size, is_dir: true });
          } catch { continue; }
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
}
