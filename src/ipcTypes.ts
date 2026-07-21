/**
 * IPC 命令类型定义
 *
 * 为所有 Electron IPC 命令提供请求/响应类型，
 * 消除前端 invoke 调用中的 any 类型。
 */

// ===== 文件操作 =====

export interface DirEntryDto {
  name: string;
  path: string;
  is_dir: boolean;
  size: number;
}

export interface OpenFileResult {
  path: string;
  name: string;
  kind: "markdown" | "code" | "image" | "binary" | "unknown";
  language: string;
  encoding: string;
  line_ending: "lf" | "crlf" | "cr";
  text?: string;
  data_base64?: string;
  mime?: string;
  size?: number;
  hex_preview?: string;
}

export interface MdFileItem {
  name: string;
  path: string;
  rel_path: string;
}

export interface SearchMatch {
  path: string;
  name: string;
  line: number;
  column: number;
  preview: string;
}

export interface AllFileItem {
  name: string;
  path: string;
  rel_path: string;
  size: number;
  is_dir: boolean;
}

// ===== IPC 命令映射（命令名 → 参数 → 返回值） =====

export interface IpcCommands {
  // 文件读写
  read_text_file: { args: { path: string }; result: string };
  write_text_file: { args: { path: string; contents: string }; result: void };
  is_file_exists: { args: { path: string }; result: boolean };
  create_file: { args: { path: string }; result: void };
  list_dir: { args: { path: string }; result: DirEntryDto[] };
  create_dir: { args: { path: string }; result: void };
  rename_path: { args: { from: string; to: string }; result: void };
  remove_path: { args: { path: string }; result: void };

  // 文件监听
  watch_dir: { args: { id: string; path: string }; result: void };
  stop_watch: { args: { id: string }; result: void };
  set_workspace_root: { args: { path: string | null }; result: void };

  // 文件打开/保存（高级）
  open_file: { args: { path: string; force_encoding?: string }; result: OpenFileResult };
  write_file: {
    args: { path: string; text: string; encoding: string; line_ending: string };
    result: void;
  };

  // 图片/二进制
  save_base64_file: { args: { dir: string; filename: string; data_base64: string }; result: string };
  write_binary_file: { args: { path: string; bytes: number[] }; result: void };
  read_binary_file: { args: { path: string }; result: string };
  make_image_filename: { args: { ext: string }; result: string };

  // 搜索
  list_md_files: { args: { root: string }; result: MdFileItem[] };
  list_all_files: { args: { root: string }; result: AllFileItem[] };
  search_in_files: {
    args: { root: string; query: string; use_regex: boolean; case_sensitive: boolean };
    result: SearchMatch[];
  };

  // 导出
  export_pdf: { args: { html: string; target_path: string }; result: void };
  export_png: { args: { html: string; target_path: string }; result: void };

  // 安全存储
  store_secret: { args: { key: string; value: string }; result: void };
  read_secret: { args: { key: string }; result: string | null };
  delete_secret: { args: { key: string }; result: void };

  // 其他
  get_app_version: { args: Record<string, never>; result: string };
  get_system_locale: { args: Record<string, never>; result: string };
  get_log_path: { args: Record<string, never>; result: string };
  open_file_location: { args: { path: string }; result: void };
}

/** 类型安全的 invoke 函数签名 */
export type TypedInvoke = <K extends keyof IpcCommands>(
  cmd: K,
  args?: IpcCommands[K]["args"]
) => Promise<IpcCommands[K]["result"]>;
