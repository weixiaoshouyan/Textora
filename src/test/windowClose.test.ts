import { describe, expect, it, vi } from "vitest";
import { createCloseRequestHandler, shouldNotifyCloseCancel } from "../hooks/useWindowClose";

describe("window close flow", () => {
  it("handles duplicate close requests only once", () => {
    const closeAllTabs = vi.fn();
    const ready = vi.fn();
    const handler = createCloseRequestHandler({
      hasDirtyTabs: () => true,
      closeAllTabs,
      readyToClose: ready,
    });

    handler();
    handler();

    expect(closeAllTabs).toHaveBeenCalledTimes(1);
    expect(ready).not.toHaveBeenCalled();
    handler.reset();
    handler();
    expect(closeAllTabs).toHaveBeenCalledTimes(2);
  });

  it("closes immediately when there are no dirty tabs", () => {
    const closeAllTabs = vi.fn();
    const ready = vi.fn();
    const handler = createCloseRequestHandler({
      hasDirtyTabs: () => false,
      closeAllTabs,
      readyToClose: ready,
    });

    handler();

    expect(closeAllTabs).not.toHaveBeenCalled();
    expect(ready).toHaveBeenCalledTimes(1);
  });

  describe("shouldNotifyCloseCancel（关窗确认链回归）", () => {
    const tabs = [{ id: "a", dirty: true }];

    it("closeAllTabs 开头的防御性 setCloseFlow(idle→idle) 不应误报取消", () => {
      // 首次关闭时 closeFlow 初始为 idle，closeAllTabs 第一行 setCloseFlow("idle")
      // 是幂等重置：若被当作取消，close-cancel 提前发出 → 窗口第一次关不掉
      expect(
        shouldNotifyCloseCancel(
          { closeFlow: "idle", pendingConfirm: null, tabs },
          { closeFlow: "idle", pendingConfirm: null, tabs },
        ),
      ).toBe(false);
    });

    it("onSave/onDiscard 清 pendingConfirm（closeFlow 保持 closing）不应误报取消", () => {
      expect(
        shouldNotifyCloseCancel(
          { closeFlow: "closing", pendingConfirm: { title: "x" }, tabs },
          { closeFlow: "closing", pendingConfirm: null, tabs },
        ),
      ).toBe(false);
    });

    it("用户主动取消（closing → idle）才通知主进程", () => {
      expect(
        shouldNotifyCloseCancel(
          { closeFlow: "closing", pendingConfirm: { title: "x" }, tabs },
          { closeFlow: "idle", pendingConfirm: null, tabs },
        ),
      ).toBe(true);
    });
  });
});
