# Textora Comprehensive Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在保持现有功能与快捷键兼容的前提下，按风险优先顺序强化 Textora 的文件安全、异步可靠性、启动性能、编辑器体验和工程质量。

**Architecture:** 保留现有 Electron preload + IPC、React/Zustand、Milkdown/CodeEditor 结构。将跨模块规则集中到 `src/main/shared.ts` 的纯校验函数；主进程 handler 只负责参数编排和 I/O；渲染层通过版本快照管理异步保存，并用现有 Zustand 状态接口保持兼容。每个阶段先写纯函数/组件测试，再接入 Electron 边界。

**Tech Stack:** Electron 35, React 18, TypeScript 5.9, Zustand 5, Milkdown 7, Vite 5, Vitest 2, Playwright。

---

## 变更文件地图

- `src/main/shared.ts`: 工作区路径、符号链接、字节上限和结构化错误的纯函数。
- `src/main/ipc/files.ts`: 所有文件读写、监听、工作区设置调用统一校验。
- `src/main/ipc/tools.ts`: 外部命令 cwd、参数、超时和进程结束保护。
- `src/main/ipc/export.ts`, `src/editor/exporter.ts`: 导出目标和 HTML 清理。
- `src/main/ipc/dialogs.ts`, `src/main/ipc/window.ts`, `src/main/index.ts`: 对话框路径、关闭状态和生产环境行为。
- `src/store/useAppStore.ts`, `src/hooks/useAutoSave.ts`, `src/hooks/useWindowClose.ts`: 保存版本、监听刷新和关闭状态机。
- `src/plugins/shikiClient.ts`, `src/editor/CodeEditor.tsx`, `src/main/ipc/search.ts`: 首屏与大文件策略。
- `src/ui/*.tsx`, `src/ui/SplitView.tsx`, `src/index.css`: 无障碍、只读分屏和状态反馈。
- `src/ipc.ts`, `src/ipcTypes.ts`, `src/preload.ts`: IPC 参数和返回类型收紧。
- `src/test/*.test.ts(x)`, `tests/e2e/*`: 回归与冒烟测试。
- `README.md`, `docs/*`: 编码、失效引用和验证命令。

## Task 1: 建立安全边界纯函数与测试夹具

**Files:**
- Modify: `src/main/shared.ts`
- Test: `src/test/shared.test.ts`

- [ ] **Step 1: 写失败测试**

在 `src/test/shared.test.ts` 增加以下行为测试：工作区根目录自身允许、根目录外拒绝、大小写不同的 Windows 路径仍按不区分大小写处理、`..` 和符号链接目标外移拒绝、允许不存在的输出文件但要求其父目录在工作区内、超过字节上限返回结构化错误。

测试文件顶部新增 `mkdtemp`, `join`, `tmpdir`, `writeFile`, `symlink` 的 `node:fs/promises`/`node:path` 导入，并用模块级 `workspaceRootForTest` 包装共享模块的 `setWorkspaceRoot`；`setWorkspaceRootForTest` 只是测试夹具名称，不新增生产 API。

```ts
it("允许工作区内的新输出文件", async () => {
  const root = await mkdtemp(join(tmpdir(), "textora-root-"));
  setWorkspaceRootForTest(root);
  await expect(validateWorkspacePath(join(root, "notes", "new.md"), { allowMissingLeaf: true })).resolves.toMatchObject({ ok: true });
});

it("拒绝通过符号链接离开工作区的已有文件", async () => {
  const root = await mkdtemp(join(tmpdir(), "textora-root-"));
  const outside = await mkdtemp(join(tmpdir(), "textora-outside-"));
  await writeFile(join(outside, "secret.md"), "secret");
  await symlink(outside, join(root, "linked"), "junction");
  setWorkspaceRootForTest(root);
  await expect(validateWorkspacePath(join(root, "linked", "secret.md"))).resolves.toMatchObject({ ok: false, code: "WORKSPACE_ESCAPE" });
});
```

- [ ] **Step 2: 运行测试确认失败**

运行 `npm test -- --run src/test/shared.test.ts`。预期新增测试因 `validateWorkspacePath` 和结构化错误尚未存在而失败，现有测试继续通过。

- [ ] **Step 3: 实现最小校验 API**

在 `src/main/shared.ts` 增加以下接口并让现有 `ensureWithinWorkspace` 委托它：

