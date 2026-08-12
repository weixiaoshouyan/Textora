import { useEffect, useRef, useCallback } from "react";
import { listen, emit } from "../ipc";
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
        const unsubCancel = useAppStore.subscribe((next) => {
          // closeFlow === "closing" 表示 closeAllTabs 确认链进行中：
          // onSave/onDiscard 清 pendingConfirm 属于正常流程，不能当作取消。
          if (!next.pendingConfirm && next.tabs.length > 0 && next.closeFlow === "idle") {
            // 用户取消了关闭（仍有标签页）：通知主进程重置关闭流程，避免兜底强杀
            emit("close-cancel");
            cleanup();
            handler.reset();
          }
        });
        subsRef.current.push(unsubDone, unsubCancel);
        state.closeAllTabs();
        timerRef.current = setTimeout(() => {
          const state = useAppStore.getState();
          // 如果有未完成的确认对话框，不强制关闭，等待用户响应
          if (state.pendingConfirm) return;
          cleanup();
          handler.reset();
          emit("ready-to-close");
        }, 10000);
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
