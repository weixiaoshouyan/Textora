# Textora 项目深度审查报告

> 审查日期：2026-09-01 · 审查范围：全仓库 163 个源文件 · 方法：三层并行深度代码审查（主进程安全 / 编辑器核心 / UI·状态·AI）+ 关键发现人工二次验证 + 全量测试构建验证

---

## 一、健康度快照（全绿）

| 检查项 | 结果 |
|---|---|
| 单元测试（Vitest） | ✅ **219/219 通过**（27 个测试文件，覆盖保存竞态/路径安全/SSRF/导出净化等核心逻辑） |
| TypeScript（renderer + main 双配置） | ✅ 0 错误 |
| ESLint（flat config） | ✅ 0 告警 |
| i18n 对齐 | ✅ zh / en 各 368 个 key，无缺失、无空值 |
| 安全基线 | ✅ contextIsolation + sandbox 全开、preload IPC 白名单、CSP 严格策略、路径边界校验含 realpath + TOCTOU 复核 |
| 依赖 | 825 包安装正常；Electron 二进制需网络镜像（README 已有说明） |

**总体判断**：这是一个工程质量显著高于平均水平的个人/小团队项目。数据安全底座（原子写入、revision 保存守卫、会话恢复、崩溃恢复提示、窗口关闭协议）做得非常扎实，几乎无 TODO/FIXME 残留。**主要问题不在核心链路，而在「宣传功能与实际实现之间的落差」——约三分之一的周边体验功能处于半成品或未接线状态，功能完成度约 70%。**

---

## 二、缺陷清单（按严重度）

### P0 — 违背产品根本承诺（1 项，已人工验证）

**1. 右键菜单「插入表格 / 数学公式 / 任务列表」在 WYSIWYG 模式插入的是错误内容**
- 位置：`src/editor/contextMenu/actions.ts:300-389`（doInsertTable / doInsertMath / doInsertTaskList / doInsertMermaid）
- 现象：四个函数都执行 `schema.nodes.code_block.create(null, schema.text(markdown))` —— 把 markdown **源文本**塞进一个代码块节点。用户在所见即所得编辑器里右键点「插入表格」，得到的不是表格，而是一个显示 `| Header | Header |` 原始字符的代码块，且无法自动转换。数学公式同理（`$$\n\n$$` 变成代码块）。
- 根因：疑似从 mermaid 插入的实现复制粘贴后未改（mermaid 本身确实是代码块，其他三者不是）。
- 修复方向：改用 store 里已注册的 `insertMarkdownFn`（MilkdownEditor.tsx:171 已实现「仅解析新内容、避免全量 re-parse」的高效路径），一行改写即可让四个菜单项全部走 parser 正确生成节点。

### P1 — 功能失效 / 数据风险 / 安全（12 项）

