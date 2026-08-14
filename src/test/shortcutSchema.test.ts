import { describe, expect, it } from "vitest";
import { normalizeBinding } from "../hooks/shortcutSchema";

describe("shortcut binding normalization", () => {
  it("normalizes modifier order variants to canonical form", () => {
    expect(normalizeBinding("shift+mod+s")).toBe("mod+shift+s");
    expect(normalizeBinding("alt+shift+mod+x")).toBe("mod+shift+alt+x");
    expect(normalizeBinding("mod+shift+alt+f8")).toBe("mod+shift+alt+f8");
    expect(normalizeBinding("ctrl+s")).toBe("mod+s");
    expect(normalizeBinding("meta+shift+p")).toBe("mod+shift+p");
    expect(normalizeBinding("F8")).toBe("f8");
    expect(normalizeBinding("mod+\\")).toBe("mod+\\");
    expect(normalizeBinding("mod+tab")).toBe("mod+tab");
  });

  it("deduplicates repeated modifiers", () => {
    expect(normalizeBinding("shift+shift+mod+a")).toBe("mod+shift+a");
  });
});