```ts
export type WorkspaceErrorCode = "INVALID_PATH" | "WORKSPACE_NOT_SET" | "WORKSPACE_ESCAPE" | "SYMLINK_ESCAPE" | "NOT_DIRECTORY" | "SIZE_LIMIT";
export interface WorkspaceCheck { ok: true; resolved: string } | { ok: false; code: WorkspaceErrorCode; message: string };
export interface WorkspacePathOptions { allowMissingLeaf?: boolean }
export async function validateWorkspacePath(input: string, options?: WorkspacePathOptions): Promise<WorkspaceCheck>;
export function assertWorkspaceSize(byteLength: number, limit: number, label: string): void;
export function createIpcError(code: WorkspaceErrorCode | "INVALID_ARGUMENT", message: string): Error & { code: string };
```

Use `path.resolve`, reject path segments equal to `..`, compare Windows paths case-insensitively, resolve existing ancestors with `realpath`, and when `allowMissingLeaf` is true validate the nearest existing parent. Do not read or write files inside these helpers.

- [ ] **Step 4: 运行测试确认通过**

运行 `npm test -- --run src/test/shared.test.ts`; 预期全部通过。

- [ ] **Step 5: 提交**

```bash
git add src/main/shared.ts src/test/shared.test.ts
git commit -m "test: define workspace security boundary"
```

## Task 2: 接入文件 IPC 的路径和大小限制

**Files:**
- Modify: `src/main/ipc/files.ts`
- Modify: `src/main/ipc/dialogs.ts`
- Modify: `src/ipcTypes.ts`
- Test: `src/test/shared.test.ts`, create `src/test/fileSecurity.test.ts`

- [ ] **Step 1: 写失败测试**

覆盖 `is_directory` 越界、`set_workspace_root` 非目录、图片超过 `IMAGE_MAX_SIZE`、二进制写入超过 `BINARY_MAX_SIZE`、文本写入超过 `TEXT_MAX_SIZE`、保存对话框返回工作区外路径被拒绝。

```ts
it("is_directory 不允许绕过工作区", async () => {
  const result = await invokeRegistered("textora:is_directory", outsidePath);
  expect(result).toMatchObject({ ok: false, code: "WORKSPACE_ESCAPE" });
});

it("写入超限文本返回 SIZE_LIMIT", async () => {
  await expect(invokeRegistered("textora:write_text_file", filePath, "x".repeat(TEXT_MAX_SIZE + 1)))
    .rejects.toMatchObject({ code: "SIZE_LIMIT" });
});
```

- [ ] **Step 2: 运行测试确认失败**

运行 `npm test -- --run src/test/fileSecurity.test.ts`; 预期失败，因为当前 handler 返回 boolean 或直接执行 I/O。

- [ ] **Step 3: 实现 handler 保护**

在 `src/main/ipc/files.ts` 中：

1. `set_workspace_root` 使用 `validateWorkspacePath`，要求目标存在且是目录，再调用 `setWorkspaceRoot`。
2. `is_directory` 使用同一校验，不再允许任意绝对路径探测。
3. 所有已有 `ensureWithinWorkspace` 调用升级为异步校验；创建/重命名/保存/导出路径使用 `allowMissingLeaf: true`。
4. `open_file` 在 `stat` 前先检查文件大小；图片、未知二进制和文本分别使用对应上限。
5. `read_binary_file`、`write_binary_file`、`save_base64_file` 检查字节长度，`write_file` 检查 UTF-8/目标编码后的 buffer 长度。
6. 每个拒绝均抛出带 `code` 的错误，保持 Promise reject 兼容，不把错误吞成空结果。

使用 `Buffer.byteLength(text, "utf8")`，不要用 JavaScript 字符串长度代替字节长度。

- [ ] **Step 4: 补充 IPC 类型**

在 `src/ipcTypes.ts` 为文件命令增加 `IpcError` 类型和稳定 result 类型；在 `src/ipc.ts` 将未知错误转换为 `Error`，保留 `code` 字段供 UI 显示。

- [ ] **Step 5: 运行测试和类型检查**

运行 `npm test -- --run src/test/fileSecurity.test.ts src/test/shared.test.ts` 与 `npx tsc -p tsconfig.main.json --noEmit`；预期通过。

- [ ] **Step 6: 提交**

```bash
git add src/main/shared.ts src/main/ipc/files.ts src/main/ipc/dialogs.ts src/ipc.ts src/ipcTypes.ts src/test/fileSecurity.test.ts src/test/shared.test.ts
git commit -m "fix: enforce workspace and file size limits"
```

