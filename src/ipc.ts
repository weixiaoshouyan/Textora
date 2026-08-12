/**
 * Textora 前端 IPC 兼容层
 *
 * 背景：Textora 从 Tauri 迁移到 Electron。前端业务代码原本使用
 * @tauri-apps/api 的 invoke / listen，以及 @tauri-apps/plugin-dialog 的
 * open / save。本文件通过 preload 暴露的 window.textora 接口重新实现
 * 这些 API，保持与原 Tauri 签名兼容，从而使前端业务代码改动最小。
 */

// ---- window.textora 类型声明 ----
declare global {
  interface Window {
    textora: {
      invoke: (cmd: string, ...args: any[]) => Promise<any>;
      on: (event: string, cb: (...args: any[]) => void) => () => void;
      emit: (event: string, payload?: any) => void;
      log: (level: 'info' | 'warn' | 'error', message: string, extra?: unknown) => void;
      dialog: {
        open: (opts: any) => Promise<any>;
        save: (opts: any) => Promise<any>;
        // dialog_message handler 返回 boolean（true=确认，false=取消）
        message: (opts: any) => Promise<boolean>;
      };
      window: {
        minimize: () => void;
        maximizeToggle: () => void;
        close: () => void;
        setTitle: (t: string) => void;
      };
      /** 拖拽文件时获取真实路径（webUtils.getPathForFile 的 bridge 包装） */
      getPathForFile: (file: unknown) => string;
    };
  }
}

// ---- 命令参数顺序映射表 ----
const CMD_ARGS: Record<string, string[]> = {
  read_text_file: ["path"],
  write_text_file: ["path", "contents"],
  is_file_exists: ["path"],
  create_file: ["path"],
  list_dir: ["path"],
  create_dir: ["path"],
  rename_path: ["from", "to"],
  remove_path: ["path"],
  watch_dir: ["id", "path"],
  set_workspace_root: ["path"],
  stop_watch: ["id"],
  save_base64_file: ["dir", "filename", "data_base64"],
  write_binary_file: ["path", "bytes"],
  read_binary_file: ["path"],
  make_image_filename: ["ext"],
  is_directory: ["path"],
  list_md_files: ["root"],
  search_in_files: ["root", "query", "useRegex", "caseSensitive", "fileFilter", "excludeDirs"],
  run_tool: ["tool", "vars"],
  open_file: ["path", "force_encoding"],
  write_file: ["path", "text", "encoding", "line_ending"],
  list_all_files: ["root"],
  open_file_location: ["path"],
  store_secret: ["key", "value"],
  read_secret: ["key"],
  delete_secret: ["key"],
  export_pdf: ["html", "target_path"],
  export_png: ["html", "target_path"],
  get_recent_lines: ["lines"],
};

import type { IpcCommands } from "./ipcTypes";

/**
 * 类型安全的 IPC invoke。
 * 当 cmd 为 IpcCommands 中已定义的命令时，自动推导参数和返回值类型；
 * 对于未收录的命令仍允许泛型回退。
 */
export async function invoke<K extends keyof IpcCommands>(
  cmd: K,
  args?: IpcCommands[K]["args"]
): Promise<IpcCommands[K]["result"]>;
export async function invoke<T = unknown>(
  cmd: string,
  args?: Record<string, unknown>
): Promise<T>;
export async function invoke(
  cmd: string,
  args?: Record<string, unknown>
): Promise<unknown> {
  const api = window.textora;
  if (args === undefined || args === null) {
    return api.invoke(cmd);
  }
  const order = CMD_ARGS[cmd];
  if (order && order.length > 0) {
    const argArray = order.map((name) => (args as Record<string, unknown>)[name]);
    return api.invoke(cmd, ...argArray);
  }
  return api.invoke(cmd, args);
}

export async function listen<T = any>(
  event: string,
  cb: (event: { payload: T }) => void
): Promise<() => void> {
  return window.textora.on(event, (payload: any) => {
    cb({ payload: payload as T });
  });
}

export async function openDialog(
  options: any
): Promise<string | string[] | null> {
  return window.textora.dialog.open(options);
}

export async function saveDialog(options: any): Promise<string | null> {
  return window.textora.dialog.save(options);
}

export async function emit(event: string, payload?: any): Promise<void> {
  window.textora.emit(event, payload);
}

/** 读取主进程的应用版本号（package.json 的 version） */
export async function getAppVersion(): Promise<string> {
  return invoke("get_app_version");
}

/** 获取系统语言（Electron app.getLocale()） */
export async function getSystemLocale(): Promise<string> {
  return invoke("get_system_locale");
}

/** 获取日志文件路径 */
export async function getLogPath(): Promise<string> {
  return invoke("get_log_path");
}

/** 获取最近的日志行 */
export async function getRecentLogs(lines?: number): Promise<string> {
  return invoke("get_recent_lines", lines !== undefined ? { lines } : undefined);
}

/** 获取系统信息（用于调试和崩溃报告） */
export async function getSystemInfo(): Promise<{
  appVersion: string;
  electronVersion: string;
  chromiumVersion: string;
  platform: string;
  osRelease: string;
  arch: string;
  cpuCount: number;
  cpuModel: string;
  totalMemoryGB: number;
  freeMemoryGB: number;
  uptime: number;
}> {
  return invoke("get_system_info");
}

export async function message(
  text: string,
  options?: { title?: string; kind?: "info" | "warning" | "error" } | string
): Promise<boolean> {
  const title =
    typeof options === "string"
      ? options
      : options?.title || "Textora";
  const kind =
    typeof options === "object" && options?.kind ? options.kind : "info";
  // dialog_message handler 返回 boolean（true=确认，false=取消）
  const confirmed: boolean = await window.textora.dialog.message({
    message: text,
    title,
    type: kind,
  });
  return confirmed;
}

/** 新建窗口 */
export function newWindow(): void {
  // preload 的 emit 会自动加 textora: 前缀，这里传不带前缀的通道名
  window.textora.emit("window-new");
}

/** 切换窗口始终置顶状态 */
export async function toggleAlwaysOnTop(): Promise<boolean> {
  return invoke("window-toggle-always-on-top");
}

/** 获取当前窗口数量 */
export async function getWindowCount(): Promise<number> {
  return invoke("window-count");
}

export async function readTextFile(path: string): Promise<string> {
  return invoke("read_text_file", { path });
}

export interface FileInfo {
  path: string;
  name: string;
  dir: string;
  ext: string;
  size: number;
  sizeFormatted: string;
  created: string;
  modified: string;
  accessed: string;
  isFile: boolean;
  isDirectory: boolean;
  isSymbolicLink: boolean;
  encoding?: string;
  lineCount?: number;
  wordCount?: number;
  charCount?: number;
}

/** 获取文件详细信息 */
export async function getFileInfo(path: string): Promise<FileInfo> {
  return invoke("get_file_info", { path });
}
