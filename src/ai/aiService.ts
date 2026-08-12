import { aiToolsDefinition, executeAiTool } from "./aiTools";

/**
 * AI 助手服务层
 *
 * 支持 OpenAI 兼容 API（OpenAI / DeepSeek / 本地模型等）。
 * 提供 Chat 对话、流式输出、Tool Calling 功能。
 */
export interface AiConfig {
  apiKey: string;
  endpoint: string;
  model: string;
  enabled: boolean;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  name?: string;
  tool_calls?: any[];
  tool_call_id?: string;
}

export interface ChatSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  projectDir: string;
  createdAt: number;
  updatedAt: number;
}

const SYSTEM_PROMPT = `You are a helpful writing assistant and agent integrated into Textora, a universal Markdown editor.
You help users with:
- Writing and editing Markdown documents of any kind
- Explaining code snippets in any language
- Generating content (tables, lists, summaries, etc.)
- Translating text
- Improving writing style and grammar
- Answering questions about the document content
- Understanding project structure and helping with project documentation
- Writing boilerplate, README, API docs, and more

Always respond in the same language as the user query.
When providing code or Markdown content, format it properly for insertion into the editor.
Keep responses concise and practical.
When the user asks about project files or structure, you can use tools to read files, search the project, or fetch URLs.
If you need to edit files, use write_file.`;

export interface ChatOptions {
  config: AiConfig;
  history: ChatMessage[];
  documentContext?: string;
  projectContext?: string;
  systemPrompt?: string;
  onChunk?: (chunk: string) => void;
  enableTools?: boolean;
  workspaceRoot?: string;
  onToolCall?: (toolName: string, args: string) => void;
  /** 工具执行前确认门：返回 false 则跳过执行（结果告知模型被拒绝）。危险工具必须提供 */
  confirmToolCall?: (toolName: string, args: Record<string, unknown>) => Promise<boolean>;
  signal?: AbortSignal;
  timeout?: number;
}

async function callOpenAI(
  config: AiConfig,
  messages: any[],
  tools?: any[],
  onChunk?: (chunk: string) => void,
  signal?: AbortSignal,
  timeout: number = 60000
): Promise<{ content: string; tool_calls?: any[] }> {
  const url = config.endpoint.replace(/\/+$/, "") + "/chat/completions";
  const body: Record<string, any> = {
    model: config.model,
    messages,
    temperature: 0.7,
    max_tokens: 4096,
  };

  if (tools && tools.length > 0) {
    body.tools = tools;
  }

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (config.apiKey) headers["Authorization"] = `Bearer ${config.apiKey}`;

  if (onChunk) {
    body.stream = true;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    // once: true —— AbortSignal 只会 abort 一次，触发后自动移除监听器，避免内存泄漏
    if (signal) {
      if (signal.aborted) controller.abort();
      else signal.addEventListener('abort', () => controller.abort(), { once: true });
    }
    const resp = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    }).finally(() => clearTimeout(timeoutId));

    if (!resp.ok) {
      const err = await resp.text().catch(() => "");
      throw new Error(`API error ${resp.status}: ${err}`);
    }

    const reader = resp.body?.getReader();
    if (!reader) throw new Error("No response body");

    const decoder = new TextDecoder();
    let fullText = "";
    let buffer = "";

    // Accumulate tool calls（限制条目数防止恶意响应导致内存膨胀）
    const toolCallsMap = new Map<number, any>();
    const MAX_TOOL_CALLS = 50;

    while (true) {
      // 流式读取过程中若 signal 被 abort，主动 cancel reader 并退出
      if (controller.signal.aborted) {
        try { await reader.cancel(); } catch { /* ignore */ }
        break;
      }
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith("data: ")) continue;
        const data = trimmed.slice(6);
        if (data === "[DONE]") break;
        try {
          const parsed = JSON.parse(data);
          const delta = parsed.choices?.[0]?.delta;
          if (!delta) continue;

          if (delta.content) {
            fullText += delta.content;
            onChunk(delta.content);
          }

          if (delta.tool_calls) {
            for (const tc of delta.tool_calls) {
              const idx = tc.index;
              if (!toolCallsMap.has(idx)) {
                if (toolCallsMap.size >= MAX_TOOL_CALLS) {
                  throw new Error(`Too many tool_calls in single response (limit ${MAX_TOOL_CALLS})`);
                }
                toolCallsMap.set(idx, {
                  id: tc.id,
                  type: "function",
                  function: { name: tc.function?.name || "", arguments: tc.function?.arguments || "" }
                });
              } else {
                const existing = toolCallsMap.get(idx);
                if (tc.function?.name) existing.function.name += tc.function.name;
                if (tc.function?.arguments) existing.function.arguments += tc.function.arguments;
              }
            }
          }
        } catch {
          // ignore parse errors
        }
      }
    }

    const tool_calls = toolCallsMap.size > 0 ? Array.from(toolCallsMap.values()) : undefined;
    return { content: fullText, tool_calls };
  } else {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    if (signal) {
      if (signal.aborted) controller.abort();
      else signal.addEventListener('abort', () => controller.abort(), { once: true });
    }
    const resp = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    }).finally(() => clearTimeout(timeoutId));

    if (!resp.ok) {
      const err = await resp.text().catch(() => "");
      throw new Error(`API error ${resp.status}: ${err}`);
    }

    const data = await resp.json();
    const msg = data.choices?.[0]?.message;
    return {
      content: msg?.content || "",
      tool_calls: msg?.tool_calls
    };
  }
}

