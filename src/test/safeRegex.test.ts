import { describe, expect, it } from "vitest";
import { isDangerousRegex, MAX_REGEX_PATTERN_LENGTH } from "../shared/safeRegex";

describe("ReDoS detection (shared safeRegex)", () => {
  it("flags nested quantifiers", () => {
    expect(isDangerousRegex("(a+)+")).toBe(true);
    expect(isDangerousRegex("(a*)*")).toBe(true);
    expect(isDangerousRegex("(a?)+")).toBe(true);
    expect(isDangerousRegex("a(a+)+b")).toBe(true);
  });

  it("flags wrapper-paren bypasses at any depth", () => {
    expect(isDangerousRegex("((a+)*)")).toBe(true);
    expect(isDangerousRegex("(?:(a+)*)")).toBe(true);
    expect(isDangerousRegex("(((a?)+))")).toBe(true);
    expect(isDangerousRegex("(?:x(a+)+)")).toBe(true);
  });

  it("flags adjacent repeatable groups", () => {
    expect(isDangerousRegex("(a+)(b+)+")).toBe(true);
    expect(isDangerousRegex("(x+)(y+){2,}")).toBe(true);
  });

  it("flags alternations with unequal branches under a quantifier", () => {
    expect(isDangerousRegex("(a|aa)+")).toBe(true);
    expect(isDangerousRegex("(a?|a)+")).toBe(true);
    expect(isDangerousRegex("(ab|abc){2,}")).toBe(true);
  });

  it("allows safe alternations and simple patterns", () => {
    expect(isDangerousRegex("(a|a)+")).toBe(false);
    expect(isDangerousRegex("foo|bar")).toBe(false);
    expect(isDangerousRegex("\\d+")).toBe(false);
    expect(isDangerousRegex("^[a-z]+$")).toBe(false);
    expect(isDangerousRegex("https?://")).toBe(false);
  });

  it("rejects overlong patterns", () => {
    expect(isDangerousRegex("a".repeat(MAX_REGEX_PATTERN_LENGTH + 1))).toBe(true);
    expect(isDangerousRegex("a".repeat(MAX_REGEX_PATTERN_LENGTH))).toBe(false);
  });
});