| # | 问题 | 位置 | 说明 |
|---|---|---|---|
| 1 | **PDF 页眉/页码整链路断裂** | `src/ipc.ts:64` + `src/editor/exporter.ts:320-324` | 渲染层认真构造了 `pdf_options`（displayHeaderFooter/headerTemplate/footerTemplate），主进程 `export.ts:186` 也支持第三参数并有 `sanitizePdfOptions` 白名单——但渲染层 IPC 序列化表 `CMD_ARGS` 只映射 `["html", "target_path"]`，第三个参数被**静默丢弃**。设置面板的 pdfHeader/pdfFooter 开关完全是摆设，README 宣传的「PDF 导出可选页眉/页码」实际无效。**一行修复**：CMD_ARGS 加 `pdf_options` |
| 2 | **多窗口菜单错位** | `src/main/menu.ts` | `Menu.setApplicationMenu` 是全局单例，click 闭包却绑定「构建时传入的窗口」。开第二个窗口后，旧窗口的 Ctrl+S / Ctrl+N 等会作用到最新构建菜单的窗口上——存在**把 A 窗口内容保存进 B 窗口文件**的风险 |
| 3 | **文件删除不进回收站** | `src/main/ipc/files.ts:170-181` | `remove_path` 直接 `fsp.rm(recursive)` / `fsp.unlink` 永久删除。Typora/VSCode 均默认进回收站。Electron 自带 `shell.trashItem()`，改造成本极低，但对用户的数据安全感差异巨大 |
| 4 | **SSRF：纯 hex 域名绕过内网防护** | `src/main/ipc/tools.ts:271` | `isSafeUrlResolved` 用 `/^[0-9a-f:]+$/i` 判定「字面 IPv6」跳过 DNS 反查，但 `abc`、`deadbeef` 这类纯 hex 单标签域名同样命中——AI 工具「抓取网页」可被诱导访问内网服务 |
| 5 | **SSRF：DNS rebinding TOCTOU** | `tools.ts:454-477` | 安全校验与 fetch 实际请求是两次独立 DNS 解析，攻击者可第一次解析返回公网 IP、第二次返回 169.254.169.254 元数据地址。需 pin 校验时的 IP |
| 6 | **限流覆盖不足** | `src/main/rateLimiter.ts` | 全项目仅 5 个通道调用 `checkRateLimit`；`read_binary_file`（50MB→67MB base64 内存放大）、`remove_path`（递归删除）、`search_in_files` 等高危通道零限流 |
| 7 | **关窗兜底可穿透另存为对话框** | `hooks/useWindowClose`（渲染层 10s 兜底）与 `main/index.ts`（60s 兜底） | 用户在「另存为」系统对话框里停留超过渲染层兜底时限时，确认链被强制推进，可能丢失未保存修改 |
| 8 | **目录重命名后子文件标签路径失效** | `store/slices/workspaceSlice` | 重命名目录时已打开的子文件标签仍持旧路径，继续编辑后 Ctrl+S 会**写回旧路径**（重新创建幽灵文件）或报错 |
| 9 | **AI 请求错误静默不可见** | `ui/AiAssistant` / `ai/chatLogic` | 网络错误 / 401 / 超时被 catch 后不展示，用户只看到「没有回复」，无从判断是 key 错了还是网断了 |
| 10 | **AI 流式 60s 总超时截断长回复** | `ai/aiService.ts:89-109` | timeout 同时管「首包等待」和「整体读取」，长文生成超过 60s 会被 abort；流式场景应改为「空闲超时」（如 30s 无新 chunk 才中断） |
| 11 | **API key 竞态丢失** | `store/slices/aiSlice` | 异步 `loadProviderConfigs` 从安全存储回填期间用户若编辑供应商配置，回填完成会覆盖/清除刚保存的 key |
| 12 | **TopBar 未保存指示器显示字面 `\u2022`** | `src/ui/topbar/index.tsx:178`（已验证） | JSX 文本节点不处理转义序列，dirty 时顶栏显示字符串 `\u2022` 而非 `•`。改为 `{"\u2022"}` 即可 |

### P2 — 打磨项 / 死代码 / 体验缺口（精选 14 项）

1. **导航防护缺失**：主窗口无 `will-navigate` / `setWindowOpenHandler` 拦截，渲染层被注入后可导航到任意外部页面（`main/index.ts`）
2. **create_file 截断竞态**：无 `wx` 标志，「新建文件」在文件恰好已存在时会清空它（`files.ts`）
3. **secrets JSON 损坏 → 一次写入清空全部密钥**：`readSecrets` 解析失败返回 `{}`，下次保存任一 key 时把损坏文件整体覆写（`shared.ts:487`）
4. **vimMode 是死代码**：store/helpers/types 三处有标志、有 toggle 方法，但无任何 UI 入口、无任何实现引用
5. **「字符边缘线」未接线**：`CodeEditor.tsx:86` 读 `localStorage.textora.edgeColumn`，但全仓库无任何写入处——README 宣传的功能没有 UI 入口
6. **Ctrl+滚轮缩放不持久化**：zoom 是组件局部 state，重启归零（Notepad++/VSCode 均持久化）
7. **AI 面板大量硬编码中文**：切换英文界面后 AI 面板/工具确认弹窗中英混杂（组件绕过了 i18n 体系；导出成功提示 "Export Complete" 也是硬编码）
8. **插件系统与宏系统是空壳**：`plugins/pluginApi.ts` 定义的扩展 API、宏录制回放（`macro.ts`）都没有 UI 入口/管理面板，用户不可发现
9. **导出内容含编辑器 UI**：exporter 从 DOM 抓取导出，会带上折叠按钮等非文档元素；处于折叠状态的代码块导出后**内容缺失**
10. **GBK 无自动检测**：无 BOM 的 GBK 中文文件打开即乱码（UTF-8 校验失败后回退 latin1），用户需手动在状态栏切编码；Typora 能自动识别
11. **代码语言覆盖窄**：`shared.ts` 的 LANG_MAP/CODE_EXTS 缺 `.php .rb .lua .kt .swift .vue .bat .ps1 .log .ini` 等，这些文件即使打开也按 plaintext 处理（Shiki 本身支持远不止这些）
12. **欢迎页信息密度低**：只有「新建 / 打开」两个动作，无最近打开文件列表——Typora/Typst 类编辑器的标配
13. **E2E 覆盖极薄**：仅 2 条渲染层冒烟用例，文件读写/保存/导出等 Electron 链路无自动化验证（测试文件注释已自知）
14. **其他小项**：大纲对 CRLF 文件跳转位置漂移；行操作行首判定 off-by-one；`ensureWithinWorkspace*` 与 `validateWorkspacePath` 双套边界检查并存（前者已成死代码）；仓库内有已删除未提交的第三方工具残留（.inscode/.reasonix）；README 占位链接 github.com/textora/textora 不存在

