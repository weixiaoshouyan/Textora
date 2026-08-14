/**
 * Store slice：AI 供应商 / 聊天会话
 *
 * 从 useAppStore 拆分而来，保持对外 API 完全不变。
 */
import type { StoreApi } from "zustand";
import type { AppState, ChatSession } from "../types";
import { safeWriteLocal } from "../helpers";
import {
  getActiveProviderId,
  getTemplate,
  loadAllApiKeys,
  loadProviderConfigs,
  saveProviderConfigs,
  setActiveProviderId,
  type ProviderConfig,
} from "../../ai/config";
import type { ChatMessage } from "../../ai/aiService";

type SetFn = StoreApi<AppState>["setState"];
type GetFn = StoreApi<AppState>["getState"];

export function aiSlice(set: SetFn, get: GetFn): Partial<AppState> {
  return {
    // ===== AI 供应商管理 =====
    aiProviders: loadProviderConfigs(),
    aiActiveProviderId: getActiveProviderId(),

    loadAiProviders: async () => {
      const configs = await loadAllApiKeys(loadProviderConfigs());
      set({ aiProviders: configs });
    },
    addAiProvider: (templateId, label, apiKey, model) => {
      const template = getTemplate(templateId);
      const id = templateId + "_" + Date.now().toString(36);
      const config: ProviderConfig = {
        id,
        templateId,
        label: label || (template?.label ?? "Custom"),
        endpoint: template?.endpoint ?? "",
        apiKey,
        model: (model || template?.defaultModel) ?? "",
        enabled: true,
        createdAt: Date.now(),
      };
      const next = [...get().aiProviders, config];
      set({ aiProviders: next });
      void saveProviderConfigs(next);
      // Auto-select if first provider
      if (next.length === 1) {
        setActiveProviderId(id);
        set({ aiActiveProviderId: id });
      }
    },
    removeAiProvider: (id) => {
      const next = get().aiProviders.filter((p) => p.id !== id);
      const currentActive = get().aiActiveProviderId;
      set({ aiProviders: next });
      if (currentActive === id) {
        const fallback = next[0]?.id ?? null;
        setActiveProviderId(fallback);
        set({ aiActiveProviderId: fallback });
      }
      void saveProviderConfigs(next);
    },
    updateAiProvider: (id, patch) => {
      const next = get().aiProviders.map((p) => (p.id === id ? { ...p, ...patch } : p));
      set({ aiProviders: next });
      void saveProviderConfigs(next);
    },
    setAiActiveProvider: (id: string | null) => {
      setActiveProviderId(id);
      set({ aiActiveProviderId: id });
    },
    getActiveAiProvider: () => {
      const { aiProviders, aiActiveProviderId } = get();
      return aiProviders.find((p) => p.id === aiActiveProviderId) || aiProviders.find((p) => p.apiKey) || null;
    },

    // ===== AI 聊天会话管理 =====
    aiSessions: safeReadAiSessions(),
    aiActiveSessionId: safeReadLocalAiSession(),

    createAiSession: (projectDir) => {
      const id = "session_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      const session: ChatSession = {
        id,
        title: "新对话",
        messages: [],
        projectDir: projectDir ?? "",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      const nextSessions = [session, ...get().aiSessions];
      set({ aiSessions: nextSessions, aiActiveSessionId: id });
      safeWriteLocal("textora.ai_sessions", nextSessions);
      safeWriteLocal("textora.ai_active_session", id);
      return id;
    },
    deleteAiSession: (id) => {
      const nextSessions = get().aiSessions.filter((ses) => ses.id !== id);
      const nextActiveId = get().aiActiveSessionId === id ? (nextSessions[0]?.id ?? null) : get().aiActiveSessionId;
      set({
        aiSessions: nextSessions,
        aiActiveSessionId: nextActiveId,
      });
      safeWriteLocal("textora.ai_sessions", nextSessions);
      // null 必须 removeItem：JSON.stringify(null) 会存成字符串 "null"，
      // 重启后 safeReadLocalAiSession 把它当真实 id 返回，产生"幽灵会话"
      if (nextActiveId === null) {
        try { localStorage.removeItem("textora.ai_active_session"); } catch { /* ignore */ }
      } else {
        safeWriteLocal("textora.ai_active_session", nextActiveId);
      }
    },
    setAiActiveSession: (id) => {
      set({ aiActiveSessionId: id });
      if (id === null) {
        try { localStorage.removeItem("textora.ai_active_session"); } catch { /* ignore */ }
      } else {
        safeWriteLocal("textora.ai_active_session", id);
      }
    },
    updateAiSessionMessages: (id, messages: ChatMessage[]) => {
      const nextSessions = get().aiSessions.map((ses) => {
        if (ses.id === id) {
          // 自动根据首个用户提问生成对话标题
          let title = ses.title;
          if ((ses.title === "新对话" || !ses.title) && messages.length > 0) {
            const firstUser = messages.find((m) => m.role === "user");
            if (firstUser) {
              title = firstUser.content.trim().slice(0, 16);
            }
          }
          return {
            ...ses,
            messages,
            title: title || "新对话",
            updatedAt: Date.now(),
          };
        }
        return ses;
      });
      set({ aiSessions: nextSessions });
      safeWriteLocal("textora.ai_sessions", nextSessions);
    },

    aiAssistantOpen: false,
    setAiAssistantOpen: (open) => set({ aiAssistantOpen: open }),
  };
}

/** 从 localStorage 安全读取 AI 会话列表（含结构校验） */
function safeReadAiSessions(): ChatSession[] {
  try {
    const raw = localStorage.getItem("textora.ai_sessions");
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (
      Array.isArray(parsed) &&
      parsed.every(
        (s) =>
          s !== null &&
          typeof s === "object" &&
          typeof (s as { id?: unknown }).id === "string" &&
          Array.isArray((s as { messages?: unknown }).messages),
      )
    ) {
      return parsed as ChatSession[];
    }
    return [];
  } catch {
    return [];
  }
}

/** 从 localStorage 安全读取活动会话 ID */
function safeReadLocalAiSession(): string | null {
  try {
    const raw = localStorage.getItem("textora.ai_active_session");
    if (raw === null) return null;
    // 存储端用 safeWriteLocal（JSON.stringify）写入，值带引号（"session_xxx"）：
    // 必须 JSON.parse，否则带引号的字符串永远匹配不上真实会话 id，
    // 重启后 AI 面板"活动会话"高亮/定位全部失效
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed === "string" && parsed !== "null") return parsed;
    return null;
  } catch {
    // 旧版本曾写入 JSON.stringify(null)（字符串 "null"）或损坏数据：归一化为 null，
    // 否则 AI 面板出现找不到的"幽灵会话"
    return null;
  }
}
