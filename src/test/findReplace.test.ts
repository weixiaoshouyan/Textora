import { describe, it, expect } from "vitest";
import { replaceAllInText } from "../editor/findReplace";

describe("replaceAllInText", () => {
  it("replaces all occurrences (regression: only first used to take effect)", () => {
    const matches = [
      { from: 0, to: 1 },
      { from: 1, to: 2 },
      { from: 2, to: 3 },
    ];
    expect(replaceAllInText("aaa", matches, "X")).toBe("XXX");
  });

  it("replaces from the end to avoid offset shifts", () => {
    const matches = [
      { from: 0, to: 1 },
      { from: 1, to: 2 },
      { from: 2, to: 3 },
    ];
    // 替换长度不同的文本，偏移不应错位
    expect(replaceAllInText("abc", matches, "XY")).toBe("XYXYXY");
  });

  it("handles zero matches (no-op)", () => {
    expect(replaceAllInText("hello world", [], "X")).toBe("hello world");
  });

  it("handles adjacent and non-adjacent matches", () => {
    const matches = [
      { from: 1, to: 2 },
      { from: 3, to: 4 },
    ];
    expect(replaceAllInText("a1b2c", matches, "*")).toBe("a*b*c");
  });

  it("preserves text before/after the match range", () => {
    const matches = [{ from: 3, to: 6 }];
    expect(replaceAllInText("preFOOpost", matches, "bar")).toBe("prebarpost");
  });

  it("replaces the same content as a global regex would", () => {
    const text = "foo bar foo baz foo";
    const re = /foo/g;
    const matches: { from: number; to: number }[] = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      matches.push({ from: m.index, to: m.index + m[0].length });
    }
    expect(replaceAllInText(text, matches, "qux")).toBe("qux bar qux baz qux");
  });
});