---

## 三、终端用户四维评估（对标 Typora）

### 1. 功能 ⭐⭐⭐⭐☆（潜力大，落地率是短板）

**亮点（部分超越 Typora）**：
- 「一个编辑器三种形态」：WYSIWYG + 源码模式 + Notepad++ 式代码编辑（折叠/书签/符号树/行操作/宏），定位独特
- 数学公式、Mermaid 图表、跨文件搜索、Diff 对比、分屏、命令面板、快速打开——现代编辑器要素齐全
- **AI 集成是 Typora 没有的差异化**：多供应商（DeepSeek/通义/Kimi/Ollama 本地）、流式、工具调用带确认门、内联 Copilot（Ctrl+K）
- 外部变更三选一（重载/看差异/忽略）+ 崩溃恢复提示条，数据安全设计 mature

**落差**：
- 招牌功能「宣传 > 实现」：PDF 页眉页码无效、字符边缘线无入口、右键插入格式内容错乱（P0）、插件/宏/外部工具面板是空壳
- 图片查看器无缩放/旋转，二进制只有 512 字节 hex 预览；无 CSV/JSON/PDF/媒体预览（Notepad++ 式多格式查看的「式」有了，「实」还差）
- 无字数统计目标、无版本历史快照（Typora 有文档历史）

### 2. 便捷性 ⭐⭐⭐⭐☆

- 快捷键体系完整且**可视化自定义 + 冲突检测**——这一点做得比很多商业编辑器好
- 缺「最近打开的文件」（高频痛点）、状态栏编码切换有了但缺「重新加载编码」快捷动作
- 文件树未展开目录的右键新建无响应（P1）、删除无回收站（P1）直接影响日常操作信任感

### 3. 实用性 ⭐⭐⭐⭐½

- **数据安全是全项目最强的部分**：原子写 + 重试、保存竞态守卫、会话/崩溃恢复、UTF-8/GBK/UTF-16 编码族处理、大文档虚拟滚动 + 降级——这些看不见的地方恰恰是编辑器「敢不敢天天用」的分水岭，Textora 达标
- 跨文件搜索结果键盘导航、跳转后预填查找——细节有想法
- GBK 乱码问题（P2-10）对中文用户是实际使用障碍，建议提级处理

### 4. 美学 ⭐⭐⭐☆

- 4 套主题（Light/Dark/Sepia/Nord）+ CSS 变量体系规整，主题切换会同步刷新 Shiki/KaTeX/Mermaid——工程正确
- 但整体缺乏「记忆点」：Welcome 页过于素净、顶栏/状态栏信息层次平淡、图标体系（文件树 icons）粗糙
- Typora 的优势是「打开就想写字」的沉浸感；Textora 目前更像「工具整齐的工位」——不丑，但无吸引力

---

## 四、下一步建议（按投入产出比排序的执行路线）

### 第一批：止血（半天）——让宣传的功能真实存在
1. 修 P0：`actions.ts` 四处 `code_block.create` → 改用 `insertMarkdownFn`（文件已有现成基础设施）
2. 修 PDF 断链：`ipc.ts` CMD_ARGS `export_pdf` 补 `pdf_options`，随即在设置面板开/关页眉页码各导出一次 PDF 验证
3. 修 TopBar `\u2022`（一行）
4. `remove_path` → `shell.trashItem()` + 失败回退直接删除

### 第二批：数据与多窗口安全（1 天）
5. `menu.ts` 菜单 click 一律改用 `BrowserWindow.fromWebContents` 或发送到 focusedWindow，消除跨窗口错位
6. 目录重命名时同步迁移其下所有已打开标签的 path（workspaceSlice renameItem）
7. 关窗兜底与另存为对话框互斥：另存为在途时暂停渲染层 10s 兜底
8. AI 错误可见化：catch 后把状态码/摘要写进聊天流（"⚠️ API 401: key 无效"）

### 第三批：安全加固（1 天）
9. SSRF：hex 域名正则收紧（先 `dns.lookup` 再判断，或要求域名含非 hex 字符）；fetch 前后 pin DNS 解析 IP
10. 主窗口补 `will-navigate`（拒绝非 file:// 导航）+ `setWindowOpenHandler`（拒绝弹窗）
11. `create_file` 改 `wx` 标志；限流扩到 `remove_path` / `read_binary_file` / `search_in_files`

