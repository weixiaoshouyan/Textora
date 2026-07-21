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
      dialog: {
        open: (opts: any) => Promise<any>;
        save: (opts: any) => Promise<any>;
        message: (opts: any) => Promise<number>;
      };
      window: {
        minimize: () => void;
        maximizeToggle: () => void;
        close: () => void;
        setTitle: (t: string) => void;
      };
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
  const result: number = await window.textora.dialog.message({
    message: text,
    title,
    type: kind,
  });
  return result === 0;
}

export async function readTextFile(path: string): Promise<string> {
  return invoke("read_text_file", { path });
}
