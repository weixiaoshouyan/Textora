import { useEffect } from "react";
import { useAppStore } from "../store/useAppStore";

interface AutoSaveTimer {
  timer: number;
  revision: number;
  path: string;
}

/** Schedule independent autosave timers for each dirty, named tab. */
export function useAutoSave() {
  useEffect(() => {
    // 定时器表只在 effect 作用域内使用：cleanup 闭包引用的是本作用域的局部
    // 变量，避免 react-hooks 对 `ref.current` 延迟读取的误报，也保证清理的是
    // 本次 effect 实例创建的定时器。
    const timers = new Map<string, AutoSaveTimer>();

    function clearTimer(tabId: string) {
      const entry = timers.get(tabId);
      if (entry !== undefined) {
        window.clearTimeout(entry.timer);
        timers.delete(tabId);
      }
    }

    function schedule() {
      const state = useAppStore.getState();
      const enabled = state.settings.autoSaveSeconds > 0;
      const delay = state.settings.autoSaveSeconds * 1000;
      const liveIds = new Set<string>();

      for (const tab of state.tabs) {
        if (!enabled || !tab.path || !tab.dirty) {
          clearTimer(tab.id);
          continue;
        }
        liveIds.add(tab.id);
        const existing = timers.get(tab.id);
        if (existing && existing.revision === tab.revision && existing.path === tab.path) continue;
        if (existing) clearTimer(tab.id);
        const timer = window.setTimeout(() => {
          timers.delete(tab.id);
          void useAppStore.getState().saveTab(tab.id).catch(() => {
            // saveTab keeps the tab dirty and shows the save error.
          });
        }, delay);
        timers.set(tab.id, { timer, revision: tab.revision, path: tab.path });
      }

      for (const tabId of timers.keys()) {
        if (!liveIds.has(tabId)) clearTimer(tabId);
      }
    }

    const unsubscribe = useAppStore.subscribe(schedule);
    schedule();

    return () => {
      for (const entry of timers.values()) window.clearTimeout(entry.timer);
      timers.clear();
      unsubscribe();
    };
  }, []);
}
