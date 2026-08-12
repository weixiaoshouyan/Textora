import { describe, expect, it } from "vitest";
import { diffTexts, diffStats } from "../editor/diff";

describe("diffTexts", () => {
  it("produces LCS-based diff for small files", () => {
    const r = diffTexts("a\nb\nc", "a\nx\nc");
    expect(r.map((l) => l.type)).toEqual(["equal", "del", "add", "equal"]);
    expect(r[1]).toMatchObject({ text: "b", leftLine: 2, rightLine: null });
    expect(r[2]).toMatchObject({ text: "x", leftLine: null, rightLine: 2 });
  });

  it("handles empty inputs", () => {
    expect(diffTexts("", "")).toEqual([]);
    const r = diffTexts("", "a\nb");
    expect(r.map((l) => l.type)).toEqual(["add", "add"]);
  });

  it("normalizes CRLF", () => {
    const r = diffTexts("a\r\nb", "a\nb\nc");
    expect(r.map((l) => l.type)).toEqual(["equal", "equal", "add"]);
  });

  it("falls back to prefix/suffix-preserving diff for large files", () => {
    // 2000 行超过 LCS 阈值 → 退化路径
    const bigA = Array.from({ length: 2000 }, (_, i) => "line" + i).join("\n");
    const bigB = bigA.replace("line1000", "line1000\ninserted");
    const r = diffTexts(bigA, bigB);
    const stats = diffStats(r);
    // 插入 1 行：其余 2000 行保持 equal 对齐，无错位
    expect(stats.additions).toBe(1);
    expect(stats.deletions).toBe(0);
    expect(stats.unchanged).toBe(2000);
    expect(r[0].type).toBe("equal");
    expect(r[r.length - 1].type).toBe("equal");
  });

  it("reports correct stats for modified lines", () => {
    const r = diffTexts("a\nold\nz", "a\nnew\nz");
    expect(diffStats(r)).toEqual({ additions: 1, deletions: 1, unchanged: 2 });
  });
});