## Task 3: 收紧外部命令、URL 和导出边界

**Files:**
- Modify: `src/main/ipc/tools.ts`
- Modify: `src/main/ipc/export.ts`
- Modify: `src/ai/aiTools.ts`
- Modify: `src/editor/exporter.ts`
- Test: create `src/test/toolsSecurity.test.ts`, create `src/test/exportSanitizer.test.ts`

- [ ] **Step 1: 写失败测试**

测试模型传入工作区外 `cwd` 被忽略/拒绝、空命令和危险命令被阻止、同一进程的 `close`/`error`/timeout 只 resolve 一次、导出目标越界被拒绝、HTML 中的 `onerror`、`javascript:`、`iframe` 和 SVG 脚本被移除。

测试文件通过导出的 `validateToolRequest`、`runToolForTest` 和 `sanitizeHtml` 调用纯逻辑；`runToolForTest` 是对 handler 使用的 spawn 工厂的测试注入包装，`sanitizeHtml` 从 `src/editor/exporter.ts` 显式导出，生产调用路径不变。

```ts
it("run_tool 不允许模型指定工作区外 cwd", async () => {
  const result = await runTool({ command: process.execPath, args: ["-e", "process.stdout.write(process.cwd())"], cwd: outsidePath }, { DIR: workspaceRoot });
  expect(result.exitCode).toBe(0);
  expect(normalizePath(result.stdout.trim())).toBe(normalizePath(workspaceRoot));
});

it("sanitizeHtml 删除危险属性和元素", () => {
  expect(sanitizeHtml('<img src="x" onerror="alert(1)"><iframe src="https://evil.test"></iframe><a href="javascript:alert(1)">x</a>'))
    .not.toMatch(/onerror|iframe|javascript:/i);
});
```

- [ ] **Step 2: 运行测试确认失败**

运行 `npm test -- --run src/test/toolsSecurity.test.ts src/test/exportSanitizer.test.ts`；预期当前实现至少在 cwd 和危险属性用例失败。

- [ ] **Step 3: 实现命令安全策略**

在 `src/main/ipc/tools.ts` 导出纯函数 `validateToolRequest`，要求命令为非空字符串、参数为字符串数组，`cwd` 只能是当前工作区或其子目录。handler 使用依赖注入的 `workspaceRoot`，忽略 `tool.cwd` 越界输入。将 `finish` 增加 `finished` 布尔值，`close`、`error`、timeout 只能第一次完成 Promise；timeout 后先终止，再在 5 秒后强制杀死，不重复返回结果。

在 `src/ai/aiTools.ts` 将 `run_command` 的 `cwd` 始终设置为传入的 `workspaceRoot`，命令仍拆分为结构化 `command` + `args`。

- [ ] **Step 4: 实现 URL 和导出保护**

导出 handler 对 target path 使用 `validateWorkspacePath(..., { allowMissingLeaf: true })`；`exporter.ts` 导出并测试 `sanitizeHtml`。优先使用现有 DOMParser（浏览器端），删除危险元素、事件属性、危险 URL 协议，并只允许 `http/https`, `data:image/*`, 相对图片资源。保留现有图片内联行为。

- [ ] **Step 5: 运行测试、类型检查和构建**

运行 `npm test -- --run src/test/toolsSecurity.test.ts src/test/exportSanitizer.test.ts`、`npx tsc --noEmit`、`npx tsc -p tsconfig.main.json --noEmit` 和 `npm run build`；预期全部通过，构建不得出现资源路径错误。

- [ ] **Step 6: 提交**

```bash
git add src/main/ipc/tools.ts src/main/ipc/export.ts src/ai/aiTools.ts src/editor/exporter.ts src/test/toolsSecurity.test.ts src/test/exportSanitizer.test.ts
git commit -m "fix: constrain tools and exports"
```

## Task 4: 合并自动保存并保护异步保存结果

**Files:**
- Modify: `src/store/useAppStore.ts`
- Modify: `src/hooks/useAutoSave.ts`
- Test: create `src/test/autoSave.test.ts`

- [ ] **Step 1: 写失败测试**

测试连续编辑后旧保存结果不能清除新 dirty 状态；切换 tab 后旧 timer 不得保存新 tab；保存失败必须保留 dirty 并暴露错误。

测试文件顶部提供 `deferred<T>()`、`seedDirtyTab()` 和 `mockWriteFile` 夹具；它们只操作 Zustand 测试状态和 `src/ipc.ts` mock，不进入生产代码。

