/**
 * searchHistory helpers — extracted from FindReplace for testability
 *
 * We test the pure logic: dedupe + cap at 20 + most-recent-first ordering.
 */
import { describe, it, expect, beforeEach } from "vitest";

/** Pure function mirroring the setSearchHistory callback in FindReplace.tsx */
function nextHistory(prev: string[], q: string): string[] {
  if (!q.trim()) return prev;
  const filtered = prev.filter((h) => h !== q);
  return [q, ...filtered].slice(0, 20);
}

describe("searchHistory logic", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("prepends new query to front", () => {
    expect(nextHistory(["b", "a"], "c")).toEqual(["c", "b", "a"]);
  });

  it("deduplicates: moves existing query to front", () => {
    expect(nextHistory(["b", "a"], "b")).toEqual(["b", "a"]);
  });

  it("ignores empty / whitespace-only queries", () => {
    expect(nextHistory(["a"], "   ")).toEqual(["a"]);
    expect(nextHistory(["a"], "")).toEqual(["a"]);
  });

  it("caps at 20 entries", () => {
    const big = Array.from({ length: 20 }, (_, i) => `q${String(i).padStart(2, "0")}`);
    const result = nextHistory(big, "newest");
    expect(result).toHaveLength(20);
    expect(result[0]).toBe("newest");
    expect(result.includes("q19")).toBe(false); // oldest (last) dropped
  });

  it("localStorage round-trip", () => {
    const h = ["rust", "typescript", "python"];
    localStorage.setItem("textora.searchHistory", JSON.stringify(h));
    const parsed = JSON.parse(
      localStorage.getItem("textora.searchHistory") || "[]"
    );
    expect(parsed).toEqual(h);
  });
});
