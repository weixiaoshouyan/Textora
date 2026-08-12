import { describe, expect, it, vi } from "vitest";
import { closeWatcherEntry, type WatcherEntryLike } from "../main/watcherCleanup";

describe("watcher cleanup", () => {
  it("invokes structured entry cleanup exactly once", () => {
    const closeA = vi.fn();
    const closeB = vi.fn();
    const cleanup = vi.fn();
    const entry: WatcherEntryLike = {
      watchers: [{ close: closeA }, { close: closeB }] as never,
      cleanup,
    };

    closeWatcherEntry(entry);

    expect(closeA).not.toHaveBeenCalled();
    expect(closeB).not.toHaveBeenCalled();
    expect(cleanup).toHaveBeenCalledOnce();
  });

  it("supports the legacy watcher array", () => {
    const close = vi.fn();
    closeWatcherEntry([{ close }] as never);
    expect(close).toHaveBeenCalledOnce();
  });
});
