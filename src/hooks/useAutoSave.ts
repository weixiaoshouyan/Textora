import { useEffect, useRef } from "react";
import { useAppStore, getActiveTab } from "../store/useAppStore";

/**
 * 自动保存 hook：当 autoSaveSeconds > 0 时，定时保存当前标签。
 * 保存间隔在 settings.autoSaveSeconds 中配置。
 */
export function useAutoSave() {
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    function clearTimer() {
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    }

    function schedule() {
      clearTimer();
      const { settings } = useAppStore.getState();
      const tab = getActiveTab(useAppStore.getState());
      if (settings.autoSaveSeconds > 0 && tab?.path && tab.dirty) {
        timerRef.current = window.setTimeout(() => {
          void useAppStore.getState().saveFile();
          schedule();
        }, settings.autoSaveSeconds * 1000);
      }
    }

    // 监听设置变化和内容变化
    const unsubSettings = useAppStore.subscribe((s, prev) => {
      if (s.settings.autoSaveSeconds !== prev.settings.autoSaveSeconds) {
        schedule();
      }
    });

    // 监听内容变化（dirty 状态变化）
    const unsubDirty = useAppStore.subscribe((s, prev) => {
      const currTab = getActiveTab(s);
      const prevTab = getActiveTab(prev);
      if (currTab?.dirty !== prevTab?.dirty || currTab?.id !== prevTab?.id) {
        schedule();
      }
    });

    schedule();

    return () => {
      clearTimer();
      unsubSettings();
      unsubDirty();
    };
  }, []);
}
