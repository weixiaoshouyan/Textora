import { beforeEach, describe, expect, it, vi } from "vitest";
import { isValidSessionPath, useAppStore } from "../store/useAppStore";
import type { Tab } from "../store/types";

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function seedDirtyTab(id: string, path: string, content: string): void {
  const tab: Tab = {
    id,
    path,
    name: path.split(/[\\/]/).pop() || path,
    kind: "markdown",
    language: "markdown",
    content,
    encoding: "utf-8",
    lineEnding: "lf",
    dirty: true,
    revision: 1,
  };
  useAppStore.setState({
    tabs: [tab],
    activeTabId: id,
    currentPath: path,
    currentName: tab.name,
    content,
    dirty: true,
    editing: true,
  });
}

describe("version-aware autosave", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useAppStore.setState({
      tabs: [],
      activeTabId: null,
      currentPath: null,
      currentName: "Untitled",
      content: "",
      dirty: false,
      editing: false,
      autoSaveTimer: null,
    });
  });

  it("does not clear dirty after an older save finishes", async () => {
    const write = deferred<null>();
    const invoke = vi.spyOn(window.textora, "invoke").mockImplementation((cmd: string) => {
      if (cmd === "write_file") return write.promise;
      return Promise.resolve(null);
    });
    seedDirtyTab("a", "C:/workspace/a.md", "v1");

    const savePromise = useAppStore.getState().saveTab("a");
    useAppStore.getState().setContent("v2");
    write.resolve(null);
    await savePromise;

    expect(invoke).toHaveBeenCalledWith(
      "write_file",
      "C:/workspace/a.md",
      "v1",
      "utf-8",
      "lf"
    );
    expect(useAppStore.getState().tabs[0].dirty).toBe(true);
  });

  it("keeps a tab dirty when its write fails", async () => {
    const error = new Error("disk full");
    vi.spyOn(window.textora, "invoke").mockRejectedValue(error);
    seedDirtyTab("a", "C:/workspace/a.md", "v1");

    await expect(useAppStore.getState().saveTab("a")).rejects.toThrow("disk full");

    expect(useAppStore.getState().tabs[0].dirty).toBe(true);
  });

  it("reuses the in-flight save on reentry instead of discarding it", async () => {
    const write = deferred<null>();
    const invoke = vi.spyOn(window.textora, "invoke").mockImplementation((cmd: string) => {
      if (cmd === "write_file") return write.promise;
      return Promise.resolve(null);
    });
    // spyOn 会继承底层 mock 的历史调用记录（vitest 行为），先清空
    invoke.mockClear();
    seedDirtyTab("a", "C:/workspace/a.md", "v1");

    const first = useAppStore.getState().saveTab("a");
    // 写盘挂起期间再次保存：应复用 in-flight 保存，不触发第二次写盘
    const second = useAppStore.getState().saveTab("a");

    write.resolve(null);
    await first;
    await second;

    expect(invoke).toHaveBeenCalledTimes(1);
    expect(useAppStore.getState().tabs[0].dirty).toBe(false);
  });

  it("re-saves latest content after reentry when edits happened during in-flight write", async () => {
    // 回归：自动保存在途（v1 快照）时用户继续输入（v2），随后关闭标签/关窗保存
    // 复用旧快照会只写 v1 就放行关闭，v2 未落盘即丢失。修复后必须补写最新内容。
    const writes: string[] = [];
    const releaseFirst = deferred<void>();
    const invoke = vi.spyOn(window.textora, "invoke").mockImplementation((cmd: string, ...args: any[]) => {
      if (cmd === "write_file") {
        writes.push(args[1] as string);
        if (writes.length === 1) return releaseFirst.promise.then(() => null);
        return Promise.resolve(null);
      }
      return Promise.resolve(null);
    });
    invoke.mockClear();
    seedDirtyTab("a", "C:/workspace/a.md", "v1");

    const first = useAppStore.getState().saveTab("a");
    // 在途写盘挂起期间用户继续编辑（revision 增加、内容变 v2）
    useAppStore.getState().setContent("v2");
    const second = useAppStore.getState().saveTab("a");
    releaseFirst.resolve();
    await first;
    await second;

    expect(writes).toEqual(["v1", "v2"]);
    expect(useAppStore.getState().tabs[0].dirty).toBe(false);
  });

  it("rejects persisted session paths outside the workspace", () => {
    expect(isValidSessionPath("C:/other/secret.md", "C:/workspace")).toBe(false);
    expect(isValidSessionPath("C:/workspace/docs/note.md", "C:/workspace")).toBe(true);
    expect(isValidSessionPath("C:/workspace/app.asar/secret.md", "C:/workspace")).toBe(false);
  });
});
