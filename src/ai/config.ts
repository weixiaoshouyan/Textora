/**
 * AI 配置管理 - 多供应商支持
 * 
 * 预设供应商（只需填 API Key）+ 自定义供应商
 * 支持保存多个已配置供应商，AI 助手可切换使用
 */
import type { AiConfig } from "./aiService";
import { invoke } from "../ipc";

export const AI_STORAGE_KEY = "textora_ai_configs";
const ACTIVE_PROVIDER_KEY = "textora_ai_active_provider";
const SECRET_PREFIX = "ai_key_";

/** 预设供应商模板 - 只需填写 API Key 即可使用 */
export interface ProviderTemplate {
  id: string;
  label: string;
  icon?: string;
  endpoint: string;
  defaultModel: string;
  models: string[];       // 该供应商可用模型列表
  keyPlaceholder: string; // API Key 输入框占位符
}

/** 已配置的供应商实例 */
export interface ProviderConfig {
  id: string;             // 唯一标识 (provider_templateId 或 custom_uuid)
  templateId: string;     // 关联的模板 ID ("openai", "deepseek", "custom" 等)
  label: string;          // 显示名称
  endpoint: string;       // API 端点
  apiKey: string;         // API Key (内存中从 safeStorage 加载)
  model: string;          // 当前选中的模型
  enabled: boolean;       // 是否启用
  createdAt: number;      // 创建时间
}

// ===================== 预设供应商模板 =====================

export const PROVIDER_TEMPLATES: ProviderTemplate[] = [
  {
    id: "openai",
    label: "OpenAI",
    endpoint: "https://api.openai.com/v1",
    defaultModel: "gpt-4o-mini",
    models: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-4", "gpt-3.5-turbo", "o1-preview", "o1-mini"],
    keyPlaceholder: "sk-...",
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    endpoint: "https://api.deepseek.com/v1",
    defaultModel: "deepseek-chat",
    models: ["deepseek-chat", "deepseek-coder", "deepseek-reasoner"],
    keyPlaceholder: "sk-...",
  },
  {
    id: "qwen",
    label: "闃滃勾鍗?(Qwen)",
    endpoint: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    defaultModel: "qwen-plus",
    models: ["qwen-plus", "qwen-turbo", "qwen-max", "qwen-long", "qwen-coder-plus"],
    keyPlaceholder: "sk-...",
  },
  {
    id: "kimi",
    label: "Moonshot (Kimi)",
    endpoint: "https://api.moonshot.cn/v1",
    defaultModel: "moonshot-v1-8k",
    models: ["moonshot-v1-8k", "moonshot-v1-32k", "moonshot-v1-128k"],
    keyPlaceholder: "sk-...",
  },
  {
    id: "zhipu",
    label: "鏅鸿珤AI (GLM)",
    endpoint: "https://open.bigmodel.cn/api/paas/v4",
    defaultModel: "glm-4-flash",
    models: ["glm-4-flash", "glm-4", "glm-4-plus", "glm-4-air", "glm-4v"],
    keyPlaceholder: "your-api-key",
  },
  {
    id: "anthropic",
    label: "Anthropic (Claude)",
    endpoint: "https://api.anthropic.com/v1",
    defaultModel: "claude-sonnet-4-20250514",
    models: ["claude-sonnet-4-20250514", "claude-opus-4-20250514", "claude-3-5-sonnet-20241022", "claude-3-5-sonnet-20240620", "claude-3-haiku-20240307"],
    keyPlaceholder: "sk-ant-...",
  },
  {
    id: "ollama",
    label: "Ollama (鏈湴)",
    endpoint: "http://localhost:11434/v1",
    defaultModel: "llama3.1",
    models: ["llama3.1", "llama3", "codellama", "mistral", "qwen2", "gemma2", "phi3"],
    keyPlaceholder: "",
  },
  {
    id: "groq",
    label: "Groq",
    endpoint: "https://api.groq.com/openai/v1",
    defaultModel: "llama-3.3-70b-versatile",
    models: ["llama-3.3-70b-versatile", "llama-3.1-8b-instant", "mixtral-8x7b-32768", "gemma2-9b-it"],
    keyPlaceholder: "gsk_...",
  },
  {
    id: "custom",
    label: "鑷畾涔?(OpenAI 鍏煎)",
    endpoint: "",
    defaultModel: "",
    models: [],
    keyPlaceholder: "...",
  },
];

/** 根据 endpoint 自动识别供应商模板 */
export function detectTemplateId(endpoint: string): string {
  const norm = endpoint.replace(/\/+$/, "").toLowerCase();
  const hit = PROVIDER_TEMPLATES.find(
    (p) => p.endpoint && p.endpoint.replace(/\/+$/, "").toLowerCase() === norm
  );
  return hit ? hit.id : "custom";
}

/** 获取模板 */
export function getTemplate(templateId: string): ProviderTemplate | undefined {
  return PROVIDER_TEMPLATES.find((t) => t.id === templateId);
}

// ===================== 配置的持久化读写 =====================

/** 保存配置列表到 localStorage (apiKey 存入 safeStorage) */
export async function saveProviderConfigs(configs: ProviderConfig[]): Promise<void> {
  try {
    // 先清除所有旧的 secrets
    for (const c of configs) {
      const secretKey = SECRET_PREFIX + c.id;
      if (c.apiKey) {
        await invoke("store_secret", { key: secretKey, value: c.apiKey });
      }
    }
    // 保存不含 apiKey 的配置
    const safe = configs.map(({ apiKey, ...rest }) => rest);
    localStorage.setItem(AI_STORAGE_KEY, JSON.stringify(safe));
  } catch (e) {
    console.error("Failed to save provider configs:", e);
  }
}

/** 从 localStorage 加载配置列表 (apiKey 从 safeStorage 异步加载) */
export function loadProviderConfigs(): ProviderConfig[] {
  try {
    const raw = localStorage.getItem(AI_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ProviderConfig[];
    return parsed.map((c) => ({ ...c, apiKey: "" }));
  } catch {
    return [];
  }
}

/** 异步加载某个配置的 API Key */
export function loadProviderApiKey(providerId: string): Promise<string> {
  return invoke<string | null>("read_secret", { key: SECRET_PREFIX + providerId })
    .then((k) => k || "")
    .catch(() => "");
}

/** 异步加载所有配置的 API Key */
export async function loadAllApiKeys(configs: ProviderConfig[]): Promise<ProviderConfig[]> {
  const results = await Promise.all(
    configs.map(async (c) => ({
      ...c,
      apiKey: await loadProviderApiKey(c.id),
    }))
  );
  return results;
}

/** 获取当前活跃供应商 ID */
export function getActiveProviderId(): string | null {
  return localStorage.getItem(ACTIVE_PROVIDER_KEY);
}

/** 设置当前活跃供应商 ID */
export function setActiveProviderId(id: string | null): void {
  if (id) localStorage.setItem(ACTIVE_PROVIDER_KEY, id);
  else localStorage.removeItem(ACTIVE_PROVIDER_KEY);
}

/** 获取当前活跃供应商配置 */
export async function getActiveProvider(): Promise<ProviderConfig | null> {
  const configs = await loadAllApiKeys(loadProviderConfigs());
  const activeId = getActiveProviderId();
  if (activeId) {
    const found = configs.find((c) => c.id === activeId);
    if (found && found.apiKey) return found;
  }
  // fallback: 第一个有 key 的
  return configs.find((c) => c.apiKey) || null;
}
