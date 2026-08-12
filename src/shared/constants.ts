/**
 * 系统常量定义（主进程 / 渲染进程共享）
 *
 * 集中管理所有魔法数字和配置项，提高可维护性和可配置性。
 * 主进程通过 src/main/constants.ts re-export 保持旧导入路径兼容。
 */

/** 文件大小限制（字节） */
export const FILE_SIZE_LIMITS = {
  /** 文本文件最大 20MB */
  TEXT_MAX_SIZE: 20 * 1024 * 1024,
  /** 图片文件最大 50MB */
  IMAGE_MAX_SIZE: 50 * 1024 * 1024,
  /** 二进制文件最大 50MB */
  BINARY_MAX_SIZE: 50 * 1024 * 1024,
} as const;

/** 目录列表限制 */
export const DIR_LISTING = {
  /** 单次目录列表最大条目数 */
  MAX_ENTRIES: 1000,
  /** 目录重载防抖时间（毫秒） */
  DEBOUNCE_MS: 300,
} as const;

/** 文件监听配置 */
export const WATCHER = {
  /** 文件事件防抖时间（毫秒） */
  DEBOUNCE_MS: 300,
  /** 自写入冷却时间（毫秒），在此期间忽略自身写入事件 */
  SELF_WRITE_COOLDOWN_MS: 1000,
} as const;

/** 子进程执行限制 */
export const PROCESS_LIMITS = {
  /** 子进程超时时间（毫秒） */
  TIMEOUT_MS: 30_000,
  /** stdout/stderr 输出上限（字节） */
  OUTPUT_MAX_BYTES: 1024 * 1024,
  /** 超时后 SIGKILL 前等待时间（毫秒） */
  SIGKILL_GRACE_MS: 5000,
} as const;

/** 网络请求限制 */
export const FETCH_LIMITS = {
  /** 请求超时时间（毫秒） */
  TIMEOUT_MS: 30_000,
  /** 响应体大小上限（字节） */
  SIZE_MAX_BYTES: 5 * 1024 * 1024,
} as const;

/** 会话恢复限制 */
export const SESSION_RESTORE = {
  /** 最大恢复标签数 */
  MAX_TABS: 8,
  /** 恢复文件大小上限（字节），超过则跳过 */
  MAX_FILE_SIZE: 2 * 1024 * 1024,
} as const;

/** 窗口加载配置 */
export const WINDOW_LOAD = {
  /** 强制显示窗口超时时间（毫秒） */
  FORCE_SHOW_TIMEOUT_MS: 8000,
} as const;

/** 高频目录（不触发文件树重载） */
export const HIGH_FREQ_DIRS = new Set([
  'node_modules',
  '.git',
  '.svn',
  '.hg',
  'dist',
  'build',
  'target',
  '.next',
  '.nuxt',
  '.cache',
  '.tmp',
  'tmp',
  'out',
  'coverage',
]);

/** 危险 shell 字符正则（含换行符、引号、管道、反引号、命令替换、重定向） */
export const DANGEROUS_SHELL_CHARS = /[;&|`$(){}[\]<>!#*?\\\n\r"'`]/;

/** 保留命令黑名单（含 shell 解释器、脚本语言、网络下载工具、包管理器、代码执行载体） */
export const RESERVED_COMMANDS = new Set([
  // 文件删除 / 系统破坏
  'rm', 'del', 'format', 'shutdown', 'reboot', 'mkfs', 'dd', 'diskpart', 'takeown', 'icacls', 'cacls', 'attrib',
  // shell 解释器（可通过 -c/-e 执行任意代码）
  'cmd', 'cmd.exe', 'powershell', 'pwsh', 'bash', 'sh', 'zsh', 'csh', 'ksh', 'fish',
  // 脚本语言（可通过 -e/-c 执行任意代码）
  'node', 'node.exe', 'python', 'python3', 'python2', 'perl', 'ruby', 'php', 'lua',
  // 代码执行载体：awk/sed -e 与 find -exec / xargs / env / make 均可执行任意命令
  'awk', 'gawk', 'mawk', 'sed', 'find', 'xargs', 'env', 'make', 'cmake', 'ninja',
  // 包管理器：npx --yes 可拉取并执行任意 npm 包；git 可写 hooks / config 提权
  'git', 'git-bash', 'npm', 'npx', 'pnpm', 'yarn', 'bun', 'deno',
  // 网络下载/穿透工具
  'curl', 'wget', 'scp', 'rsync', 'ssh', 'telnet', 'nc', 'ncat', 'socat',
  'aria2c', 'openssl', 'certutil', 'bitsadmin',
  // Windows 脚本宿主 / 进程注入载体
  'mshta', 'cscript', 'wscript', 'rundll32', 'regsvr32', 'wmic', 'reg', 'regedit',
  // 提权工具
  'sudo', 'su', 'runas',
  // 容器 / 虚拟机 / WSL（可脱离沙箱执行）
  'docker', 'podman', 'vagrant', 'wsl',
  // 压缩包解压（路径穿越 / 覆盖文件）
  'tar', 'unzip', 'zip', '7z', 'rar', 'gzip', 'gunzip',
]);

/** 命令参数中禁止出现的子串（命令链接符 + 命令替换） */
export const DANGEROUS_ARG_SUBSTRINGS = [';', '&&', '||', '|', '&', '`', '$(', '${', '>', '<', '\n', '\r'];

/** 解释器执行标志：独立参数命中即拒绝（防 vars 注入把 -c/-e 塞给白名单命令） */
export const SHELL_EXEC_FLAGS = new Set([
  '-c', '-e', '-E', '--eval', '--command', '-Command', '/c', '/k',
  '-EncodedCommand', '-enc', '-i', '-interactive', '-nop', '-noprofile',
]);

/** 编码白名单 */
export const ALLOWED_ENCODINGS = new Set([
  'utf-8',
  'utf-8-bom',
  'latin1',
  'gbk',
  'gb2312',
  'utf-16le',
  'utf-16be',
  'ascii',
  'binary',
]);

/** 重试配置 */
export const RETRY = {
  /** 最大重试次数 */
  MAX_ATTEMPTS: 3,
  /** 基础延迟时间（毫秒） */
  BASE_DELAY_MS: 100,
  /** 最大延迟时间（毫秒） */
  MAX_DELAY_MS: 2000,
} as const;

/** 可重试的 Node.js 错误码 */
export const RETRYABLE_ERROR_CODES = new Set([
  'EAGAIN',      // 资源暂时不可用
  'EBUSY',       // 资源忙
  'ETIMEDOUT',   // 超时
  'ECONNRESET',  // 连接重置
  'EIO',         // IO 错误
]);
