/**
 * useClickOutside — smoke + source-visibility test
 *
 * We don't have @testing-library/react in this project, so the test
 * verifies:
 *  - the module exports useClickOutside
 *  - the function has the expected arity (3)
 *  - the source wires a capture-phase mousedown listener with rAF
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

describe("useClickOutside", () => {
  it("module source defines useClickOutside", async () => {
    const mod = await import("../hooks/useClickOutside");
    expect(typeof mod.useClickOutside).toBe("function");
  });

  it("hook has arity 3 (ref, active, onOutside)", async () => {
    const mod = await import("../hooks/useClickOutside");
    expect(mod.useClickOutside.length).toBe(3);
  });

  it("source uses capture-phase mousedown listener", () => {
    const src = readFileSync(
      join(__dirname, "../hooks/useClickOutside.ts"),
      "utf-8"
    );
    expect(src).toContain('"mousedown"');
    expect(src).toContain("capture: true");
    expect(src).toContain("requestAnimationFrame");
  });

  it("callback target guard uses Node.contains", () => {
    const src = readFileSync(
      join(__dirname, "../hooks/useClickOutside.ts"),
      "utf-8"
    );
    expect(src).toContain("contains");
  });

  it("cleanup removes the listener", () => {
    const src = readFileSync(
      join(__dirname, "../hooks/useClickOutside.ts"),
      "utf-8"
    );
    expect(src).toContain("removeEventListener");
  });
});
