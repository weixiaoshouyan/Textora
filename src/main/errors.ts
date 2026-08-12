/**
 * 全局错误码定义
 *
 * 统一管理系统中所有错误码，避免魔法字符串，提高类型安全和可维护性。
 */

export const enum ErrorCode {
  // ===== 路径相关 =====
  /** 路径格式无效 */
  INVALID_PATH = 'INVALID_PATH',
  /** 工作区未设置 */
  WORKSPACE_NOT_SET = 'WORKSPACE_NOT_SET',
  /** 路径超出工作区边界 */
  WORKSPACE_ESCAPE = 'WORKSPACE_ESCAPE',
  /** 符号链接指向工作区外部 */
  SYMLINK_ESCAPE = 'SYMLINK_ESCAPE',
  /** 路径不是目录 */
  NOT_DIRECTORY = 'NOT_DIRECTORY',

  // ===== 文件大小 =====
  /** 文件超过大小限制 */
  SIZE_LIMIT = 'SIZE_LIMIT',

  // ===== 参数校验 =====
  /** 参数无效 */
  INVALID_ARGUMENT = 'INVALID_ARGUMENT',

  // ===== 工具执行 =====
  /** 命令被安全策略阻止 */
  TOOL_BLOCKED = 'TOOL_BLOCKED',
  /** 命令执行超时 */
  TOOL_TIMEOUT = 'TOOL_TIMEOUT',

  // ===== 网络请求 =====
  /** URL 因安全原因被阻止 */
  FETCH_BLOCKED = 'FETCH_BLOCKED',
  /** 网络请求超时 */
  FETCH_TIMEOUT = 'FETCH_TIMEOUT',
  /** 网络请求失败 */
  FETCH_FAILED = 'FETCH_FAILED',

  // ===== 文件操作 =====
  /** 文件写入失败 */
  WRITE_FAILED = 'WRITE_FAILED',
  /** 文件读取失败 */
  READ_FAILED = 'READ_FAILED',
  /** 文件已被其他程序锁定 */
  FILE_LOCKED = 'FILE_LOCKED',

  // ===== 编码相关 =====
  /** 不支持的编码 */
  UNSUPPORTED_ENCODING = 'UNSUPPORTED_ENCODING',
  /** 编码检测失败 */
  ENCODING_DETECTION_FAILED = 'ENCODING_DETECTION_FAILED',
}

/** 错误码对应的默认错误消息 */
export const ERROR_MESSAGES: Record<ErrorCode, string> = {
  [ErrorCode.INVALID_PATH]: '路径无效，请检查路径格式',
  [ErrorCode.WORKSPACE_NOT_SET]: '工作区未设置，请先打开一个文件夹',
  [ErrorCode.WORKSPACE_ESCAPE]: '无法访问工作区外的文件',
  [ErrorCode.SYMLINK_ESCAPE]: '符号链接指向工作区外部',
  [ErrorCode.NOT_DIRECTORY]: '指定路径不是目录',
  [ErrorCode.SIZE_LIMIT]: '文件超过大小限制',
  [ErrorCode.INVALID_ARGUMENT]: '参数无效',
  [ErrorCode.TOOL_BLOCKED]: '该命令出于安全原因被阻止',
  [ErrorCode.TOOL_TIMEOUT]: '命令执行超时',
  [ErrorCode.FETCH_BLOCKED]: '该 URL 因安全原因无法访问',
  [ErrorCode.FETCH_TIMEOUT]: '网络请求超时',
  [ErrorCode.FETCH_FAILED]: '网络请求失败',
  [ErrorCode.WRITE_FAILED]: '文件写入失败',
  [ErrorCode.READ_FAILED]: '文件读取失败',
  [ErrorCode.FILE_LOCKED]: '文件已被其他程序锁定',
  [ErrorCode.UNSUPPORTED_ENCODING]: '不支持的编码格式',
  [ErrorCode.ENCODING_DETECTION_FAILED]: '编码检测失败',
};

