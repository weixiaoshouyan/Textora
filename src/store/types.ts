/**
 * Store 类型定义
 *
 * �?useAppStore.ts 中提取的所有接口和类型�?
 * 便于各模块独立引用，减少循环依赖�?
 */
import type { EditorView } from "prosemirror-view";

export type ThemeMode = "light" | "dark" | "sepia" | "nord";

export type FileKind = "markdown" | "code" | "image" | "binary" | "unknown";

export interface Tab {
  id: string;
  path: string | null; // null = 未保存的新文�?
  name: string;
  kind: FileKind;
  language: string; // 高亮语言 id
  content: string; // 文本内容（markdown/code�?
  encoding: string; // "utf-8" | "gbk" | "utf-16le" ...
  lineEnding: "lf" | "crlf";
  dirty: boolean;
  imageData?: string; // base64 data URL（image 类型�?
  imageMime?: string;
  size?: number; // binary 类型
  hexPreview?: string; // binary 类型的十六进制预�?
  /** 光标位置（字符偏移），切换标签时保存/恢复，null 表示未记�?*/
  cursor?: number | null;
  /** 滚动位置（像素），切换标签时保存/恢复 */
  scrollTop?: number;
}

/** CodeEditor 向查找替换面板暴露的适配接口�?*/
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
}

export interface RecentFile {
  path: string;
  name: string;
  openedAt: number;
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
}

export interface Settings {
  autoSaveSeconds: number; // 0 表示关闭
  fontSize: number;
  fontFamily: string;
  focusMode: boolean;
  typewriterMode: boolean;
  sourceMode: boolean;
  readingMode: boolean; // 阅读模式：只�?
  spellcheck: boolean; // 拼写检�?
  sidebarVisible: boolean;
  outlineVisible: boolean;
  sidebarWidth: number; // 侧边栏宽度（px�?
}

export interface AppState {
  // ===== 多标�?=====
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

  // 最近文�?
  recentFiles: RecentFile[];

  // 工作区（文件树）
  workspaceRoot: string | null;
  entriesByDir: Record<string, DirEntry[]>;
  expanded: Record<string, boolean>;
  selectedPath: string | null;
  watchId: string | null;

  // 自动保存计时�?
  autoSaveTimer: number | null;

  // 设置
  settings: Settings;

  // 文件外部修改提示
  externalChanges: Record<string, FsChangeEvent>;

  // UI 面板状�?
  findReplaceOpen: boolean;
  setFindReplaceOpen: (open: boolean) => void;
  quickOpenOpen: boolean;
  setQuickOpenOpen: (open: boolean) => void;
  searchInFilesOpen: boolean;
  setSearchInFilesOpen: (open: boolean) => void;
  commandPaletteOpen: boolean;
  setCommandPaletteOpen: (open: boolean) => void;
  diffViewOpen: boolean;
  setDiffViewOpen: (open: boolean) => void;
  pendingConfirm: PendingConfirm | null;
  clearPendingConfirm: () => void;
  settingsPanelOpen: boolean;
  setSettingsPanelOpen: (open: boolean) => void;

  // 分屏视图
  splitViewOpen: boolean;
  toggleSplitView: () => void;

  // 编辑�?
  editorView: EditorView | null;
  setEditorView: (v: EditorView | null) => void;

  // AI 助手
  
  // ===== AI 聊天会话 =====
  aiSessions: import("./useAppStore").ChatSession[];
  aiActiveSessionId: string | null;
  createAiSession: (projectDir?: string) => string;
  deleteAiSession: (id: string) => void;
  setAiActiveSession: (id: string | null) => void;
  aiAssistantOpen: boolean;
  setAiAssistantOpen: (open: boolean) => void;

  // CodeEditor 适配
  codeEditorApi: CodeEditorApi | null;
  setCodeEditorApi: (api: CodeEditorApi | null) => void;
  isCodeEditorActive: () => boolean;
  saveCursorState: () => void;

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

  pushRecent: (path: string) => void;

  // 工作�?
  openWorkspace: (dir: string) => Promise<void>;
  closeWorkspace: () => void;
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
