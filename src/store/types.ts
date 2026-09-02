/**
 * Store 类型定义
 *
 * 从 useAppStore.ts 中提取的所有接口和类型
 * 便于各模块独立引用，减少循环依赖
 */
import type { EditorView } from "prosemirror-view";
import type { ChatMessage } from "../ai/aiService";

export type ThemeMode = "light" | "dark" | "sepia" | "nord";

export type FileKind = "markdown" | "code" | "image" | "binary" | "unknown";

export interface Tab {
  id: string;
  path: string | null; // null = 未保存的新文件
  name: string;
  kind: FileKind;
  language: string; // 高亮语言 id
  content: string; // 文本内容（markdown/code）
  encoding: string; // "utf-8" | "gbk" | "utf-16le" ...
  lineEnding: "lf" | "crlf";
  dirty: boolean;
  /** Monotonic in-memory revision used to guard asynchronous saves. */
  revision: number;
  imageData?: string; // base64 data URL（image 类型）
  imageMime?: string;
  size?: number; // binary 类型
  hexPreview?: string; // binary 类型的十六进制预览
  /** 光标位置（字符偏移），切换标签时保存/恢复，null 表示未记录 */
  cursor?: number | null;
  /** 滚动位置（像素），切换标签时保存/恢复 */
  scrollTop?: number;
}

/** CodeEditor 向查找替换面板暴露的适配接口 */
export interface CodeEditorApi {
  getText: () => string;
  setText: (t: string) => void;
  getAllMatches: (
    query: string,
    opts: { regex: boolean; caseSensitive: boolean }
  ) => { from: number; to: number }[];
  select: (from: number, to: number) => void;
  replaceRange: (from: number, to: number, text: string) => void;
  focus: () => void;
}

export interface PendingConfirm {
  title: string;
  message: string;
  onSave: () => void;
  onDiscard: () => void;
  onCancel: () => void;
  /** 按钮文案覆盖（默认取 i18n 的 unsaved.*） */
  saveLabel?: string;
  discardLabel?: string;
  cancelLabel?: string;
}

export interface DirEntry {
  name: string;
  path: string;
  is_dir: boolean;
  is_file: boolean;
  size: number;
}

export interface FsChangeEvent {
  kind: string;
  path: string;
  eventType?: string;
  id?: string;
  source?: "external" | "self";
}

/** AI 聊天会话（持久化于 localStorage） */
export interface ChatSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  projectDir: string;
  createdAt: number;
  updatedAt: number;
}

export interface Settings {
  autoSaveSeconds: number; // 0 表示关闭
  fontSize: number;
  fontFamily: string;
  focusMode: boolean;
  typewriterMode: boolean;
  sourceMode: boolean;
  readingMode: boolean; // 阅读模式：只读
  spellcheck: boolean; // 拼写检查
  sidebarVisible: boolean;
  outlineVisible: boolean;
  sidebarWidth: number; // 侧边栏宽度（px）
  /** 源码编辑器的字符边缘线列数；0（或缺失）= 关闭 */
  edgeColumn?: number;
  pdfHeader?: boolean; // 导出 PDF 时显示页眉（文件名）
  pdfFooter?: boolean; // 导出 PDF 时显示页码
}

/** 欢迎页「最近打开的文件」条目（持久化于 localStorage） */
export interface RecentFile {
  path: string;
  name: string;
  /** 最近一次成功打开的时间戳（ms） */
  openedAt: number;
}

export interface AppState {
  // ===== 多标签 =====
  tabs: Tab[];
  activeTabId: string | null;

  // 活动文档镜像
  currentPath: string | null;
  currentName: string;
  content: string;
  dirty: boolean;
  editing: boolean;

  // 主题
  theme: ThemeMode;

  // 工作区（文件树）
  workspaceRoot: string | null;
  entriesByDir: Record<string, DirEntry[]>;
  expanded: Record<string, boolean>;
  selectedPath: string | null;
  watchId: string | null;

  // 自动保存计时器
  /** @deprecated Autosave scheduling lives in useAutoSave; retained for API compatibility. */
  autoSaveTimer: number | null;

  // 设置
  settings: Settings;

  // 文件外部修改提示
  externalChanges: Record<string, FsChangeEvent>;

  // UI 面板状态
  findReplaceOpen: boolean;
  setFindReplaceOpen: (open: boolean) => void;
  /** 外部（如跨文件搜索面板）预填的查找词：FindReplace 打开时消费并清空 */
  findReplaceInitialQuery: string | null;
  setFindReplaceInitialQuery: (q: string | null) => void;
  quickOpenOpen: boolean;
  setQuickOpenOpen: (open: boolean) => void;
  searchInFilesOpen: boolean;
  setSearchInFilesOpen: (open: boolean) => void;
  commandPaletteOpen: boolean;
  setCommandPaletteOpen: (open: boolean) => void;
  diffViewOpen: boolean;
  setDiffViewOpen: (open: boolean) => void;
  /** 外部变更对比请求：磁盘版本 vs 当前编辑版本（DiffView 消费后清空） */
  pendingExternalDiff: { path: string; diskText: string } | null;
  setPendingExternalDiff: (v: { path: string; diskText: string } | null) => void;
  graphViewOpen: boolean;
  setGraphViewOpen: (open: boolean) => void;
  pendingConfirm: PendingConfirm | null;
  clearPendingConfirm: () => void;
  /** 窗口关闭确认链状态：closing 表示 closeAllTabs 确认链进行中（此时清 pendingConfirm 不应触发 close-cancel） */
  closeFlow: "idle" | "closing";
  setCloseFlow: (v: "idle" | "closing") => void;
  settingsPanelOpen: boolean;
  setSettingsPanelOpen: (open: boolean) => void;

