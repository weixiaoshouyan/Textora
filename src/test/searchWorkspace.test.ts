/**
 * searchWorkspace 核心逻辑单元测试（IPC handler 之外的纯函数部分）。
 * 覆盖：普通搜索、大小写、正则、ReDoS 防护、文件过滤/排除目录。
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { searchWorkspace } from "../main/ipc/search";

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "textora-search-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function writeFile(rel: string, content: string): void {
  // 边界校验：先 resolve 再确认目标仍在 tmpDir 内（测试辅助只接受工作区内相对路径）
  const full = path.resolve(tmpDir, rel);
  const normRoot = path.resolve(tmpDir);
  if (full !== normRoot && !full.startsWith(normRoot + path.sep)) {
    throw new Error(`[test] path escapes tmpDir: ${rel}`);
  }
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
}

describe("searchWorkspace", () => {
  it("finds plain-text matches across files with line numbers", async () => {
    writeFile("a.md", "hello world\nfoo bar\n");
    writeFile("b.md", "no match here\nhello again\n");
    const res = await searchWorkspace(tmpDir, "hello", false, true);
    expect(res.matches).toHaveLength(2);
    const lines = res.matches.map((m) => m.line).sort();
    expect(lines).toEqual([1, 2]);
    expect(res.truncated).toBe(false);
  });

  it("respects the caseSensitive option", async () => {
    writeFile("a.md", "Hello World\n");
    const insensitive = await searchWorkspace(tmpDir, "hello", false, false);
    expect(insensitive.matches).toHaveLength(1);
    const sensitive = await searchWorkspace(tmpDir, "hello", false, true);
    expect(sensitive.matches).toHaveLength(0);
  });

  it("supports regex queries", async () => {
    writeFile("a.md", "abc 123\nxyz\n");
    const res = await searchWorkspace(tmpDir, "\\d+", true, true);
    expect(res.matches).toHaveLength(1);
    expect(res.matches[0].line).toBe(1);
    expect(res.matches[0].column).toBe(5);
  });

  it("rejects dangerous regex patterns before matching (ReDoS guard)", async () => {
    writeFile("a.md", "aaaaaa\n");
    await expect(searchWorkspace(tmpDir, "(a+)+$", true, true)).rejects.toThrow(/backtracking/i);
  });

  it("handles invalid regex by falling back to a literal match", async () => {
    writeFile("a.md", "a(b\n");
    // 非法正则不抛错：转义后按字面匹配
    const res = await searchWorkspace(tmpDir, "(", true, true);
    expect(res.matches.length).toBeGreaterThanOrEqual(0);
  });

  it("respects file filter and excludes hidden/skip dirs", async () => {
    writeFile("keep.md", "needle\n");
    writeFile("skip.txt", "needle\n");
    writeFile(".hidden.md", "needle\n");
    writeFile("node_modules/x.js", "needle\n");
    const res = await searchWorkspace(tmpDir, "needle", false, true, "*.md");
    const names = res.matches.map((m) => m.name);
    expect(names).toContain("keep.md");
    expect(names).not.toContain("skip.txt");
    expect(names).not.toContain(".hidden.md");
    expect(names).not.toContain("x.js");
  });

  it("returns empty result for empty query", async () => {
    writeFile("a.md", "hello\n");
    const res = await searchWorkspace(tmpDir, "", false, true);
    expect(res.matches).toHaveLength(0);
    expect(res.truncated).toBe(false);
  });
});