```ts
it("旧保存结果不能覆盖新版本", async () => {
  const first = deferred<void>();
  mockWriteFile.mockImplementationOnce(() => first.promise);
  const tabId = seedDirtyTab("a.md", "v1");
  const savePromise = useAppStore.getState().saveTab(tabId);
  useAppStore.getState().setContent("v2");
  first.resolve();
  await savePromise;
  expect(useAppStore.getState().tabs.find(t => t.id === tabId)?.dirty).toBe(true);
});
```

- [ ] **Step 2: 运行测试确认失败**

运行 `npm test -- --run src/test/autoSave.test.ts`; 预期当前 save 逻辑会把 dirty 错误清掉或 timer 竞争。

- [ ] **Step 3: 实现单一调度器**

删除 `useAppStore` 内部的 `scheduleAutoSave`/timer 字段，`useAutoSave` 成为唯一调度器。调度器用 `Map<tabId, number>` 保存 timer；设置、活动 tab、dirty 或路径变化时只重排相关 timer，组件卸载时全部清理。

- [ ] **Step 4: 加入版本快照**

在 `Tab` 类型增加内部 `revision: number`（不写入 session），每次 `setContent` 递增。`saveTab` 开始时保存 `{ id, path, revision, content, encoding, lineEnding }`；写入完成后仅当当前 tab 的 path 和 revision 仍相同才设置 `dirty: false`。错误设置 `lastError`/返回 reject，但不丢失内容。

- [ ] **Step 5: 运行测试和类型检查**

运行 `npm test -- --run src/test/autoSave.test.ts src/test/useAppStore.test.ts` 与 `npx tsc --noEmit`；预期通过。

- [ ] **Step 6: 提交**

```bash
git add src/store/useAppStore.ts src/hooks/useAutoSave.ts src/store/types.ts src/test/autoSave.test.ts
git commit -m "fix: make autosave version aware"
```

## Task 5: 文件监听、会话恢复和窗口关闭状态机

**Files:**
- Modify: `src/main/ipc/files.ts`
- Modify: `src/store/useAppStore.ts`
- Modify: `src/hooks/useWindowClose.ts`
- Modify: `src/main/index.ts`
- Test: create `src/test/windowClose.test.ts`, extend `src/test/useAppStore.test.ts`

- [ ] **Step 1: 写失败测试**

覆盖原子写入临时文件不触发用户提示、脏 tab 外部变化只提示一次、坏 session 条目被跳过、连续两个 close request 只调用一次 `closeAllTabs` 和一次 `ready-to-close`。

测试文件通过 `emitCloseRequest()` 触发现有 preload 事件回调，并用 `storeWithDirtyTab()` 构造单个脏 tab；这两个 helper 均在测试文件内定义。

