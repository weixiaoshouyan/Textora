import { beforeEach, describe, expect, it } from "vitest";
import {
  checkRateLimit,
  getChannelCallCount,
  getLimitedChannels,
  resetAllLimits,
} from "../main/rateLimiter";

describe("rate limiter", () => {
  beforeEach(() => {
    resetAllLimits();
  });

  it("limits strict channels at their own threshold (20/10s)", () => {
    for (let i = 0; i < 20; i++) {
      expect(checkRateLimit("textora:run_tool")).toBe(true);
    }
    expect(checkRateLimit("textora:run_tool")).toBe(false);
  });

  it("limits default channels at the default threshold (100/10s)", () => {
    for (let i = 0; i < 100; i++) {
      expect(checkRateLimit("textora:some_channel")).toBe(true);
    }
    expect(checkRateLimit("textora:some_channel")).toBe(false);
  });

  it("reports limited strict channels with their own config (regression)", () => {
    // 旧实现用 DEFAULT_CONFIG(100) 判断所有通道，strict 通道(20) 永远进不了受限列表
    for (let i = 0; i < 20; i++) checkRateLimit("textora:run_tool");
    expect(getLimitedChannels()).toContain("textora:run_tool");
    // 未达阈值的通道不应上报
    checkRateLimit("textora:read_text_file");
    expect(getLimitedChannels()).not.toContain("textora:read_text_file");
  });

  it("counts are per-channel", () => {
    checkRateLimit("textora:a");
    checkRateLimit("textora:b");
    expect(getChannelCallCount("textora:a")).toBe(1);
    expect(getChannelCallCount("textora:b")).toBe(1);
  });
});
