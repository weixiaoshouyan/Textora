import { useEffect, useRef, useCallback } from "react";
import { listen, emit } from "../ipc";
import { useAppStore } from "../store/useAppStore";

type UnsubFn = () => void;

/**
 * 监听主进程关闭请求，处理未保存标签。
 * 流程：
 * 1. 主进程发送 close-request
 * 2. 检查是否有 dirty 标签
 * 3. 无 → 直接回复 ready-to-close
 * 4. 有 → 走 closeAllTabs 的 pendingConfirm 流程
 *    → 全部处理完后回复 ready-to-close
 */
export function useWindowClose() {
  const handlingRef = useRef(false);
  // 跟踪所有活跃的订阅，确保清理
  const subsRef = useRef<UnsubFn[]>([]);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 清理所有订阅和定时器
  const cleanup = useCallback(() => {
    for (const unsub of subsRef.current) {
      try {
        unsub();
      } catch {
        // ignore cleanup errors
      }
    }
    subsRef.current = [];
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => {
    const un = listen("close-request", () => {
      if (handlingRef.current) return;
      handlingRef.current = true;

      const state = useAppStore.getState();
      const dirtyCount = state.tabs.filter((t) => t.dirty).length;

      if (dirtyCount === 0) {
        handlingRef.current = false;
        emit("ready-to-close");
        return;
      }

      // 清理之前的订阅和定时器（保险起见）
      cleanup();

      // 监听 tabs 全部清空 → 关闭完成
      const unsub1 = useAppStore.subscribe((s) => {
        if (s.tabs.length === 0 && !s.pendingConfirm) {
          cleanup();
          handlingRef.current = false;
          emit("ready-to-close");
        }
      });
      subsRef.current.push(unsub1);

      // 监听用户取消 → 重置状态
      const unsub2 = useAppStore.subscribe((s) => {
        if (!s.pendingConfirm && s.tabs.length > 0 && handlingRef.current) {
          cleanup();
          handlingRef.current = false;
        }
      });
      subsRef.current.push(unsub2);

      state.closeAllTabs();

      // 超时兜底：10秒后强制重置状态并清理
      timerRef.current = setTimeout(() => {
        cleanup();
        handlingRef.current = false;
        // 超时后不发送 ready-to-close，让主进程决定
      }, 10000);
    });

    return () => {
      cleanup();
      void un.then((fn) => fn());
    };
  }, [cleanup]);
}