```ts
it("重复关闭请求只处理一次", async () => {
  storeWithDirtyTab();
  emitCloseRequest();
  emitCloseRequest();
  await flushPromises();
  expect(closeAllTabs).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: 运行测试确认失败**

运行 `npm test -- --run src/test/windowClose.test.ts src/test/useAppStore.test.ts`; 预期重复 close 用例失败。

- [ ] **Step 3: 过滤监听来源**

在 watcher 中忽略 `.textora-tmp-*`、当前 workspace 的内部临时目录和被跳过目录；事件 payload 增加 `source: "external" | "self"`，渲染层只对 external 事件进入刷新/提示流程。

- [ ] **Step 4: 保护恢复流程**

恢复前检查 session JSON 结构、路径存在性、工作区边界和大小；恢复失败的路径从持久化 session 中移除。恢复 tab 时保留最大数量与大小限制。

- [ ] **Step 5: 实现关闭状态机**

在 `useWindowClose.ts` 使用 `useRef<"idle" | "confirming" | "closing">`。`close-request` 只接受 idle；无脏 tab 直接进入 closing；有脏 tab 进入 confirming 并监听确认结果。所有路径只发送一次 `ready-to-close`，10 秒 fallback 通过同一幂等函数触发。主进程 `textora:ready-to-close` 和 `window-close` 同样检查 `isQuitting`。

- [ ] **Step 6: 运行测试、类型检查和提交**

运行 `npm test -- --run src/test/windowClose.test.ts src/test/useAppStore.test.ts` 与 `npx tsc -p tsconfig.main.json --noEmit`。

```bash
git add src/main/ipc/files.ts src/store/useAppStore.ts src/hooks/useWindowClose.ts src/main/index.ts src/test/windowClose.test.ts src/test/useAppStore.test.ts
git commit -m "fix: make file events and close flow idempotent"
```

## Task 6: 首屏与大文件性能保护

**Files:**
- Modify: `src/plugins/shikiClient.ts`
- Modify: `src/editor/CodeEditor.tsx`
- Modify: `src/main/ipc/search.ts`
- Modify: `src/App.tsx`, `src/ui/SplitView.tsx`
- Test: create `src/test/performanceGuards.test.ts`

- [ ] **Step 1: 写失败测试**

测试 10 MB 内容不调用高亮器、搜索扫描达到文件/字节上限后停止、SplitView 关闭时不挂载两个编辑器。

```ts
it("大文件使用纯文本回退", async () => {
  const html = await codeToHtmlSafe("x".repeat(LARGE_FILE_THRESHOLD + 1), "typescript", { largeFile: true });
  expect(html).toContain("textora-shiki-code");
  expect(mockGetHighlighter).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: 运行测试确认失败**

运行 `npm test -- --run src/test/performanceGuards.test.ts`; 预期当前 API 不支持大文件选项或搜索没有总量上限。

- [ ] **Step 3: 实现按需高亮**

让 `codeToHtmlSafe` 接收可选 `{ largeFile?: boolean }`；大文件直接返回已转义的 `<pre><code>`，普通文件保留现有 Shiki 结果。CodeEditor 根据文件大小/内容长度设置该标志，且不改变编辑和快捷键。

- [ ] **Step 4: 限制搜索与目录扫描**

在 `src/main/ipc/search.ts` 增加 `MAX_FILES_SCANNED`、`MAX_TOTAL_BYTES_SCANNED` 和 `AbortSignal`/内部取消标记；达到任一上限返回 `{ matches, truncated: true }` 的兼容扩展结果，并让 UI 显示“结果已截断”。

- [ ] **Step 5: 优化挂载与选择器**

确保 `App.tsx` 仅在 `splitViewOpen` 时渲染 `SplitView`；右侧编辑器使用只读 prop，避免创建可编辑 textarea。对输入路径使用稳定 Zustand selector，避免无关状态改变触发编辑器重建。

- [ ] **Step 6: 运行构建与提交**

运行 `npm test -- --run src/test/performanceGuards.test.ts`、`npm run build`，记录 `.audit-dist` 中首屏 chunk 和重型 vendor chunk 大小。

```bash
git add src/plugins/shikiClient.ts src/editor/CodeEditor.tsx src/main/ipc/search.ts src/App.tsx src/ui/SplitView.tsx src/test/performanceGuards.test.ts
git commit -m "perf: defer highlighting and guard large workspaces"
```

## Task 7: 无障碍、主题同步和类型收紧

**Files:**
- Modify: `src/ui/*.tsx` (仅涉及按钮、弹层、状态栏和设置面板)
- Modify: `src/ui/SplitView.tsx`, `src/index.css`
- Modify: `src/ipc.ts`, `src/ipcTypes.ts`, `src/preload.ts`, `src/ai/aiTools.ts`
- Test: extend `src/test/editorComponents.test.tsx`, create `src/test/accessibility.test.tsx`

- [ ] **Step 1: 写失败测试**

测试图标按钮有 accessible name、弹层打开后焦点进入且 Escape 返回触发点、分屏右侧没有可编辑 textarea、主题切换同步 `data-theme` 和 editor theme。

```tsx
it("分屏右侧为只读且按钮有 accessible name", () => {
  render(<SplitView />);
  expect(screen.getByRole("button", { name: /close|关闭/i })).toBeInTheDocument();
  expect(screen.queryAllByRole("textbox")).toHaveLength(1);
});
```

- [ ] **Step 2: 运行测试确认失败**

运行 `npm test -- --run src/test/accessibility.test.tsx src/test/editorComponents.test.tsx`。

- [ ] **Step 3: 实现可访问性修正**

为仅图标按钮补 `aria-label`/`title`，弹层使用现有 `useFocusTrap`，设置 `role="dialog"`、`aria-modal="true"`，状态栏使用 `role="status"`。SplitView 右侧传 `readOnly`，CodeEditor 在只读时不渲染 textarea 或设置 `readOnly` 且 `tabIndex={-1}`。

- [ ] **Step 4: 同步主题与菜单**

主题切换统一通过现有 theme store 更新 `document.documentElement[data-theme]`、Shiki/mermaid theme 和 `textora:set-locale`/menu 更新，不重复创建编辑器实例。补充过渡 CSS 和焦点可见样式，不改变主题色板。

- [ ] **Step 5: 收紧高风险 any**

先处理 `src/ipc.ts`, `src/ipcTypes.ts`, `src/preload.ts`, `src/ai/aiTools.ts` 的公开边界：命令/事件使用联合类型，工具参数使用 `Record<string, unknown>`，catch 使用 `unknown` 并用类型守卫读取 message。第三方 ProseMirror/DOM 边界保留局部断言，不做无关重构。

- [ ] **Step 6: 运行测试、类型检查和提交**

运行 `npm test -- --run src/test/accessibility.test.tsx src/test/editorComponents.test.tsx`、`npx tsc --noEmit`、`npx tsc -p tsconfig.main.json --noEmit`。

```bash
git add src/ui src/ui/SplitView.tsx src/index.css src/ipc.ts src/ipcTypes.ts src/preload.ts src/ai/aiTools.ts src/test/accessibility.test.tsx src/test/editorComponents.test.tsx
git commit -m "feat: improve editor accessibility and IPC types"
```

## Task 8: 编码清理、端到端冒烟和最终验收

**Files:**
- Modify: `README.md`
- Modify: `src/main/index.ts`, `src/main/shared.ts` (仅清理注释和生产行为)
- Create: `tests/e2e/textora.smoke.spec.ts`, `playwright.config.ts`（若仓库已有 Playwright 配置则只扩展现有文件）
- Test: 全部现有 `src/test/*`

- [ ] **Step 1: 修复文档和失效引用**

将 README 重新保存为 UTF-8，保留现有中文含义；移除已删除的 `useTauriMenu`、旧图标和不存在配置文件引用；更新开发、测试、构建命令。

- [ ] **Step 2: 添加 Playwright 冒烟**

测试启动页面非空、创建新文件、输入 Markdown、切换源码模式、打开查找替换、切换主题、触发未保存关闭确认。测试使用独立临时工作区，不访问用户真实文件。

```ts
test("core editing smoke", async ({ page }) => {
  await page.goto(process.env.TEXTORA_E2E_URL!);
  await expect(page.locator("#root")).not.toBeEmpty();
  await page.getByRole("button", { name: /new|新建/i }).click();
  await page.keyboard.type("# Smoke test");
  await page.keyboard.press("Control+Alt+S");
  await expect(page.locator(".textora-code-textarea")).toBeVisible();
});
```

- [ ] **Step 3: 运行完整验证**

依次运行：

```bash
npm test -- --run
npx tsc --noEmit
npx tsc -p tsconfig.main.json --noEmit
npm run build
npx playwright test tests/e2e/textora.smoke.spec.ts
```

预期：105 个以上现有测试和新增测试全部通过；两套 TypeScript 检查无错误；生产构建成功；Playwright 冒烟在桌面和窄视口均无空白、水平溢出或焦点丢失。

- [ ] **Step 4: 检查工作区差异并提交**

使用 `git diff --check`、`git status --short` 和 `git diff --stat` 确认只包含本计划涉及的文件，不重置用户已有改动。提交：

```bash
git add README.md src tests playwright.config.ts package.json package-lock.json
git commit -m "chore: finish Textora optimization verification"
```

## 执行顺序与回滚点

严格按 Task 1 到 Task 8 执行。Task 1-3 完成后先获得安全回归基线；Task 4-5 完成后验证数据一致性；Task 6-7 完成后验证性能和交互；Task 8 只做文档、端到端和最终检查。每个 Task 独立提交，发现回归时只回滚当前 Task 的提交，不触碰工作区原有未提交改动。

## 计划自检

- 安全设计覆盖：路径、符号链接、文件大小、命令 cwd、URL、导出和关闭幂等均有对应 Task。
- 可靠性设计覆盖：自动保存版本、监听来源、会话恢复和关闭状态机均有对应测试任务。
- 性能设计覆盖：Shiki、搜索扫描、大文件和分屏挂载均有实现与基线任务。
- 体验设计覆盖：可访问性、主题同步、类型收紧、编码清理和 Playwright 冒烟均有任务。
- 全文无占位要求或未定义函数名；每个任务都有文件、失败测试、实现方向、验证命令和提交边界。
