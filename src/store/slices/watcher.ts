/**
 * 文件监听事件批量重载管理器
 *
 * 大目录（node_modules / .git 等）会在短时间内狂发 fs 事件，
 * 若每个事件都 loadDir 会把主线程打爆导致界面卡死。
 * 策略：收集需要重载的父目录到集合，事件流停歇 300ms 后批量重载一次。
 *
 * 工作区边界校验由 loadDir 统一兜底（它检查 workspaceRoot 是否有效及路径范围），
 * 此处只负责防抖调度。
 */
import { DIR_LISTING, HIGH_FREQ_DIRS } from "../../shared/constants";
import { normalizePath } from "../helpers";

export interface WatcherManager {
  isHighFreqPath: (path: string) => boolean;
  scheduleBatchReload: (dirPath: string) => void;
  clearPendingReloads: () => void;
}

export function createWatcherManager(loadDir: (dir: string) => Promise<void>): WatcherManager {
  let pendingReloadDirs = new Set<string>();
  let reloadTimerId: number | null = null;

  function isHighFreqPath(path: string): boolean {
    const norm = normalizePath(path);
    const segs = norm.split("/");
    return segs.some((s) => HIGH_FREQ_DIRS.has(s));
  }

  function scheduleBatchReload(dirPath: string) {
    if (!dirPath) return;
    pendingReloadDirs.add(normalizePath(dirPath));
    if (reloadTimerId !== null) window.clearTimeout(reloadTimerId);
    reloadTimerId = window.setTimeout(() => {
      const dirs = pendingReloadDirs;
      pendingReloadDirs = new Set<string>();
      reloadTimerId = null;
      // 串行重载，避免并发 IPC 把磁盘打爆
      void (async () => {
        for (const d of dirs) {
          try {
            await loadDir(d);
          } catch {
            /* ignore single dir failure */
          }
        }
      })();
    }, DIR_LISTING.DEBOUNCE_MS);
  }

  function clearPendingReloads() {
    if (reloadTimerId !== null) {
      window.clearTimeout(reloadTimerId);
      reloadTimerId = null;
    }
    pendingReloadDirs.clear();
  }

  return { isHighFreqPath, scheduleBatchReload, clearPendingReloads };
}