  // 分屏视图
  splitViewOpen: boolean;
  toggleSplitView: () => void;

  // 编辑器
  editorView: EditorView | null;
  setEditorView: (v: EditorView | null) => void;
  /** Milkdown 注册的高效 markdown 插入函数（仅解析新内容，避免全量 re-parse） */
  insertMarkdownFn: ((markdown: string) => void) | null;
  setInsertMarkdownFn: (fn: ((markdown: string) => void) | null) => void;
  /** Milkdown 注册的「在光标/选区处插入 markdown」函数：parser 解析为真实节点后
   *  replaceSelection（右键插入表格/任务列表等使用）。返回 false 表示未就绪或解析失败。 */
  insertMarkdownAtSelectionFn: ((markdown: string) => boolean) | null;
  setInsertMarkdownAtSelectionFn: (fn: ((markdown: string) => boolean) | null) => void;
  /** 向当前文档末尾追加 markdown；若 Milkdown 未就绪则回退到 setContent */
  insertMarkdownAtCursor: (markdown: string) => void;

  // AI 助手
  
  // ===== AI 聊天会话 =====
  aiSessions: ChatSession[];
  aiActiveSessionId: string | null;
  createAiSession: (projectDir?: string) => string;
  deleteAiSession: (id: string) => void;
  setAiActiveSession: (id: string | null) => void;
  updateAiSessionMessages: (id: string, messages: ChatMessage[]) => void;
  aiAssistantOpen: boolean;
  setAiAssistantOpen: (open: boolean) => void;

  // CodeEditor 适配
  codeEditorApi: CodeEditorApi | null;
  setCodeEditorApi: (api: CodeEditorApi | null) => void;
  isCodeEditorActive: () => boolean;
  saveCursorState: () => void;

  // 崩溃恢复提示：上次会话有未保存修改被恢复（可见可弃，而非静默覆盖磁盘）
  restoredDirtyTabs: Array<{ id: string; path: string }>;
  /** 收起提示条（修改仍保留在标签中，由用户自行决定保存时机） */
  dismissRestoredDirty: () => void;
  /** 丢弃恢复的未保存修改：从磁盘重新加载这些标签，回到磁盘内容 */
  discardRestoredDirty: () => Promise<void>;

  // 跳转到行
  pendingJumpLine: number | null;
  requestJumpLine: (line: number) => void;
  clearJumpLine: () => void;

  // 操作
  newFile: () => void;
  openFile: () => Promise<void>;
  openPath: (path: string) => Promise<void>;
  openPathAtLine: (path: string, line: number) => Promise<void>;
  saveFile: () => Promise<void>;
  saveFileAs: () => Promise<void>;
  saveTab: (id: string) => Promise<void>;
  saveTabAs: (id: string) => Promise<void>;
  closeTab: (id: string) => void;
  _removeTab: (id: string) => void;
  setActiveTab: (id: string) => void;
  setContent: (content: string) => void;
  markClean: () => void;
  reorderTabs: (fromId: string, toId: string) => void;
  closeOtherTabs: (id: string) => void;
  closeAllTabs: () => void;

  setTheme: (theme: ThemeMode) => void;
  toggleTheme: () => void;

  // 工作区
  openWorkspace: (dir: string) => Promise<void>;
  closeWorkspace: () => void;
  /** 清理工作区相关全部状态（watcher/主进程 root/文件树/持久化），恢复到无工作区的一致状态 */
  resetWorkspaceState: () => void;
  toggleExpanded: (path: string) => Promise<void>;
  loadDir: (path: string) => Promise<void>;
  selectPath: (path: string) => void;

  // 文件操作
  createNewFile: (dir: string, name: string) => Promise<string | null>;
  createNewFolder: (dir: string, name: string) => Promise<void>;
  renameItem: (from: string, to: string) => Promise<void>;
  removeItem: (path: string) => Promise<void>;
  checkBeforeOpen: (path: string) => Promise<boolean>;

  // 编码 / 行尾
  setActiveEncoding: (enc: string, reload?: boolean) => Promise<void>;
  setActiveLineEnding: (le: "lf" | "crlf") => void;

  // 设置
  updateSettings: (patch: Partial<Settings>) => void;
  toggleFocus: () => void;
  toggleTypewriter: () => void;
  toggleSource: () => void;
  toggleReading: () => void;
  toggleSpellcheck: () => void;
  toggleSidebar: () => void;
  toggleOutline: () => void;

  // ===== AI 多供应商配置 =====
  aiProviders: import("../ai/config").ProviderConfig[];
  aiActiveProviderId: string | null;
  addAiProvider: (templateId: string, label: string, apiKey: string, model?: string) => void;
  removeAiProvider: (id: string) => void;
  updateAiProvider: (id: string, patch: Partial<import("../ai/config").ProviderConfig>) => void;
  setAiActiveProvider: (id: string | null) => void;
  getActiveAiProvider: () => import("../ai/config").ProviderConfig | null;
  loadAiProviders: () => void;

  // 启动 hook
  init: () => Promise<() => void>;
}
