import { describe, expect, it, beforeEach } from "vitest";
import { safeReadLocal } from "../store/helpers";

describe("safeReadLocal structure validation", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("returns fallback for missing key", () => {
    expect(safeReadLocal<number[]>("missing", [1])).toEqual([1]);
  });

  it("returns parsed value when valid", () => {
    localStorage.setItem("k", JSON.stringify([1, 2, 3]));
    expect(safeReadLocal<number[]>("k", [], (v) => Array.isArray(v))).toEqual([1, 2, 3]);
  });

  it("returns fallback for invalid JSON", () => {
    localStorage.setItem("k", "{broken json");
    expect(safeReadLocal<number[]>("k", [9], (v) => Array.isArray(v))).toEqual([9]);
  });

  it("returns fallback when JSON parses but fails validation", () => {
    // 损坏数据：JSON.parse 成功（"null" / 对象）但结构不符
    localStorage.setItem("k", "null");
    expect(safeReadLocal<number[]>("k", [9], (v) => Array.isArray(v))).toEqual([9]);
    localStorage.setItem("k", "{}");
    expect(safeReadLocal<number[]>("k", [9], (v) => Array.isArray(v))).toEqual([9]);
    localStorage.setItem("k", '"string"');
    expect(safeReadLocal<string | null>("k", null, (v) => v === null || typeof v === "string")).toEqual("string");
  });

  it("validates nested structure for chat sessions", () => {
    const validateSessions = (v: unknown): v is { id: string; messages: unknown[] }[] =>
      Array.isArray(v) &&
      v.every(
        (s) =>
          s !== null &&
          typeof s === "object" &&
          typeof (s as { id?: unknown }).id === "string" &&
          Array.isArray((s as { messages?: unknown }).messages)
      );
    localStorage.setItem("s", JSON.stringify([{ id: "a", messages: [] }]));
    expect(validateSessions(safeReadLocal("s", [], validateSessions))).toBe(true);
    // 元素缺 messages 字段 → 校验失败回退
    localStorage.setItem("s", JSON.stringify([{ id: "a" }]));
    expect(safeReadLocal("s", [], validateSessions)).toEqual([]);
  });
});
