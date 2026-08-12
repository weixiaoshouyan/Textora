import { describe, expect, it, vi } from "vitest";
import { createCloseRequestHandler } from "../hooks/useWindowClose";

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
});
