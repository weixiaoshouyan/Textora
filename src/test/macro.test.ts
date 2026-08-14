import { describe, expect, it, vi } from "vitest";
import { MacroPlayer, MacroRecorder } from "../editor/macro";

describe("macro recorder", () => {
  it("merges consecutive inserts at adjacent positions", () => {
    const r = new MacroRecorder();
    r.startRecording();
    r.recordInsert("he", 0);
    r.recordInsert("llo", 2);
    const actions = r.stopRecording();
    expect(actions).toHaveLength(1);
    expect(actions[0].text).toBe("hello");
  });
});

describe("macro player", () => {
  it("resets playing flag after an exception during playback", async () => {
    // 回归：setText 抛错时 playing 必须复位，
    // 否则 isPlaying() 永久为 true，后续所有回放都被拒绝
    const player = new MacroPlayer();
    const editor = {
      getText: () => "abc",
      setText: () => {
        throw new Error("editor destroyed");
      },
      select: vi.fn(),
      focus: vi.fn(),
    };

    await expect(
      player.play([{ type: "insert", text: "x", from: 0, timestamp: 0 }], editor)
    ).rejects.toThrow("editor destroyed");
    expect(player.isPlaying()).toBe(false);

    // 复位后可以再次播放
    expect(player.isPlaying()).toBe(false);
  });

  it("resets playing flag after stop()", async () => {
    const player = new MacroPlayer();
    const editor = {
      getText: () => "abc",
      setText: vi.fn(),
      select: vi.fn(),
      focus: vi.fn(),
    };
    const playPromise = player.play(
      [{ type: "insert", text: "x", from: 0, timestamp: 200 }],
      editor
    );
    expect(player.isPlaying()).toBe(true);
    player.stop();
    await playPromise;
    expect(player.isPlaying()).toBe(false);
  });
});
