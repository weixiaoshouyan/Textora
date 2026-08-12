# Textora

> 对标 Typora 和 Notepad++ 的所见即所得 Markdown 桌面编辑器。
> 技术栈：Electron + React 18 + TypeScript + Milkdown（已从早期 Tauri/Rust 迁移至 Electron）。

## 当前进度

| 阶段 | 状态 | 内容 |
|---|---|---|
| 1 | ✅ 已完成 | 最小可用编辑器：Electron 脚手架、Milkdown 集成、基础 Markdown、文件打开/保存、明暗主题、快捷键、字数统计、最近文件 |
| 2 | ✅ 已完成 | 文件树侧边栏、文件夹操作（新建/重命名/删除）、外部文件变动监听与提示、自动保存（可配）、启动恢复工作区 |
| 3 | ✅ 已完成 | 代码高亮（Shiki DOM 注入）、数学公式（KaTeX）、Mermaid 图表、脚注（GFM）、主题同步重渲 |
| 4 | ✅ 已完成 | 大纲面板、专注/打字机/源码模式、查找替换、快捷键补全 |
| 5 | ✅ 已完成 | PDF / HTML / Word 导出；图片粘贴/拖拽自动存到 `<workspace>/assets/`，使用相对路径 |
| 6 | ✅ 已完成 | 4 套内置主题（Light / Dark / Sepia / Nord）、设置面板、中英文 i18n、原生应用菜单、打包发布 |
| 7 | ✅ 已完成 | Notepad++ 对标增强：代码折叠、自动补全、括号匹配、书签、搜索历史、行操作、函数列表 |

## 改进与优化

| 阶段 | 状态 | 内容 |
|---|---|---|
| 1-基础设施 | ✅ 已完成 | 统一错误码定义、常量提取与配置化 |
| 2-安全加固 | ✅ 已完成 | CSP 安全头、IPC 速率限制 |
| 3-可靠性提升 | ✅ 已完成 | 文件写入重试机制、用户友好的错误翻译 |
| 4-性能优化 | ✅ 已完成 | 大文件虚拟滚动优化 |
| 5-测试强化 | ✅ 已完成 | 集成测试框架（Vitest + Playwright）、渲染层 E2E 冒烟测试、边界场景测试 |
| 6-可观测性 | ✅ 已完成 | 崩溃报告集成、日志查看、系统信息收集 |
| 7-维护自动化 | ✅ 已完成 | Dependabot 依赖自动更新、代码覆盖率报告 |

## 环境准备

1. 安装 Node.js ≥ 22.12（vite 8 / electron 43 的最低要求）
2. 安装依赖：`npm install`

> 说明：本项目已从 Tauri/Rust 迁移为 Electron 桌面应用，不再需要 Rust 工具链。
>
> 若安装时 Electron 二进制下载失败（网络问题），可设置镜像后重装：
> `ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/ npm install`
> 遇到 GPU 驱动导致的渲染白屏时，可设置 `TEXTORA_DISABLE_GPU=1` 禁用硬件加速。

## 启动开发

```bash
npm install
npm run dev      # concurrently 启动 Electron 主进程 + Vite 渲染进程
```

## 打包发布

```bash
npm run build    # tsc 编译主进程 + Vite 构建渲染进程
npm run package  # 构建并使用 electron-builder 生成 Windows 安装包
```

## 测试

```bash
npm run test        # 单元测试（Vitest）
npm run test:e2e    # E2E 冒烟测试（Playwright，需先 npx playwright install chromium）
```

## 快捷键

| 快捷键 | 功能 |
|---|---|
| Ctrl/Cmd + N | 新建文件 |
| Ctrl/Cmd + O | 打开文件 |
| Ctrl/Cmd + S | 保存 |
| Ctrl/Cmd + Shift + S | 另存为 |
| Ctrl/Cmd + J | 切换明暗主题 |
| Ctrl/Cmd + F | 查找替换 |
| Ctrl/Cmd + B | 切换文件树 |
| Ctrl/Cmd + Alt + S | 切换源码模式 |
| F8 | 切换打字机模式 |
| F9 | 切换专注模式 |
| Ctrl+F2 | 切换书签 |
| F2 | 跳转到下一个书签 |
| Shift+F2 | 跳转到上一个书签 |
| Ctrl+Shift+F2 | 清除所有书签 |
| Ctrl+Space | 触发自动补全 |
| Alt+Shift+S | 升序排序行 |
| Alt+Shift+D | 删除重复行 |
| Alt+Shift+E | 删除空行 |
| Alt+Shift+T | 制表符转空格 |
| Ctrl+滚轮 | 缩放编辑器字体 |
| Ctrl+Shift+R | 开始/停止宏录制 |
| Ctrl+Shift+P | 回放宏 |