export async function chat(options: ChatOptions & { enableTools?: boolean; workspaceRoot?: string; onToolCall?: (toolName: string, args: string) => void }): Promise<string> {
  const { config, history, documentContext, projectContext, systemPrompt, onChunk, signal, timeout } = options;
  
  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt ?? SYSTEM_PROMPT },
  ];

  if (projectContext) {
    messages.push({
      role: "system",
      content: `[Project Context]\n${projectContext}`,
    });
  }

  if (documentContext) {
    messages.push({
      role: "system",
      content: `[Current Document]\n\`\`\`\n${documentContext.slice(0, 8000)}\n\`\`\``,
    });
  }

  messages.push(...history);

  const currentMessages = [...messages];
  let finalContent = "";
  let iterations = 0;
  const maxIterations = 10;

  while (iterations < maxIterations) {
    iterations++;
    const toolsPayload = options.enableTools ? aiToolsDefinition : undefined;
    
    // 如果这是最后一步或者不启用 tool stream，我们把 onChunk 传下去，
    // 但是为了简化，如果启用了 tools，这里我们还是用带 stream 的 callOpenAI，它会处理累积。
    const response = await callOpenAI(config, currentMessages, toolsPayload, onChunk, signal, timeout);
    
    if (response.content) {
      finalContent += response.content;
    }
    
    if (response.tool_calls && response.tool_calls.length > 0) {
      currentMessages.push({
        role: "assistant",
        content: response.content || "",
        tool_calls: response.tool_calls
      });

      for (const tc of response.tool_calls) {
        let argsObj = {};
        try {
          argsObj = JSON.parse(tc.function.arguments);
        } catch { /* ignore */ }
        
        if (options.onToolCall) {
          options.onToolCall(tc.function.name, tc.function.arguments);
        }

        // 执行前确认：AI 工具调用（写文件/执行命令）必须先获得用户允许。
        // 不提供确认回调时默认放行（只读场景向后兼容），但写/执行类必须由 UI 层拦截。
        if (options.confirmToolCall) {
          const allowed = await options.confirmToolCall(tc.function.name, argsObj);
          if (!allowed) {
            currentMessages.push({
              role: "tool",
              name: tc.function.name,
              tool_call_id: tc.id,
              content: `User declined to execute tool "${tc.function.name}". Tell the user what you wanted to do and ask before trying again.`,
            });
            continue;
          }
        }

        const toolResult = await executeAiTool(tc.function.name, argsObj, options.workspaceRoot || "");
        currentMessages.push({
          role: "tool",
          name: tc.function.name,
          tool_call_id: tc.id,
          content: toolResult
        });
      }
      // 继续下一轮循环
    } else {
      break;
    }
  }

  return finalContent;
}

/**
 * 获取可用模型列表
 * 调用 /models 端点获取模型列表（OpenAI 兼容 API）
 */
export async function listModels(config: AiConfig): Promise<string[]> {
  const url = config.endpoint.replace(/\/+$/, "") + "/models";
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (config.apiKey) headers["Authorization"] = `Bearer ${config.apiKey}`;

  const resp = await fetch(url, { headers });
  if (!resp.ok) {
    const err = await resp.text().catch(() => "");
    throw new Error(`API error ${resp.status}: ${err}`);
  }

  const data = await resp.json();
  // OpenAI 格式: { data: [{ id: "model-name", ... }, ...] }
  return data.data?.map((m: any) => m.id) || [];
}