/** 错误码对应的英文错误消息 */
export const ERROR_MESSAGES_EN: Record<ErrorCode, string> = {
  [ErrorCode.INVALID_PATH]: 'Invalid path, please check the path format',
  [ErrorCode.WORKSPACE_NOT_SET]: 'Workspace not set, please open a folder first',
  [ErrorCode.WORKSPACE_ESCAPE]: 'Cannot access files outside workspace',
  [ErrorCode.SYMLINK_ESCAPE]: 'Symlink points outside workspace',
  [ErrorCode.NOT_DIRECTORY]: 'The specified path is not a directory',
  [ErrorCode.SIZE_LIMIT]: 'File exceeds size limit',
  [ErrorCode.INVALID_ARGUMENT]: 'Invalid argument',
  [ErrorCode.TOOL_BLOCKED]: 'Command blocked for security reasons',
  [ErrorCode.TOOL_TIMEOUT]: 'Command execution timed out',
  [ErrorCode.FETCH_BLOCKED]: 'URL cannot be accessed for security reasons',
  [ErrorCode.FETCH_TIMEOUT]: 'Network request timed out',
  [ErrorCode.FETCH_FAILED]: 'Network request failed',
  [ErrorCode.WRITE_FAILED]: 'File write failed',
  [ErrorCode.READ_FAILED]: 'File read failed',
  [ErrorCode.FILE_LOCKED]: 'File is locked by another program',
  [ErrorCode.UNSUPPORTED_ENCODING]: 'Unsupported encoding',
  [ErrorCode.ENCODING_DETECTION_FAILED]: 'Encoding detection failed',
};

/**
 * 创建结构化错误
 */
export function createError(code: ErrorCode, message?: string): AppError {
  const error = new Error(message || ERROR_MESSAGES[code]) as AppError;
  error.code = code;
  error.errorCode = code;
  return error;
}

/**
 * 应用错误类型
 */
export interface AppError extends Error {
  code: ErrorCode;
  errorCode: ErrorCode;
}

/**
 * 判断错误是否为应用错误
 */
export function isAppError(error: unknown): error is AppError {
  return error instanceof Error && 'code' in error && typeof (error as AppError).code === 'string';
}

/**
 * 获取错误码（从错误对象中提取）
 */
export function getErrorCode(error: unknown): ErrorCode | null {
  if (isAppError(error)) {
    return error.code;
  }
  return null;
}

/**
 * 判断错误是否可重试
 */
export function isRetryableError(code: ErrorCode): boolean {
  const retryableCodes = new Set<ErrorCode>([
    ErrorCode.WRITE_FAILED,
    ErrorCode.READ_FAILED,
    ErrorCode.FETCH_TIMEOUT,
    ErrorCode.FETCH_FAILED,
    ErrorCode.FILE_LOCKED,
    ErrorCode.TOOL_TIMEOUT,
  ]);
  return retryableCodes.has(code);
}

/**
 * 获取 Node.js 错误码对应的应用错误码
 */
export function mapNodeErrorToCode(nodeCode: string | undefined): ErrorCode {
  if (!nodeCode) return ErrorCode.READ_FAILED;

  const mapping: Record<string, ErrorCode> = {
    EACCES: ErrorCode.TOOL_BLOCKED,
    EPERM: ErrorCode.TOOL_BLOCKED,
    EISDIR: ErrorCode.INVALID_PATH,
    ENOTDIR: ErrorCode.INVALID_PATH,
    ENOENT: ErrorCode.INVALID_PATH,
    EEXIST: ErrorCode.WRITE_FAILED,
    EAGAIN: ErrorCode.FILE_LOCKED,
    EBUSY: ErrorCode.FILE_LOCKED,
    ETIMEDOUT: ErrorCode.FETCH_TIMEOUT,
    ECONNRESET: ErrorCode.FETCH_FAILED,
    ECONNREFUSED: ErrorCode.FETCH_FAILED,
    EIO: ErrorCode.READ_FAILED,
    ENOSPC: ErrorCode.WRITE_FAILED,
    EMFILE: ErrorCode.WRITE_FAILED,
    ENFILE: ErrorCode.WRITE_FAILED,
  };

  return mapping[nodeCode] || ErrorCode.READ_FAILED;
}
