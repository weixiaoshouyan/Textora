import { describe, expect, it } from "vitest";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { vi as vitest } from "vitest";

import { codeToHtmlSafe, LARGE_FILE_THRESHOLD } from "../plugins/shikiClient";

const { getHighlighterMock } = vitest.hoisted(() => ({
  getHighlighterMock: vitest.fn(() => {
    throw new Error("Shiki should not initialize for large files");
  }),
}));

vitest.mock("shiki", () => ({
  getHighlighter: getHighlighterMock,
  codeToHtml: vitest.fn(),
}));

describe("performance guards", () => {
  it("uses escaped plain text for large files without initializing Shiki", async () => {
    const source = "<tag> & text";

    const html = await codeToHtmlSafe(source, "typescript", { largeFile: true });

    expect(html).toContain("textora-shiki-code");
    expect(html).toContain("&lt;tag&gt; &amp; text");
    expect(getHighlighterMock).not.toHaveBeenCalled();
    expect(LARGE_FILE_THRESHOLD).toBeGreaterThanOrEqual(10 * 1024 * 1024);
  });

  it("stops workspace search when file and byte budgets are reached", async () => {
    const root = await mkdtemp(join(tmpdir(), "textora-search-"));
    await mkdir(join(root, "nested"));
    await writeFile(join(root, "one.md"), "needle\n".repeat(4), "utf8");
    await writeFile(join(root, "nested", "two.md"), "needle\n".repeat(4), "utf8");

    const shared = await import("../main/shared");
    shared.setWorkspaceRoot(root);
    const searchModule = await import("../main/ipc/search");
    expect(searchModule.searchWorkspace).toEqual(expect.any(Function));
    if (typeof searchModule.searchWorkspace !== "function") return;

    const response = await searchModule.searchWorkspace(root, "needle", false, false, undefined, undefined, {
      maxFilesScanned: 1,
      maxTotalBytesScanned: 20,
    });

    expect(response.truncated).toBe(true);
    expect(response.matches.length).toBeLessThanOrEqual(4);
  });
});
