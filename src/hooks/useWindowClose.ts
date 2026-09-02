import { useEffect, useRef, useCallback } from "react";
import { listen, emit, isSaveDialogInFlight } from "../ipc";
import { useAppStore } from "../store/useAppStore";

type CloseState = "idle" | "confirming" | "closing";

export interface CloseRequestHandlerDeps {
  hasDirtyTabs: () => boolean;
  closeAllTabs: () => void;
  readyToClose: () => void;
}

export interface CloseRequestHandler {
  (): void;
  reset: () => void;
  getState: () => CloseState;
}

export function createCloseRequestHandler(deps: CloseRequestHandlerDeps): CloseRequestHandler {
  let state: CloseState = "idle";
  const handler = (() => {
    if (state !== "idle") return;
    if (!deps.hasDirtyTabs()) {
      state = "closing";
      deps.readyToClose();
      return;
    }
    state = "confirming";
    deps.closeAllTabs();
  }) as CloseRequestHandler;
  handler.reset = () => {
    state = "idle";
  };
  handler.getState = () => state;
  return handler;
}

type UnsubFn = () => void;

/**
 * 判断是否应通知主进程「用户取消了关闭」。
 * 仅当确认链从 closing 回落到 idle（用户主动取消）且仍有标签页时返回 true。
 * closeAllTabs 开头的防御性 setCloseFlow("idle")（idle→idle，Zustand 无条件
 * 通知订阅者）以及 onSave/onDiscard 清 pendingConfirm（closeFlow 不变）都不算取消——
 * 否则第一次关闭 dirty 标签时 close-cancel 被提前发出，窗口第一次关不掉。
 */
export function shouldNotifyCloseCancel(
  prev: { closeFlow: string; pendingConfirm: unknown; tabs: unknown[] },
  next: { closeFlow: string; pendingConfirm: unknown; tabs: unknown[] },
): boolean {
  return (
    prev.closeFlow === "closing" &&
    next.closeFlow === "idle" &&
    !next.pendingConfirm &&
    next.tabs.length > 0
  );
}

export function useWindowClose() {
  const handlingRef = useRef<CloseRequestHandler | null>(null);
  const subsRef = useRef<UnsubFn[]>([]);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    const handler = createCloseRequestHandler({
      hasDirtyTabs: () => useAppStore.getState().tabs.some((tab) => tab.dirty),
      closeAllTabs: () => {
        const state = useAppStore.getState();
        const unsubDone = useAppStore.subscribe((next) => {
          if (next.tabs.length === 0 && !next.pendingConfirm) {
            cleanup();
            handler.reset();
            emit("ready-to-close");
          }
        });
        const unsubCancel = useAppStore.subscribe((next, prev) => {
          if (shouldNotifyCloseCancel(prev, next)) {
            // 用户取消了关闭（仍有标签页）：通知主进程重置关闭流程，避免兜底强杀
            emit("close-cancel");
            cleanup();
            handler.reset();
          }
        });
        subsRef.current.push(unsubDone, unsubCancel);
        state.closeAllTabs();
        // 兜底强制关闭：初始 10s，此后若确认对话框或原生另存为对话框仍在等待用户，
        // 每 2s 重查（不强推）——用户在文件对话框里选保存位置时被强杀会丢未保存内容。
        // 主进程侧兜底（60s，同样感知原生对话框）负责最终兜底。
        const scheduleForceClose = (delayMs: number) => {
          timerRef.current = setTimeout(() => {
            const state = useAppStore.getState();
            if (state.pendingConfirm || isSaveDialogInFlight()) {
              scheduleForceClose(2000);
              return;
            }
            cleanup();
            handler.reset();
            emit("ready-to-close");
          }, delayMs);
        };
        scheduleForceClose(10000);
      },
      readyToClose: () => emit("ready-to-close"),
    });
    handlingRef.current = handler;

    const un = listen("close-request", () => {
      handlingRef.current?.();
    });

    return () => {
      cleanup();
      handlingRef.current = null;
      void un.then((fn) => fn());
    };
  }, [cleanup]);
}
