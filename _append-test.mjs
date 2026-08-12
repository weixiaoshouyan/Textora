import fs from "node:fs";
const path = "src/test/useAppStore.test.ts";
let s = fs.readFileSync(path, "utf8");
const nl = s.includes("\r\n") ? "\r\n" : "\n";

// 1) import 行加 afterEach / vi
s = s.replace(
  'import { describe, it, expect, beforeEach } from "vitest";',
  'import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";',
);

// 2) 在最后一个顶层 "});" 之前插入新 describe 块
const block = [
  '',
  '  describe("session restore（reload 未保存修改恢复）", () => {',
  '    afterEach(() => {',
  '      localStorage.removeItem("textora.session");',
  '      localStorage.removeItem("textora.workspace");',
  '    });',
  '',
  '    function mockOpenFile() {',
  '      (window.textora.invoke as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({',
  '        path: "C:/work/doc.md",',
  '        name: "doc.md",',
  '        kind: "markdown",',
  '        language: "markdown",',
  '        text: "disk content",',
  '        encoding: "utf-8",',
  '        line_ending: "lf",',
  '        size: 12,',
  '      });',
  '    }',
  '',
  '    it("有 dirtyTabs 时恢复为 dirty=true 且使用缓存内容", async () => {',
  '      localStorage.setItem(',
  '        "textora.session",',
  '        JSON.stringify({',
  '          tabs: [{ path: "C:/work/doc.md" }],',
  '          activePath: "C:/work/doc.md",',
  '          dirtyTabs: [',
  '            { path: "C:/work/doc.md", content: "unsaved edits", encoding: "utf-8", lineEnding: "lf" },',
  '          ],',
  '        }),',
  '      );',
  '      mockOpenFile();',
  '',
  '      await useAppStore.getState().init();',
  '',
  '      const state = useAppStore.getState();',
  '      expect(state.tabs).toHaveLength(1);',
  '      expect(state.tabs[0].content).toBe("unsaved edits");',
  '      expect(state.tabs[0].dirty).toBe(true);',
  '      expect(state.activeTabId).toBe(state.tabs[0].id);',
  '      // 恢复完成后回写 session，清除 dirtyTabs，避免下次重复恢复',
  '      const written = JSON.parse(localStorage.getItem("textora.session")!) as { dirtyTabs?: unknown };',
  '      expect(written.dirtyTabs).toBeUndefined();',
  '    });',
  '',
  '    it("无 dirtyTabs 时从磁盘恢复为干净标签", async () => {',
  '      localStorage.setItem(',
  '        "textora.session",',
  '        JSON.stringify({ tabs: [{ path: "C:/work/doc.md" }], activePath: "C:/work/doc.md" }),',
  '      );',
  '      mockOpenFile();',
  '',
  '      await useAppStore.getState().init();',
  '',
  '      const state = useAppStore.getState();',
  '      expect(state.tabs).toHaveLength(1);',
  '      expect(state.tabs[0].content).toBe("disk content");',
  '      expect(state.tabs[0].dirty).toBe(false);',
  '    });',
  '  });',
].join(nl);

const idx = s.lastIndexOf("});");
if (idx === -1) throw new Error("tail marker not found");
s = s.slice(0, idx) + "});" + nl + block + nl + s.slice(idx + 3);

fs.writeFileSync(path, s);
console.log("done");
