/**
 * 最近打开文件（欢迎页展示）。
 * 纯渲染层持久化（localStorage），复用 helpers 的安全读写封装。
 */
import { safeReadLocal, safeWriteLocal, normalizePath } from "./helpers";

export interface RecentFile {
  path: string;
  name: string;
  openedAt: number;
}

export const RECENTS_KEY = "textora.recents";
export const MAX_RECENTS = 10;

function isValidRecent(v: unknown): v is RecentFile {
  if (!v || typeof v !== "object") return false;
  const r = v as RecentFile;
  return (
    typeof r.path === "string" &&
    r.path.trim() !== "" &&
    // 打包应用内部路径不应出现在最近文件里
    !r.path.includes("app.asar") &&
    typeof r.name === "string" &&
    typeof r.openedAt === "number"
  );
}

/** 读取最近文件列表（严格校验，损坏数据回退为空） */
export function readRecents(): RecentFile[] {
  const raw = safeReadLocal<unknown>(RECENTS_KEY, []);
  if (!Array.isArray(raw)) return [];
  return raw.filter(isValidRecent).slice(0, MAX_RECENTS);
}

/** 记录一次文件打开：同路径去重并移到最前，超上限截断 */
export function addRecent(path: string, name: string): RecentFile[] {
  const norm = normalizePath(path).toLowerCase();
  const next = readRecents().filter(
    (r) => normalizePath(r.path).toLowerCase() !== norm
  );
  next.unshift({ path, name, openedAt: Date.now() });
  const trimmed = next.slice(0, MAX_RECENTS);
  safeWriteLocal(RECENTS_KEY, trimmed);
  return trimmed;
}
