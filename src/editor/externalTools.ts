/**
 * External Tools - configure and run shell commands from Textora
 * 
 * Users can configure named commands with:
 * - Command path (executable)
 * - Arguments (with variables like $FILE, $DIR, $LINE)
 * - Working directory
 * Output is displayed in a bottom panel.
 */

export interface ExternalTool {
  id: string;
  name: string;
  command: string;
  args: string[];
  cwd: string;
  shortcuts?: string;
}

const DANGEROUS_SHELL_CHARS = /[;&|`$(){}[\]<>!#*?\\]/;
const DANGEROUS_ARG_SUBSTRINGS = [';', '&&', '||', '|', '&', '`', '$(', '${', '>', '<', '\n', '\r'];
const RESERVED_COMMANDS = new Set([
  'rm', 'del', 'format', 'shutdown', 'reboot', 'mkfs', 'dd', 'diskpart', 'takeown', 'icacls', 'cacls', 'attrib',
  'cmd', 'cmd.exe', 'powershell', 'pwsh', 'bash', 'sh', 'zsh', 'csh', 'ksh', 'fish',
  'node', 'node.exe', 'python', 'python3', 'python2', 'perl', 'ruby', 'php', 'lua',
  'awk', 'gawk', 'mawk', 'sed', 'find', 'xargs', 'env', 'make', 'cmake', 'ninja',
  'git', 'git-bash', 'npm', 'npx', 'pnpm', 'yarn', 'bun', 'deno',
  'curl', 'wget', 'scp', 'rsync', 'ssh', 'telnet', 'nc', 'ncat', 'socat',
  'aria2c', 'openssl', 'certutil', 'bitsadmin',
  'mshta', 'cscript', 'wscript', 'rundll32', 'regsvr32', 'wmic', 'reg', 'regedit',
  'sudo', 'su', 'runas',
  'docker', 'podman', 'vagrant', 'wsl',
  'tar', 'unzip', 'zip', '7z', 'rar', 'gzip', 'gunzip',
]);
const SHELL_EXEC_FLAGS = new Set(['-c', '/c', '-e', '--command']);

export function validateTool(tool: ExternalTool): { valid: boolean; error?: string } {
  if (!tool.command || tool.command.trim() === '') {
    return { valid: false, error: 'Command cannot be empty' };
  }
  if (DANGEROUS_SHELL_CHARS.test(tool.command)) {
    return { valid: false, error: 'Command contains dangerous shell characters' };
  }
  const baseCmd = tool.command.split(/[\\/]/).pop()?.split('.')[0]?.toLowerCase() || '';
  if (RESERVED_COMMANDS.has(baseCmd)) {
    return { valid: false, error: `Command "${baseCmd}" is not allowed for safety` };
  }
  for (const arg of tool.args) {
    for (const sub of DANGEROUS_ARG_SUBSTRINGS) {
      if (arg.includes(sub)) {
        return { valid: false, error: `参数包含危险字符: ${sub}` };
      }
    }
    if (SHELL_EXEC_FLAGS.has(arg.toLowerCase())) {
      return { valid: false, error: `参数包含禁止的 shell 执行标志: ${arg}` };
    }
  }
  return { valid: true };
}

const TOOLS_KEY = "textora.externalTools";

export function getTools(): ExternalTool[] {
  try {
    const raw = localStorage.getItem(TOOLS_KEY);
    if (!raw) return getDefaultTools();
    return JSON.parse(raw);
  } catch {
    return getDefaultTools();
  }
}

export function saveTools(tools: ExternalTool[]): void {
  localStorage.setItem(TOOLS_KEY, JSON.stringify(tools));
}

function getDefaultTools(): ExternalTool[] {
  return [
    {
      id: "format-prettier",
      name: "Format (Prettier)",
      command: "npx",
      args: ["prettier", "--write", "$FILE"],
      cwd: "$DIR",
    },
    {
      id: "lint-eslint",
      name: "Lint (ESLint)",
      command: "npx",
      args: ["eslint", "--fix", "$FILE"],
      cwd: "$DIR",
    },
    {
      id: "git-status",
      name: "Git Status",
      command: "git",
      args: ["status"],
      cwd: "$DIR",
    },
    {
      id: "run-node",
      name: "Run (Node)",
      command: "node",
      args: ["$FILE"],
      cwd: "$DIR",
    },
  ];
}

export interface ToolRunResult {
  toolId: string;
  toolName: string;
  stdout: string;
  stderr: string;
  exitCode: number;
  duration: number;
}

export function expandArgs(args: string[], vars: Record<string, string>): string[] {
  return args.map(arg => {
    return arg.replace(/\$\{(\w+)\}|\$(\w+)/g, (match, braced, plain) => {
      const key = braced || plain;
      return vars[key] !== undefined ? vars[key] : match;
    });
  });
}

export function getCwd(cwdTemplate: string, vars: Record<string, string>): string {
  if (!cwdTemplate) return vars.DIR || process.cwd();
  if (cwdTemplate.startsWith("$")) {
    const key = cwdTemplate.slice(1);
    return vars[key] || process.cwd();
  }
  return cwdTemplate;
}
