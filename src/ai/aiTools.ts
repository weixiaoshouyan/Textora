import { invoke } from "../ipc";

export const aiToolsDefinition = [
  {
    type: "function",
    function: {
      name: "read_file",
      description: "Read the contents of a local file in the project workspace.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "The absolute or relative path to the file to read.",
          },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "write_file",
      description: "Write or overwrite contents of a local file in the project workspace.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "The absolute or relative path to the file to write.",
          },
          content: {
            type: "string",
            description: "The complete content to write into the file.",
          },
        },
        required: ["path", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_dir",
      description: "List the contents of a directory.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "The directory path to list. If empty, lists the project root.",
          },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "run_command",
      description: "Execute a terminal command (e.g., npm test, git log).",
      parameters: {
        type: "object",
        properties: {
          command: {
            type: "string",
            description: "The exact command to run.",
          },
          cwd: {
            type: "string",
            description: "The working directory for the command. Usually the project root.",
          },
        },
        required: ["command", "cwd"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "fetch_url",
      description: "Fetch the text content of a web page or article.",
      parameters: {
        type: "object",
        properties: {
          url: {
            type: "string",
            description: "The URL of the webpage to read.",
          },
        },
        required: ["url"],
      },
    },
  },
];

export async function executeAiTool(name: string, args: any, workspaceRoot: string): Promise<string> {
  try {
    switch (name) {
      case "read_file": {
        const fullPath = args.path;
        const content = await invoke<string>("read_text_file", { path: fullPath });
        return content.slice(0, 50000); // Limit output to prevent massive context explosion
      }
      case "write_file": {
        await invoke("write_text_file", { path: args.path, contents: args.content });
        return `Successfully wrote to ${args.path}`;
      }
      case "list_dir": {
        const p = args.path || workspaceRoot;
        const entries = await invoke<{ name: string; is_dir: boolean; size: number }[]>("list_dir", { path: p });
        return JSON.stringify(entries.map((e) => ({ name: e.name, is_dir: e.is_dir, size: e.size })), null, 2);
      }
      case "run_command": {
        // shell: false 要求 command 是可执行文件路径，args 是参数数组。
        // AI 传入的 args.command 是单个字符串（如 "npm test"），需拆分为 [cmd, ...args]。
        // 简单空白拆分即可满足 AI 命令场景；引号场景由 validateToolServerSide 兜底拦截。
        const parts = String(args.command || "").trim().split(/\s+/).filter(Boolean);
        if (parts.length === 0) {
          return "Error: empty command";
        }
        const result = await invoke("run_tool", {
          tool: {
            command: parts[0],
            args: parts.slice(1),
            cwd: workspaceRoot,
            id: "agent_cmd",
            name: "Agent Command",
          },
          vars: {},
        });
        const out = `Stdout: ${result.stdout}\nStderr: ${result.stderr}\nExitCode: ${result.exitCode}`;
        return out.slice(0, 10000);
      }
      case "fetch_url": {
        const content = await invoke<string>("fetch_url", { url: args.url });
        return content.slice(0, 30000);
      }
      default:
        return `Error: Unknown tool ${name}`;
    }
  } catch (err: any) {
    return `Error executing tool ${name}: ${err.message || String(err)}`;
  }
}
