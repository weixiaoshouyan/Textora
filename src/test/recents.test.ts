/**
 * 最近打开文件记录测试
 */
import { describe, expect, it, beforeEach } from "vitest";
import { addRecent, readRecents, MAX_RECENTS, RECENTS_KEY } from "../store/recents";

describe("recents", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("returns empty list when nothing stored", () => {
    expect(readRecents()).toEqual([]);
  });

  it("adds a file and moves it to front", () => {
    addRecent("C:/a.md", "a.md");
    addRecent("C:/b.md", "b.md");
    const recents = readRecents();
    expect(recents.map((r) => r.path)).toEqual(["C:/b.md", "C:/a.md"]);
  });

  it("deduplicates the same path (case-insensitive, separator-insensitive)", () => {
    addRecent("C:/docs/a.md", "a.md");
    addRecent("C:\\docs\\a.md", "a.md");
    expect(readRecents()).toHaveLength(1);
  });

  it("caps the list at MAX_RECENTS", () => {
    for (let i = 0; i < MAX_RECENTS + 5; i++) {
      addRecent(`C:/f${i}.md`, `f${i}.md`);
    }
    const recents = readRecents();
    expect(recents.length).toBe(MAX_RECENTS);
    // 最旧的条目被挤掉
    expect(recents.some((r) => r.path === "C:/f0.md")).toBe(false);
  });

  it("ignores corrupted or invalid persisted data", () => {
    localStorage.setItem(RECENTS_KEY, JSON.stringify([
      { path: "C:/ok.md", name: "ok.md", openedAt: 1 },
      { path: "app.asar/internal", name: "bad", openedAt: 1 },
      { path: 42, name: "bad2", openedAt: 1 },
      { path: "C:/missing-name.md", openedAt: 1 },
      "garbage",
    ]));
    const recents = readRecents();
    expect(recents).toHaveLength(1);
    expect(recents[0].path).toBe("C:/ok.md");
  });

  it("falls back to empty on unparseable JSON", () => {
    localStorage.setItem(RECENTS_KEY, "{not json");
    expect(readRecents()).toEqual([]);
  });
});
