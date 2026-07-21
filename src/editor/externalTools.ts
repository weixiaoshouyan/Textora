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
  args: string[]; // e.g., ["$FILE", "--format"]
  cwd: string; // variable like "$DIR" or absolute path
  shortcuts?: string; // optional keyboard shortcut
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
    let expanded = arg;
    for (const [key, value] of Object.entries(vars)) {
      expanded = expanded.replace(new RegExp("\\\$" + key, "g"), value);
    }
    return expanded;
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
