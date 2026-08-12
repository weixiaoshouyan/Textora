# Textora Code Wiki

> 对标 Typora 和 Notepad++ 的所见即所得 Markdown 桌面编辑器

## 目录

- [项目概述](#项目概述)
- [技术栈](#技术栈)
- [整体架构](#整体架构)
- [目录结构](#目录结构)
- [核心模块详解](#核心模块详解)
  - [主进程 (src/main)](#主进程-srcmain)
  - [渲染进程 (src)](#渲染进程-src)
  - [IPC 通信层](#ipc-通信层)
- [关键类与函数说明](#关键类与函数说明)
- [依赖关系](#依赖关系)
- [构建与运行](#构建与运行)
- [快捷键参考](#快捷键参考)

---

## 项目概述

Textora 是一款基于 Electron 的所见即所得 Markdown 桌面编辑器，对标 Typora 和 Notepad++。项目已从早期的 Tauri/Rust 技术栈迁移至 Electron，提供完整的 Markdown 编辑、代码编辑、文件管理、AI 助手等功能。

### 核心特性

- 所见即所得 Markdown 编辑（Milkdown + GFM）
- 代码高亮（Shiki，多语言、多主题）
- 数学公式（KaTeX，行内 + 块级）
- Mermaid 图表渲染
- 文件树侧边栏与工作区管理
- 外部文件变动监听与自动保存
- 专注 / 打字机 / 源码三种编辑模式
- PDF / HTML / Word 导出
- 图片粘贴/拖拽自动存储
- 代码编辑器增强（代码折叠、自动补全、括号匹配、书签）
- AI 助手（OpenAI 兼容 API，支持流式输出）
- 宏录制与回放
- 外部工具集成（Prettier/ESLint/Git 等）
- 插件 API 扩展系统

---

## 技术栈

| 类别 | 技术 |
|------|------|
| 桌面框架 | Electron 43 |
| 前端框架 | React 18 + TypeScript 5.9 |
| 构建工具 | Vite 8（rolldown 内核） |
| 状态管理 | Zustand 5（useAppStore + slices/ 领域切片） |
| Markdown 编辑器 | Milkdown 7 (ProseMirror 内核) |
| 代码高亮 | Shiki |
| 数学公式 | KaTeX |
| 图表 | Mermaid + dagre-d3-es |
| 样式 | Tailwind CSS 3 |
| 测试 | Vitest 4 + Playwright |
| Lint | ESLint 10（flat config，eslint.config.mjs） |
| 打包 | electron-builder |

---

## 整体架构

```
┌─────────────────────────────────────────────────────────────────┐
│                        Electron 主进程                           │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────────────┐  │
│  │  index.ts   │  │ ipc-handlers │  │   menu.ts            │  │
│  │  窗口管理   │  │  IPC 处理器  │  │   原生菜单           │  │
│  └─────────────┘  └──────────────┘  └───────────────────────┘  │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │                    src/main/ipc/                            │ │
│  │  files.ts │ search.ts │ export.ts │ dialogs.ts │ tools.ts  │ │
│  └─────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ IPC (contextBridge)
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                       渲染进程 (Renderer)                        │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │                      App.tsx (根组件)                        │ │
│  │  ┌────────────┐  ┌─────────────┐  ┌─────────────────────┐  │ │
│  │  │  TopBar    │  │  Sidebar    │  │    TabBar           │  │ │
│  │  └────────────┘  └─────────────┘  └─────────────────────┘  │ │
│  │  ┌─────────────────────────────────────────────────────────┐ │ │
│  │  │              编辑器区域 (动态切换)                      │ │ │
│  │  │  MilkdownEditor │ CodeEditor │ ImageView │ HexView     │ │ │
│  │  └─────────────────────────────────────────────────────────┘ │ │
│  │  ┌────────────┐  ┌─────────────┐  ┌─────────────────────┐  │ │
│  │  │ StatusBar  │  │ FindReplace │  │    Outline          │  │ │
│  │  └────────────┘  └─────────────┘  └─────────────────────┘  │ │
│  └─────────────────────────────────────────────────────────────┘ │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │                    Store (Zustand)                          │ │
│  │  useAppStore │ useSettingsStore │ useThemeStore          │ │
│  └─────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

### 进程间通信架构

```
渲染进程 (ipc.ts)                    主进程 (ipc-handlers.ts)
       │                                      │
       │  invoke("open_file", { path })         │
       │ ─────────────────────────────────>   │
       │                                      │ ──> ipc/files.ts
       │  listen("watch-event", cb)           │
       │ <─────────────────────────────────   │
       │                                      │ <── ipc/files.ts
```

---

## 目录结构

```
Textora/
├── .github/workflows/ci.yml          # GitHub Actions CI 配置
├── docs/                            # 设计文档
├── resources/                       # 静态资源（图标等）
├── src/
│   ├── main/                        # Electron 主进程
│   │   ├── index.ts                 # 主进程入口，窗口管理、生命周期
│   │   ├── ipc-handlers.ts          # IPC 处理器聚合注册
│   │   ├── menu.ts                  # 原生应用菜单构建
│   │   ├── shared.ts                # 共享类型与工具函数
│   │   ├── watcherCleanup.ts         # 文件监听清理
│   │   └── ipc/                    # IPC 处理器模块
│   │       ├── files.ts             # 文件读写、目录操作、监听
│   │       ├── search.ts            # 文件搜索
│   │       ├── export.ts            # PDF/PNG 导出
│   │       ├── dialogs.ts          # 原生对话框
│   │       ├── secrets.ts          # 加密存储
│   │       ├── tools.ts            # 外部工具调用
│   │       ├── log.ts              # 日志处理
│   │       └── window.ts           # 窗口控制
│   │
│   ├── ai/                          # AI 助手模块
│   │   ├── aiService.ts            # AI 对话服务（OpenAI 兼容 API）
│   │   ├── aiTools.ts              # AI 工具调用定义
│   │   └── config.ts               # 多供应商配置管理
│   │
│   ├── editor/                      # 编辑器模块
│   │   ├── MilkdownEditor.tsx      # Milkdown WYSIWYG 编辑器
│   │   ├── CodeEditor.tsx           # 代码编辑器（Monaco 风格）
│   │   ├── FileViewers.tsx         # 图片/二进制文件查看器
│   │   ├── BubbleMenu.tsx          # 浮动格式工具栏
│   │   ├── SlashCommand.tsx        # / 命令菜单
│   │   ├── InlineAiCopilot.tsx     # 内联 AI 写作助手
│   │   ├── TableToolbar.tsx        # 表格工具栏
│   │   ├── editorContextMenu.ts    # 编辑器右键菜单
│   │   ├── exporter.ts             # 导出功能
│   │   ├── findReplace.ts          # 查找替换逻辑
│   │   ├── focusMode.ts            # 专注模式
│   │   ├── typewriter.ts           # 打字机模式
│   │   ├── imageHandler.ts        # 图片处理
│   │   ├── imageLightbox.ts       # 图片灯箱
│   │   ├── imageResize.ts         # 图片缩放
│   │   ├── tableResize.ts         # 表格列宽调整
│   │   ├── lineOps.ts             # 行操作工具
│   │   ├── codeSymbols.ts         # 代码符号提取
│   │   ├── macro.ts               # 宏录制回放
│   │   ├── externalTools.ts       # 外部工具集成
│   │   ├── outline.ts             # 大纲视图逻辑
│   │   ├── diff.ts                # 差异对比
│   │   └── htmlSanitizer.ts      # HTML 消毒
│   │
│   ├── plugins/                     # Milkdown 插件
│   │   ├── pluginApi.ts            # 插件 API
│   │   ├── codeHighlight.ts        # Shiki 代码高亮
│   │   ├── codeFold.ts            # 代码折叠
│   │   ├── math.ts               # KaTeX 数学公式
│   │   ├── mermaid.ts            # Mermaid 图表
│   │   ├── toc.ts                 # 目录生成
│   │   └── shikiClient.ts         # Shiki 客户端
│   │
│   ├── store/                       # 状态管理
│   │   ├── useAppStore.ts         # 全局状态入口（组合各领域切片）
│   │   ├── slices/                # fileSlice / workspaceSlice / aiSlice / uiSlice / watcher
│   │   ├── useSettingsStore.ts    # 设置状态
│   │   ├── useThemeStore.ts       # 主题状态
│   │   ├── types.ts               # 类型定义
│   │   └── helpers.ts             # 辅助函数
│   │
│   ├── ui/                         # UI 组件
│   │   ├── TopBar.tsx             # 顶部栏
│   │   ├── StatusBar.tsx          # 状态栏
│   │   ├── Sidebar.tsx            # 侧边栏
│   │   ├── FileTree.tsx          # 文件树
│   │   ├── TabBar.tsx            # 标签栏
│   │   ├── FindReplace.tsx        # 查找替换面板
│   │   ├── Outline.tsx            # 大纲面板
│   │   ├── SettingsPanel.tsx     # 设置面板
│   │   ├── CommandPalette.tsx     # 命令面板
│   │   ├── QuickOpen.tsx         # 快速打开
│   │   ├── SearchInFiles.tsx     # 文件内搜索
│   │   ├── AiAssistant.tsx       # AI 助手面板
│   │   ├── DiffView.tsx         # 差异视图
│   │   ├── SplitView.tsx        # 分屏视图
│   │   ├── ContextMenu.tsx       # 右键菜单
│   │   ├── SaveConfirm.tsx       # 保存确认对话框
│   │   ├── Welcome.tsx           # 欢迎页
│   │   ├── MenuItem.tsx          # 菜单项
│   │   ├── Toggle.tsx           # 切换开关
│   │   └── showPrompt.tsx        # 输入提示
│   │
│   ├── hooks/                      # React Hooks
│   │   ├── useShortcuts.ts       # 全局快捷键
│   │   ├── useAutoSave.ts        # 自动保存
│   │   ├── useAppMenu.ts         # 应用菜单
│   │   ├── useDragOpen.ts       # 拖拽打开文件
│   │   ├── useWindowClose.ts     # 窗口关闭处理
│   │   ├── useClickOutside.ts    # 点击外部检测
│   │   ├── useFocusTrap.ts       # 焦点捕获
│   │   └── shortcutSchema.ts      # 快捷键定义
│   │
│   ├── i18n/                       # 国际化
│   │   └── index.ts               # 中英文翻译
│   │
│   ├── shared/                       # 主/渲染进程共享
│   │   ├── constants.ts             # 系统常量（大小限制/安全黑名单/编码白名单）
│   │   └── safeRegex.ts             # ReDoS 防护
│   │
│   ├── App.tsx                     # 应用根组件（编辑器组件懒加载）
│   ├── main.tsx                    # 渲染进程入口
│   ├── preload.ts                  # Electron Preload 脚本
│   ├── ipc.ts                     # IPC 兼容层
│   ├── ipcTypes.ts                # IPC 类型定义
│   ├── rendererLogger.ts           # 渲染进程日志
│   └── index.css                   # 全局样式
│
├── e2e/                            # Playwright E2E 冒烟测试
├── package.json                    # 项目配置
├── electron-builder.yml            # Electron 打包配置
├── vite.config.mts                 # Vite 构建配置
├── tsconfig.json                   # TypeScript 配置
├── tsconfig.main.json              # 主进程 TypeScript 配置
├── eslint.config.mjs               # ESLint flat config
tailwind.config.js              # Tailwind CSS 配置
└── vitest.config.mts               # Vitest 测试配置
```

---

## 核心模块详解

### 主进程 (src/main)

#### `index.ts` - 主进程入口

**职责**：创建应用主窗口、管理生命周期、注册 IPC 处理器、构建应用菜单

**关键函数**：

| 函数 | 说明 |
|------|------|
| `createWindow()` | 创建 BrowserWindow，配置 preload、contextIsolation、sandbox 等安全选项 |
| `app.whenReady()` | 应用就绪后注册 IPC 处理器、监听器，创建窗口 |
| `app.on('second-instance')` | 单实例锁，处理第二个实例的文件打开请求 |

**全局状态**：
- `mainWindow`: 主窗口引用
- `pendingOpenFile`: 待打开文件路径
- `isQuitting`: 是否正在退出
- `dirWatchers`: 目录监听器集合

#### `ipc-handlers.ts` - IPC 处理器聚合

**职责**：聚合注册所有 IPC 处理器，按职责拆分到子模块

**子模块**：

| 文件 | 职责 |
|------|------|
| `files.ts` | 文件读写、目录列表、文件监听、工作区根目录 |
| `search.ts` | 文件搜索、列表 |
| `export.ts` | PDF/PNG 导出 |
| `dialogs.ts` | 原生对话框、在文件管理器中打开 |
| `secrets.ts` | 加密敏感信息存储 |
| `tools.ts` | 外部工具调用 |
| `log.ts` | 日志处理 |
| `window.ts` | 窗口控制、菜单派发、标题 |

#### `menu.ts` - 原生应用菜单

**职责**：构建原生应用菜单（File / Edit / View / Help）

#### `shared.ts` - 共享工具

**职责**：提供主进程与渲染进程共享的类型定义和工具函数

**关键函数**：

| 函数 | 说明 |
|------|------|
| `validateWorkspacePath()` | 验证路径在工作区范围内 |
| `assertWorkspaceSize()` | 断言文件大小不超过限制 |
| `atomicWrite()` | 原子写入文件 |
| `detectLineEnding()` | 检测换行符类型 |
| `kindForExt()` | 根据扩展名判断文件类型 |
| `langForExt()` | 根据扩展名获取高亮语言 |

---

### 渲染进程 (src)

#### `App.tsx` - 应用根组件

**职责**：应用顶层布局、编辑器路由、全局钩子注册

**关键组件**：

```tsx
// 编辑器渲染路由
const renderEditor = () => {
  if (!activeTab) return <Welcome />;
  if (splitViewOpen && (activeTab.kind === "markdown" || activeTab.kind === "code")) return <SplitView />;
  if (activeTab.kind === "image") return <ImageView />;
  if (activeTab.kind === "binary") return <HexView />;
  if (activeTab.kind === "markdown" && !sourceMode)
    return <MilkdownEditor content={content} onChange={setContent} />;
  return <CodeEditor content={content} language={activeTab.language} onChange={setContent} />;
};
```

**全局钩子**：
- `useShortcuts()`: 全局快捷键监听
- `useAppMenu()`: 应用菜单同步
- `useDragOpen()`: 拖拽打开文件
- `useWindowClose()`: 窗口关闭处理
- `useAutoSave()`: 自动保存

#### `store/useAppStore.ts` - 全局状态管理

**职责**：管理应用全局状态，包括标签页、文件操作、工作区、设置等

**核心状态**：

| 状态 | 说明 |
|------|------|
| `tabs` | 打开的标签页数组 |
| `activeTabId` | 当前活动标签 ID |
| `currentPath` | 当前文件路径 |
| `content` | 当前文档内容 |
| `dirty` | 是否有未保存修改 |
| `theme` | 当前主题 |
| `workspaceRoot` | 工作区根目录 |
| `settings` | 应用设置 |
| `aiProviders` | AI 供应商配置 |
| `codeEditorApi` | CodeEditor 适配接口 |

**核心操作**：

| 操作 | 说明 |
|------|------|
| `newFile()` | 新建文件 |
| `openFile()` | 打开文件对话框 |
| `openPath(path)` | 打开指定路径文件 |
| `saveFile()` | 保存当前文件 |
| `saveFileAs()` | 另存为 |
| `closeTab(id)` | 关闭标签 |
| `setActiveTab(id)` | 切换活动标签 |
| `setContent(content)` | 更新文档内容 |
| `openWorkspace(dir)` | 打开工作区 |
| `closeWorkspace()` | 关闭工作区 |

**文件监听事件处理**：

```typescript
// 防抖批量重载目录
function scheduleBatchReload(dirPath: string) {
  // 收集需要重载的父目录，事件流停歇 300ms 后批量重载
  pendingReloadDirs.add(normalizePath(dirPath));
  reloadTimerId = window.setTimeout(() => {
    // 串行重载，避免并发 IPC 把磁盘打爆
    for (const d of dirs) {
      await get().loadDir(d);
    }
  }, RELOAD_DEBOUNCE_MS);
}
```

#### `editor/MilkdownEditor.tsx` - WYSIWYG Markdown 编辑器

**职责**：基于 Milkdown 的所见即所得 Markdown 编辑器

**核心功能**：
- Milkdown 编辑器初始化与配置
- Shiki 代码高亮集成
- 代码折叠支持
- 数学公式渲染（KaTeX）
- Mermaid 图表渲染
- 目录生成（TOC）
- 专注模式 / 打字机模式
- 图片处理（粘贴、拖拽、缩放）
- 表格列宽调整
- 浮动工具栏（BubbleMenu）
- / 命令菜单
- 内联 AI 写作助手

**关键函数**：

| 函数 | 说明 |
|------|------|
| `attachCodeHighlighter(view)` | 挂载 Shiki 代码高亮 |
| `attachCodeFolding(view)` | 挂载代码折叠 |
| `attachFocusMode(view, enabled)` | 挂载专注模式 |
| `attachTypewriter(view, enabled)` | 挂载打字机模式 |
| `attachImageHandlers(view)` | 挂载图片处理 |
| `replaceAllAction(content)` | 全量替换内容 |

#### `editor/CodeEditor.tsx` - 代码编辑器

**职责**：Monaco 风格的代码编辑器，支持多种编程语言

**核心功能**：
- 语法高亮（Shiki）
- 代码折叠（花括号/缩进）
- 智能自动补全（单词+片段）
- 括号匹配高亮
- 缩进参考线
- 活动行高亮
- 字符边缘线
- 缩放支持（Ctrl+滚轮）
- 书签系统
- 行操作（排序、去重、去空行、缩进转换）
- 大文件虚拟化渲染

**关键函数**：

| 函数 | 说明 |
|------|------|
| `computeFoldRanges(text, language)` | 计算代码折叠范围 |
| `findMatchingBracket(text, line, col, lines)` | 查找匹配括号 |
| `getUniqueWords(text)` | 获取唯一单词列表 |
| `triggerAC()` | 触发自动补全 |
| `applyAC(item)` | 应用自动补全项 |
| `executeLineOperation(op)` | 执行行操作 |

**自动补全片段**：

```typescript
const SNIPPETS: Record<string, { prefix: string; body: string }[]> = {
  javascript: [
    { prefix: "log", body: "console.log($1);\n$0" },
    { prefix: "fn", body: "function $1($2) {\n    $0\n}" },
    { prefix: "af", body: "const $1 = ($2) => {\n    $0\n};" },
    // ...
  ],
  // ...
};
```

#### `ai/aiService.ts` - AI 对话服务

**职责**：提供 AI 助手功能，支持 OpenAI 兼容 API

**核心功能**：
- Chat 对话
- 流式输出
- Tool Calling（工具调用）
- 多轮对话循环

**关键接口**：

```typescript
export interface AiConfig {
  apiKey: string;
  endpoint: string;
  model: string;
  enabled: boolean;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  name?: string;
  tool_calls?: any[];
  tool_call_id?: string;
}

export async function chat(options: ChatOptions): Promise<string>
```

**预设供应商**：

| 供应商 | 端点 |
|--------|------|
| OpenAI | https://api.openai.com/v1 |
| DeepSeek | https://api.deepseek.com/v1 |
| 通义千问 | https://dashscope.aliyuncs.com/compatible-mode/v1 |
| Moonshot | https://api.moonshot.cn/v1 |
| 智谱AI | https://open.bigmodel.cn/api/paas/v4 |
| Anthropic | https://api.anthropic.com/v1 |
| Ollama | http://localhost:11434/v1 |
| Groq | https://api.groq.com/openai/v1 |

#### `plugins/pluginApi.ts` - 插件 API

**职责**：提供扩展系统，支持命令注册、事件订阅、状态栏扩展

**插件接口**：

```typescript
export interface PluginContext {
  registerCommand: (cmd: { id: string; label: string; execute: () => void }) => void;
  onContentChange: (cb: (content: string) => void) => () => void;
  onSave: (cb: (path: string) => void) => () => void;
  addStatusBarItem: (item: { position: "left" | "right"; text: string; onClick?: () => void }) => () => void;
  log: (message: string) => void;
}
```

---

### IPC 通信层

#### `ipc.ts` - IPC 兼容层

**职责**：提供与 Tauri 兼容的 API 接口，保持前端业务代码改动最小

**关键函数**：

| 函数 | 说明 |
|------|------|
| `invoke(cmd, args)` | 类型安全的 IPC 调用 |
| `listen(event, cb)` | 监听主进程事件 |
| `openDialog(options)` | 打开文件对话框 |
| `saveDialog(options)` | 保存文件对话框 |
| `message(text, options)` | 显示消息对话框 |

**命令参数映射**：

```typescript
const CMD_ARGS: Record<string, string[]> = {
  read_text_file: ["path"],
  write_text_file: ["path", "contents"],
  list_dir: ["path"],
  open_file: ["path", "force_encoding"],
  write_file: ["path", "text", "encoding", "line_ending"],
  // ...
};
```

#### `preload.ts` - Electron Preload 脚本

**职责**：通过 contextBridge 暴露安全的 IPC 接口到渲染进程

**安全白名单**：

```typescript
const ALLOWED_INVOKE_CHANNELS = new Set([
  'read_text_file', 'write_text_file', 'list_dir', 'open_file', 'write_file',
  // ...
]);

const ALLOWED_ON_CHANNELS = new Set([
  'watch-event', 'menu', 'open-file', 'close-request', 'error',
  // ...
]);
```

---

## 关键类与函数说明

### 状态管理类

#### `useAppStore` (Zustand Store)

**文件**：`src/store/useAppStore.ts`

**主要状态**：

```typescript
interface AppState {
  // 多标签
  tabs: Tab[];
  activeTabId: string | null;
  
  // 活动文档镜像
  currentPath: string | null;
  content: string;
  dirty: boolean;
  editing: boolean;
  
  // 工作区
  workspaceRoot: string | null;
  entriesByDir: Record<string, DirEntry[]>;
  expanded: Record<string, boolean>;
  watchId: string | null;
  
  // 设置
  settings: Settings;
  
  // AI
  aiProviders: ProviderConfig[];
  aiSessions: ChatSession[];
}
```

**Tab 类型**：

```typescript
interface Tab {
  id: string;
  path: string | null;
  name: string;
  kind: FileKind;  // "markdown" | "code" | "image" | "binary" | "unknown"
  language: string;
  content: string;
  encoding: string;
  lineEnding: "lf" | "crlf";
  dirty: boolean;
  revision: number;
  cursor?: number | null;
  scrollTop?: number;
}
```

### 编辑器组件

#### `MilkdownEditor`

**文件**：`src/editor/MilkdownEditor.tsx`

**Props**：

```typescript
interface Props {
  content: string;
  onChange: (content: string) => void;
  readOnly?: boolean;
}
```

**初始化流程**：

```typescript
const editor = Editor.make()
  .config((ctx) => {
    ctx.set(rootCtx, root);
    ctx.set(defaultValueCtx, content);
    ctx.set(editorViewOptionsCtx, { editable: () => !readOnly && !settings.readingMode });
    ctx.get(listenerCtx).markdownUpdated((_ctx, markdown) => {
      onChangeRef.current(markdown);
    });
  })
  .use(commonmark)
  .use(gfm)
  .use(history)
  .use(listener)
  .use(mathPlugin)
  .use(mermaidPlugin)
  .use(tocPlugin);
```

#### `CodeEditor`

**文件**：`src/editor/CodeEditor.tsx`

**Props**：

```typescript
interface Props {
  content: string;
  language: string;
  onChange: (content: string) => void;
  readOnly?: boolean;
}
```

**CodeEditorApi 接口**：

```typescript
interface CodeEditorApi {
  getText: () => string;
  setText: (t: string) => void;
  getAllMatches: (query: string, opts: { regex: boolean; caseSensitive: boolean }) => { from: number; to: number }[];
  select: (from: number, to: number) => void;
  replaceRange: (from: number, to: number, text: string) => void;
  focus: () => void;
}
```

### IPC 处理器函数

#### 文件操作 (ipc/files.ts)

| 函数 | 说明 |
|------|------|
| `registerFileHandlers(deps)` | 注册所有文件相关 IPC 处理器 |
| `writeAtomically(filePath, data)` | 原子写入文件，避免写入中断导致文件损坏 |
| `requireWorkspacePath(p)` | 验证并解析工作区路径 |

#### 搜索 (ipc/search.ts)

| 函数 | 说明 |
|------|------|
| `registerSearchHandlers()` | 注册搜索相关 IPC 处理器 |

#### 导出 (ipc/export.ts)

| 函数 | 说明 |
|------|------|
| `registerExportHandlers()` | 注册 PDF/PNG 导出 IPC 处理器 |

---

## 依赖关系

### 核心依赖

```
textora
├── electron (桌面框架)
├── react / react-dom (UI 框架)
├── zustand (状态管理)
│
├── @milkdown/* (Markdown 编辑器核心)
│   ├── core
│   ├── preset-commonmark
│   ├── preset-gfm
│   ├── plugin-history
│   ├── plugin-listener
│   └── theme-nord
│
├── shiki (代码高亮)
├── katex (数学公式)
├── mermaid (图表)
│
├── electron-log (日志)
├── electron-updater (自动更新)
└── iconv-lite (编码转换)
```

### 开发依赖

```
devDependencies
├── vite (构建工具)
├── @vitejs/plugin-react (React 插件)
├── typescript (类型检查)
├── tailwindcss (CSS 框架)
├── postcss / autoprefixer (CSS 处理)
├── vitest (测试框架)
├── electron-builder (打包工具)
└── concurrently (并行启动)
```

### 依赖关系图

```
                    ┌─────────────────┐
                    │   App.tsx       │
                    │   (根组件)      │
                    └────────┬────────┘
                             │
         ┌───────────────────┼───────────────────┐
         │                   │                   │
         ▼                   ▼                   ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│  useAppStore    │  │  MilkdownEditor │  │   CodeEditor    │
│  (状态管理)     │  │  (MD 编辑器)    │  │  (代码编辑器)   │
└────────┬────────┘  └────────┬────────┘  └────────┬────────┘
         │                   │                   │
         │                   └─────────┬─────────┘
         │                             │
         ▼                             ▼
┌─────────────────┐           ┌─────────────────┐
│     ipc.ts      │           │   plugins/*     │
│  (IPC 兼容层)   │           │  (编辑器插件)   │
└────────┬────────┘           └─────────────────┘
         │
         │ IPC
         ▼
┌─────────────────┐
│  preload.ts     │
│  (安全桥接)    │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ ipc-handlers.ts │
│  (主进程处理)   │
└─────────────────┘
```

---

## 构建与运行

### 环境要求

- Node.js >= 22.12
- npm >= 10

### 开发模式

```bash
# 安装依赖
npm install

# 启动开发（同时启动 Electron 主进程 + Vite 渲染进程）
npm run dev
```

**开发模式说明**：
- 渲染进程由 Vite 提供热更新（端口 1420）
- 主进程由 TypeScript 编译后启动
- 自动打开 DevTools

### 生产构建

```bash
# 构建（编译主进程 + 构建渲染进程）
npm run build

# 打包 Windows 安装包
npm run package
```

**构建产物**：
- `dist/`: 渲染进程构建产物
- `release/`: 打包后的安装包

### 测试

```bash
# 运行测试
npm run test

# 监听模式
npm run test:watch
```

### 构建配置

#### `vite.config.ts`

```typescript
export default defineConfig({
  plugins: [react()],
  base: "./",
  build: {
    outDir: "dist",
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          // React 全家桶 → react-vendor
          // Milkdown/ProseMirror → editor-vendor
          // Shiki → shiki-vendor
          // KaTeX → katex-vendor
          // Remark/Unified → md-vendor
        },
      },
    },
  },
  resolve: {
    dedupe: ["react", "react-dom"],
  },
  server: {
    port: 1420,
    strictPort: true,
  },
});
```

#### `electron-builder.yml`

```yaml
appId: com.textora.app
productName: Textora
asar: true
asarUnpack:
  - node_modules/iconv-lite/**
win:
  target: nsis
  icon: resources/icon.ico
nsis:
  oneClick: false
  allowToChangeInstallationDirectory: true
publish:
  - provider: github
```

---

## 快捷键参考

### 文件操作

| 快捷键 | 功能 |
|--------|------|
| Ctrl/Cmd + N | 新建文件 |
| Ctrl/Cmd + O | 打开文件 |
| Ctrl/Cmd + S | 保存 |
| Ctrl/Cmd + Shift + S | 另存为 |

### 编辑

| 快捷键 | 功能 |
|--------|------|
| Ctrl/Cmd + F | 查找替换 |
| Ctrl/Cmd + B | 切换文件树 |
| Ctrl/Cmd + Alt + S | 切换源码模式 |
| Ctrl+Space | 触发自动补全 |

### 视图

| 快捷键 | 功能 |
|--------|------|
| Ctrl/Cmd + J | 切换明暗主题 |
| F8 | 切换打字机模式 |
| F9 | 切换专注模式 |
| Ctrl+滚轮 | 缩放编辑器字体 |

### 书签

| 快捷键 | 功能 |
|--------|------|
| Ctrl+F2 | 切换书签 |
| F2 | 跳转到下一个书签 |
| Shift+F2 | 跳转到上一个书签 |
| Ctrl+Shift+F2 | 清除所有书签 |

### 行操作

| 快捷键 | 功能 |
|--------|------|
| Alt+Shift+S | 升序排序行 |
| Alt+Shift+D | 删除重复行 |
| Alt+Shift+E | 删除空行 |
| Alt+Shift+T | 制表符转空格 |

### 宏

| 快捷键 | 功能 |
|--------|------|
| Ctrl+Shift+R | 开始/停止宏录制 |
| Ctrl+Shift+P | 回放宏 |

---

## 附录

### 类型定义速查

#### FileKind

```typescript
type FileKind = "markdown" | "code" | "image" | "binary" | "unknown";
```

#### ThemeMode

```typescript
type ThemeMode = "light" | "dark" | "sepia" | "nord";
```

#### Settings

```typescript
interface Settings {
  autoSaveSeconds: number;    // 0 表示关闭
  fontSize: number;
  fontFamily: string;
  focusMode: boolean;
  typewriterMode: boolean;
  sourceMode: boolean;
  readingMode: boolean;
  spellcheck: boolean;
  sidebarVisible: boolean;
  outlineVisible: boolean;
  sidebarWidth: number;
}
```

### IPC 命令列表

| 命令 | 参数 | 返回 | 说明 |
|------|------|------|------|
| `open_file` | `{ path, force_encoding? }` | `OpenFileResult` | 打开文件 |
| `write_file` | `{ path, text, encoding, line_ending }` | `void` | 写入文件 |
| `list_dir` | `{ path }` | `DirEntry[]` | 列出目录 |
| `search_in_files` | `{ root, query, ... }` | `SearchResult[]` | 文件内搜索 |
| `export_pdf` | `{ html, target_path }` | `void` | 导出 PDF |
| `run_tool` | `{ tool, vars }` | `string` | 运行外部工具 |
| `store_secret` | `{ key, value }` | `void` | 加密存储 |
| `read_secret` | `{ key }` | `string \| null` | 读取加密数据 |

---

*文档生成时间：2026-07-29*
*项目版本：0.2.0*