### 第四批：体验补全（2-3 天，直接提升「天天用」的意愿）
12. 欢迎页加「最近打开的文件」列表（主进程已有 get_file_info 基础，补一个 recents 持久化即可）
13. GBK 自动检测：UTF-8 校验失败且字节模式符合 GBK 双字节特征时按 GBK 解码（iconv-lite 已在依赖里，可写个启发式 ~40 行）
14. AI 面板/确认弹窗/导出提示全面接入 i18n
15. 导出前自动展开所有折叠 + 过滤编辑器 UI 元素
16. 缩放/边缘线接入设置面板（或从 README 移除宣传），顺手删除 vimMode 死代码
17. LANG_MAP/CODE_EXTS 扩容（php/rb/lua/kt/vue/bat/ps1…，Shiki 语言包按需加载机制已具备）

### 第五批：差异化推进（中长期）
18. FileViewers 扩展：CSV 表格预览、JSON 树视图、PDF 内嵌预览、音视频播放——这是「Notepad++ 式多格式」定位的真正护城河
19. 宏/插件系统给 UI 入口或先下架 README 宣传
20. E2E 补 Electron 链路：Playwright `_electron.launch()` 跑「新建→编辑→保存→重开→导出 PDF」黄金路径
21. 视觉打磨：Welcome 页信息层次、文件树图标统一、状态栏交互微反馈

### 一句话总结
**核心链路（写、存、恢复、安全）已经是能托付文档的水准；下一步的全部重点是「把 README 里承诺的每一个 ✅ 变成真的」，然后靠最近文件、GBK 自动检测、多格式查看器这三件事建立起对 Typora 的差异化优势。**

---

## 五、修复执行记录（2026-09-01 下午追加）

按报告路线图落地了前三批修复，验证全绿（tsc ×2 零错误、ESLint 零告警、Vitest 219/219 通过）。

### 第一批：止血（已完成 ✅）
1. **P0 右键插入错位**（`editor/contextMenu/actions.ts`）：表格/任务列表改用 Milkdown parser 生成真实节点（新增 store 能力 `insertMarkdownAtSelectionFn`，由 MilkdownEditor 注册、`replaceSelection` 插入）；数学公式改为直接插文本（math 是装饰器渲染，整段 `$$tex$$` 即触发 KaTeX）；mermaid 改为创建 `language="mermaid"` 的代码块节点。四处 code_block 错插全部消除。
2. **PDF 页眉/页码断链**（`ipc.ts`）：CMD_ARGS `export_pdf` 补 `pdf_options`，主进程 `sanitizePdfOptions` 白名单开始生效，设置面板开关真正接线。
3. **TopBar 未保存圆点**（`ui/topbar/index.tsx:178`）：`\u2022` → `{"\u2022"}`，不再显示字面量。
4. **删除进回收站**（`main/ipc/files.ts`）：`remove_path` 优先 `shell.trashItem()`，失败回退永久删除。

### 第二批：数据安全（已完成 ✅）
5. **多窗口菜单错位**（`main/menu.ts`）：菜单点击时路由到 `BrowserWindow.getFocusedWindow()`（回退构建时窗口），消除 Ctrl+S 作用于错误窗口的写错文件风险。
6. **目录重命名/删除迁移标签**（`store/slices/file/fs.ts`）：renameItem 迁移目录下所有已打开子标签的 path；removeItem 关闭被删目录下的所有标签，杜绝幽灵文件写回。
7. **关窗兜底 vs 另存为对话框**（`hooks/useWindowClose.ts` + `main/ipc/dialogs.ts` + `main/index.ts`）：渲染层 10s 兜底改为「对话框在途时每 2s 重查不强行推进」；主进程 60s 兜底感知 `hasOpenNativeDialog` 延后复查。
8. **AI 错误可见化**（`ui/AiAssistant.tsx`）：此前 `const [, setError] = useState("")` 把错误状态丢弃，401/超时/断网对用户零反馈——现渲染红色错误条（可关闭）。
9. **AI 流式空闲超时**（`ai/aiService.ts`）：核实 60s 超时只护到响应头（不截断长回复），补 120s 读空闲超时防连接挂起永久卡死。

