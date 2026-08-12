import * as fs from "fs";

export interface WatcherLike {
  close(): void;
}

export interface WatcherEntryLike {
  watchers: fs.FSWatcher[];
  cleanup(): void;
  /** 发起监听的窗口 id（用于窗口关闭时定向清理） */
  ownerId?: number;
}

export type WatcherCollection = fs.FSWatcher[] | WatcherEntryLike;

export function closeWatcherEntry(entry: WatcherCollection): void {
  if (Array.isArray(entry)) {
    for (const watcher of entry) {
      try { watcher.close(); } catch { /* best effort during shutdown */ }
    }
    return;
  }
  try { entry.cleanup(); } catch { /* best effort during shutdown */ }
}
