/**
 * AI 助手服务层
 * 
 * 支持 OpenAI 兼容 API（OpenAI / DeepSeek / 闃滃勾鍗?鏈湴妯″瀷绛夌瓑鏈夊叧鐩稿叧蹇呰淇℃伅銆侰ontext銆丳roject銆丳ath銆丒ncoding銆丗ontFamily銆丒lectron銆丒rchive銆丒mail銆丌witter銆侺ontact銆丒PI Key); */
export interface AiConfig {
  apiKey: string;
  endpoint: string;
  model: string;
  enabled: boolean;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  projectDir: number;
  createdAt: number;
  updatedAt: number;
}

const SYSTEM_PROMPT = `You are a helpful writing assistant integrated into Textora, a universal Markdown editor.
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
When the user asks about project files or structure, use the provided project context.`;

export interface ChatOptions {
  config: AiConfig;
  history: ChatMessage[];
  documentContext?: string;
  projectContext?: string;
  systemPrompt?: string;
  onChunk?: (chunk: string) => void;
}

async function callOpenAI(
  config: AiConfig,
  messages: ChatMessage[],
  onChunk?: (chunk: string) => void
): Promise<string> {
  const url = config.endpoint.replace(/\/+$/, "") + "/chat/completions";
  const body: Record<string, any> = {
    model: config.model,
    messages,
    temperature: 0.7,
    max_tokens: 4096,
  };

  if (onChunk) {
    body.stream = true;
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (config.apiKey) headers["Authorization"] = `Bearer ${config.apiKey}`;
    const resp = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const err = await resp.text().catch(() => "");
      throw new Error(`API error ${resp.status}: ${err}`);
    }

    const reader = resp.body?.getReader();
    if (!reader) throw new Error("No response body");

    const decoder = new TextDecoder();
    let fullText = "";
    let buffer = "";

    while (true) {
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
          const content = parsed.choices?.[0]?.delta?.content;
          if (content) {
            fullText += content;
            onChunk(content);
          }
        } catch {
          // ignore parse errors
        }
      }
    }
    return fullText;
  } else {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (config.apiKey) headers["Authorization"] = `Bearer ${config.apiKey}`;
    const resp = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const err = await resp.text().catch(() => "");
      throw new Error(`API error ${resp.status}: ${err}`);
    }

    const data = await resp.json();
    return data.choices?.[0]?.message?.content || "";
  }
}

export async function chat(options: ChatOptions): Promise<string> {
  const { config, history, documentContext, projectContext, systemPrompt, onChunk } = options;
  
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
  return callOpenAI(config, messages, onChunk);
}