### 第三批：安全加固（已完成 ✅）
10. **SSRF hex 域名绕过**（`main/ipc/tools.ts`）：`/^[0-9a-f:]+$/i` 判定收紧为「必须含 `:`」才算 IPv6 字面量，纯 hex 域名（`deadbeef`）必须走 DNS 反查；新增回归测试 `toolsSecurity.test.ts`。
11. **DNS rebinding TOCTOU**：fetch 返回前对最终主机名二次解析，任一新地址落回内网即丢弃响应。
12. **导航防护**（`main/index.ts`）：`will-navigate` 仅放行 file://（dev 下 localhost:1420），`setWindowOpenHandler` 全部 deny、http(s) 外链转系统浏览器。
13. **create_file 截断竞态**（`main/ipc/files.ts`）：`writeFile` 加 `{ flag: 'wx' }`，文件已存在报错而非清空。
14. **限流扩容**（`main/rateLimiter.ts` + files/search）：STRICT 通道从 5 个扩到 11 个（remove_path/read_binary_file/read_text_file/list_all_files/list_md_files/get_recent_lines/watch_dir），高危 handler 接入 `assertRateLimit`。

### 验证结果
- `tsc -p tsconfig.json` / `tsconfig.main.json`：0 错误
- `eslint src`：0 告警
- `vitest run`：**219/219 通过**（含新增 SSRF 回归测试）

### 尚未执行（第四/五批，供后续迭代）
- ~~欢迎页最近打开文件列表、GBK 自动检测、AI 面板 i18n、导出自动展开折叠、语言覆盖扩容、FileViewers 多格式扩展（CSV/JSON/PDF）、Playwright Electron 链路 E2E、视觉打磨。~~

### 第四/五批执行记录（2026-09-01 晚追加，全部落地）
> 并行工作者因 API 限流（429）中途失败，改为由主代理顺序完成；失败工作者留下的部分产物（编码检测模块、i18n 字典扩展）经核验后保留复用。

- **GBK 自动检测**（`main/encodingDetect.ts` + `files.ts`）：无 BOM 时 UTF-8 严格校验 → GBK 特征判定 → latin1 兜底，中文文件不再乱码；`isValidUtf8` 拒绝 overlong/代理区/截断序列。
- **语言覆盖扩容**（`main/shared.ts` + `plugins/shikiClient.ts`）：CODE_EXTS/LANG_MAP/SUPPORTED_LANGS 扩到 60+ 种（php/rb/lua/kt/swift/cs/vue/svelte/scala/dart/bat/ps1/ini/tex/r/csv/tsv/diff/zig 等，均经 Shiki 实机探测确认存在）。
- **欢迎页最近文件**（`store/recents.ts` + `tabs.ts` + `Welcome.tsx`）：最多 10 条、去重、损坏数据过滤，打开文件成功路径自动记录。
- **编辑器设置接线**：缩放持久化（localStorage）、字符边缘线接入设置面板（含旧数据迁移）、vimMode 死代码彻底清除。
- **导出净化**（`exporter.ts` `cleanDomForExport`）：展开全部折叠 + 移除复制/语言/折叠按钮等编辑器 UI，代码块只保留 Shiki 渲染层；导出提示接入 i18n。
- **导出 CSP 加固**（`main/ipc/export.ts`）：文档自带 CSP 一律剥离后注入严格策略（防御 `default-src *` 覆盖）。
- **i18n 收尾**：zh/en key 完全对齐；AI 面板（32 处）、命令面板导出项、showPrompt、useAppMenu、历史会话标题等全部接入字典；AI 消息新增**安全 Markdown 渲染**（AiMarkdown，纯 JSX 无 HTML 注入，支持代码块/行内代码/加粗/斜体）。
- **多格式查看器**（`editor/viewers/`）：CSV/TSV 表格（自动分隔符、引号转义、表头吸顶、500 行上限）、JSON 树（展开折叠、类型着色、3000 节点上限、解析错误提示）、PDF 内嵌预览（新增 `read_pdf_file` IPC + 25MB 上限 + `%PDF` 魔数校验 + CSP frame-src）。
- **Electron 全链路 E2E**（`e2e/electron.spec.ts` + `playwright.electron.config.mts`）：启动→开工作区→打开→编辑→保存→磁盘校验、会话恢复、未保存关闭确认三条黄金路径；沙盒无显示器未实跑，类型与 lint 已通过。

### 最终验证（第四/五批后）
- `tsc`（renderer + main）0 错误 · `eslint src` 0 告警 · **`vitest` 320/320 通过**（自 219 新增 101 个用例）
- i18n zh/en 完全对齐（无缺失/空值/重复）
- README 已同步：新功能如实记录，宏录制标注为实验性
- 未做（主观项）：视觉打磨（欢迎页信息层次、文件树图标统一）——留待有显示器环境人工确认