## 目录结构

```
.
├── docs/                         # 设计文档
├── src/                          # React 前端
│   ├── App.tsx / main.tsx / index.css
│   ├── i18n/index.ts              # 中英文 i18n
│   ├── store/                     # Zustand 状态（useAppStore + slices/ 领域切片）
│   ├── shared/                    # 主/渲染进程共享（constants、safeRegex）
│   ├── editor/                    # MilkdownEditor / CodeEditor / imageHandler / findReplace / outline / typewriter / exporter / lineOps / codeSymbols
│   ├── plugins/                   # shikiClient / codeHighlight / math / mermaid / codeFold
│   ├── ui/                        # TopBar / StatusBar / Welcome / Sidebar / FileTree / Outline / FindReplace / SettingsPanel
│   ├── hooks/                     # useShortcuts / useAutoSave / useWindowClose / shortcutSchema
│   └── ai/                        # aiService / config
├── src/main/                      # Electron 主进程
│   ├── index.ts                   # 窗口管理、生命周期、自动更新
│   ├── ipc-handlers.ts            # IPC 处理器
│   ├── menu.ts                    # 原生应用菜单
│   └── shared.ts                  # 共享类型与工具函数
├── e2e/                           # Playwright E2E 冒烟测试
├── package.json
├── tsconfig.json
├── vite.config.mts
├── eslint.config.mjs
├── tailwind.config.js
└── electron-builder.yml
```

## 功能总览

- ✅ 所见即所得 Markdown 编辑（Milkdown + GFM）
- ✅ 标题 / 列表 / 引用 / 任务列表 / 表格 / 脚注 / 代码块 / 图片
- ✅ 代码高亮（Shiki，多语言、多主题）
- ✅ 数学公式（KaTeX，行内 + 块级）
- ✅ Mermaid 图表
- ✅ 大纲视图
- ✅ 文件树侧边栏（新建/重命名/删除）
- ✅ 外部文件变动监听与提示
- ✅ 自动保存（可配间隔）
- ✅ 专注 / 打字机 / 源码三种模式
- ✅ 查找替换（当前文件）
- ✅ 4 套主题：Light / Dark / Sepia / Nord
- ✅ 中英文界面
- ✅ 设置面板：字号/字体/自动保存/主题/语言
- ✅ 原生应用菜单（File / Edit / View / Help）
- ✅ PDF / HTML / Word 导出
- ✅ 图片粘贴/拖拽自动存到 `<workspace>/assets/`，使用相对路径
- ✅ **代码编辑器增强**：代码折叠（花括号/缩进）、智能自动补全（单词+片段）、括号匹配高亮
- ✅ **缩进参考线**：可视化缩进层级
- ✅ **活动行高亮**：当前行背景高亮
- ✅ **字符边缘线**：可配置的列参考线
- ✅ **缩放支持**：Ctrl+滚轮缩放编辑器字体
- ✅ **书签系统**：Ctrl+F2 书签标记，F2/Shift+F2 导航，持久化存储
- ✅ **搜索历史**：本地搜索历史记录，下拉快速复用
- ✅ **文件搜索过滤**：按文件类型过滤，排除指定目录
- ✅ **行操作工具**：排序、去重、去空行、缩进转换
- ✅ **函数列表/符号树**：代码大纲提取，函数/类/方法导航
- ✅ **Milkdown 编辑器折叠**：标题和代码块折叠展开
- ✅ AI 助手：OpenAI 兼容 API，支持流式输出
- ✅ **宏录制回放**：录制编辑操作序列，一键回放（Ctrl+Shift+R 录制，Ctrl+Shift+P 回放）
- ✅ **外部工具**：配置 Prettier/ESLint/Git 等外部命令，在编辑器内执行
- ✅ **插件 API**：扩展系统支持命令注册、事件订阅、状态栏扩展

## 打包发布

```bash
# 开发模式
npm run dev

# 打包 Windows 安装包（NSIS）
npm run build

# 产品位置：release/
#   - Windows: .exe 安装包
```

如需在 CI 中发布，可使用 GitHub Actions + `electron-builder` 配置。
