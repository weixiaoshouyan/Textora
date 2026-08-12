/**
 * useAppStore 核心逻辑单元测试
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { useAppStore, getActiveTab } from "../store/useAppStore";

describe("useAppStore", () => {
  beforeEach(() => {
    // 重置 store 状态
    useAppStore.setState({
      tabs: [],
      activeTabId: null,
      currentPath: null,
      currentName: "未命名",
      content: "",
      dirty: false,
      editing: false,
    });
  });

  describe("newFile", () => {
    it("应创建一个空白 markdown 标签", () => {
      useAppStore.getState().newFile();
      const state = useAppStore.getState();
      expect(state.tabs).toHaveLength(1);
      expect(state.tabs[0].kind).toBe("markdown");
      expect(state.tabs[0].path).toBeNull();
      expect(state.tabs[0].dirty).toBe(false);
      expect(state.activeTabId).toBe(state.tabs[0].id);
      expect(state.editing).toBe(true);
    });

    it("连续新建应创建多个标签", () => {
      useAppStore.getState().newFile();
      useAppStore.getState().newFile();
      expect(useAppStore.getState().tabs).toHaveLength(2);
    });
  });

  describe("setContent", () => {
    it("应更新活动标签内容并标记 dirty", () => {
      useAppStore.getState().newFile();
      useAppStore.getState().setContent("# Hello");
      const state = useAppStore.getState();
      expect(state.content).toBe("# Hello");
      expect(state.dirty).toBe(true);
      expect(state.tabs[0].content).toBe("# Hello");
      expect(state.tabs[0].dirty).toBe(true);
    });

    it("无活动标签时不应报错", () => {
      expect(() => useAppStore.getState().setContent("test")).not.toThrow();
    });
  });

  describe("closeTab", () => {
    it("关闭干净标签应直接移除", () => {
      useAppStore.getState().newFile();
      const id = useAppStore.getState().tabs[0].id;
      useAppStore.getState().closeTab(id);
      expect(useAppStore.getState().tabs).toHaveLength(0);
      expect(useAppStore.getState().editing).toBe(false);
    });

    it("关闭 dirty 标签应弹出确认", () => {
      useAppStore.getState().newFile();
      useAppStore.getState().setContent("modified");
      const id = useAppStore.getState().tabs[0].id;
      useAppStore.getState().closeTab(id);
      // 应弹出确认框，标签未移除
      expect(useAppStore.getState().pendingConfirm).not.toBeNull();
      expect(useAppStore.getState().tabs).toHaveLength(1);
    });
  });

  describe("setActiveTab", () => {
    it("切换标签应同步镜像字段", () => {
      useAppStore.getState().newFile();
      useAppStore.getState().setContent("tab1 content");
      const tab1Id = useAppStore.getState().tabs[0].id;

      useAppStore.getState().newFile();
      useAppStore.getState().setContent("tab2 content");
      const tab2Id = useAppStore.getState().tabs[1].id;

      // 切换回 tab1
      useAppStore.getState().setActiveTab(tab1Id);
      expect(useAppStore.getState().content).toBe("tab1 content");
      expect(useAppStore.getState().activeTabId).toBe(tab1Id);

      // 切换到 tab2
      useAppStore.getState().setActiveTab(tab2Id);
      expect(useAppStore.getState().content).toBe("tab2 content");
    });
  });

  describe("reorderTabs", () => {
    it("应正确重排标签顺序", () => {
      useAppStore.getState().newFile();
      useAppStore.getState().newFile();
      useAppStore.getState().newFile();
      const tabs = useAppStore.getState().tabs;
      const [first, second, third] = tabs;

      // 把第一个移到最后
      useAppStore.getState().reorderTabs(first.id, third.id);
      const reordered = useAppStore.getState().tabs;
      expect(reordered[0].id).toBe(second.id);
      expect(reordered[2].id).toBe(first.id);
    });
  });

  describe("theme", () => {
    it("toggleTheme 应循环切换主题", () => {
      useAppStore.setState({ theme: "light" });
      useAppStore.getState().toggleTheme();
      expect(useAppStore.getState().theme).toBe("dark");
      useAppStore.getState().toggleTheme();
      expect(useAppStore.getState().theme).toBe("sepia");
      useAppStore.getState().toggleTheme();
      expect(useAppStore.getState().theme).toBe("nord");
      useAppStore.getState().toggleTheme();
      expect(useAppStore.getState().theme).toBe("light");
    });
  });

  describe("settings", () => {
    it("updateSettings 应合并设置", () => {
      const original = useAppStore.getState().settings;
      useAppStore.getState().updateSettings({ fontSize: 20 });
      expect(useAppStore.getState().settings.fontSize).toBe(20);
      expect(useAppStore.getState().settings.fontFamily).toBe(original.fontFamily);
    });

    it("toggleFocus 应切换专注模式", () => {
      expect(useAppStore.getState().settings.focusMode).toBe(false);
      useAppStore.getState().toggleFocus();
      expect(useAppStore.getState().settings.focusMode).toBe(true);
      useAppStore.getState().toggleFocus();
      expect(useAppStore.getState().settings.focusMode).toBe(false);
    });
  });

  describe("getActiveTab", () => {
    it("无活动标签时返回 null", () => {
      expect(getActiveTab(useAppStore.getState())).toBeNull();
    });

    it("有活动标签时返回对应 Tab", () => {
      useAppStore.getState().newFile();
      const tab = getActiveTab(useAppStore.getState());
      expect(tab).not.toBeNull();
      expect(tab!.kind).toBe("markdown");
    });
  });

  describe("closeAllTabs closeFlow（关窗确认链回归）", () => {
    it("有脏标签时确认链期间 closeFlow 保持 closing，onCancel 后恢复 idle", () => {
      useAppStore.getState().newFile();
      useAppStore.getState().setContent("dirty content");
      useAppStore.getState().closeAllTabs();
      // 确认链开始：进入 closing
      expect(useAppStore.getState().closeFlow).toBe("closing");
      expect(useAppStore.getState().pendingConfirm).not.toBeNull();
      // 用户取消：恢复 idle，标签保留
      useAppStore.getState().pendingConfirm!.onCancel();
      expect(useAppStore.getState().closeFlow).toBe("idle");
      expect(useAppStore.getState().pendingConfirm).toBeNull();
      expect(useAppStore.getState().tabs).toHaveLength(1);
    });

    it("多标签 onDiscard 继续确认链：处理第一个标签后 closeFlow 仍为 closing", () => {
      useAppStore.getState().newFile();
      useAppStore.getState().setContent("dirty 1");
      useAppStore.getState().newFile();
      useAppStore.getState().setContent("dirty 2");
      const secondId = useAppStore.getState().tabs[1].id;
      useAppStore.getState().closeAllTabs();
      const p = useAppStore.getState().pendingConfirm!;
      p.onDiscard();
      // 处理完第一个标签后链继续：closeFlow 必须仍为 closing（unsubCancel 不触发），
      // 且确认框指向第二个标签；标签在链末统一清空
      expect(useAppStore.getState().closeFlow).toBe("closing");
      expect(useAppStore.getState().pendingConfirm).not.toBeNull();
      expect(useAppStore.getState().tabs).toHaveLength(2);
      // 处理完最后一个标签：链完成，清空并恢复 idle
      useAppStore.getState().pendingConfirm!.onDiscard();
      expect(useAppStore.getState().tabs).toHaveLength(0);
      expect(useAppStore.getState().closeFlow).toBe("idle");
      expect(secondId).toBeTruthy();
    });

    it("无脏标签时直接清空且不进入 closing", () => {
      useAppStore.getState().newFile();
      useAppStore.getState().closeAllTabs();
      expect(useAppStore.getState().tabs).toHaveLength(0);
      expect(useAppStore.getState().closeFlow).toBe("idle");
    });
  });
});

  describe("session restore（reload 未保存修改恢复）", () => {
    afterEach(() => {
      localStorage.removeItem("textora.session");
      localStorage.removeItem("textora.workspace");
    });

    function mockOpenFile() {
      (window.textora.invoke as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
        path: "C:/work/doc.md",
        name: "doc.md",
        kind: "markdown",
        language: "markdown",
        text: "disk content",
        encoding: "utf-8",
        line_ending: "lf",
        size: 12,
      });
    }

    it("有 dirtyTabs 时恢复为 dirty=true 且使用缓存内容", async () => {
      localStorage.setItem(
        "textora.session",
        JSON.stringify({
          tabs: [{ path: "C:/work/doc.md" }],
          activePath: "C:/work/doc.md",
          dirtyTabs: [
            { path: "C:/work/doc.md", content: "unsaved edits", encoding: "utf-8", lineEnding: "lf" },
          ],
        }),
      );
      mockOpenFile();

      await useAppStore.getState().init();

      const state = useAppStore.getState();
      expect(state.tabs).toHaveLength(1);
      expect(state.tabs[0].content).toBe("unsaved edits");
      expect(state.tabs[0].dirty).toBe(true);
      expect(state.activeTabId).toBe(state.tabs[0].id);
      // 恢复完成后回写 session，清除 dirtyTabs，避免下次重复恢复
      const written = JSON.parse(localStorage.getItem("textora.session")!) as { dirtyTabs?: unknown };
      expect(written.dirtyTabs).toBeUndefined();
    });

    it("无 dirtyTabs 时从磁盘恢复为干净标签", async () => {
      localStorage.setItem(
        "textora.session",
        JSON.stringify({ tabs: [{ path: "C:/work/doc.md" }], activePath: "C:/work/doc.md" }),
      );
      mockOpenFile();

      await useAppStore.getState().init();

      const state = useAppStore.getState();
      expect(state.tabs).toHaveLength(1);
      expect(state.tabs[0].content).toBe("disk content");
      expect(state.tabs[0].dirty).toBe(false);
    });
  });
