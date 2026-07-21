/**
 * AI 助手面板 - 项目感知型写作助手
 * 
 * 功能：
 * - 多供应商模型切换（只显示已配置的供应商模型）
 * - 项目目录选择（AI 根据项目上下文回答）
 * - 聊天历史管理（新建/切换/删除会话）
 * - 基于当前文档 + 项目上下文的对话
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { useAppStore, type ChatSession } from "../store/useAppStore";
import { chat, type ChatMessage } from "../ai/aiService";
import { getActiveProvider, getTemplate, type ProviderConfig } from "../ai/config";
import { useLocale, tFor } from "../i18n";
import { openDialog } from "../ipc";

// ===== 快捷指令的系统提示 =====
const QUICK_ACTIONS = [
  {
    key: "plan",
    icon: "📋",
    label: () => "ai.action.plan",
    system: "你是一名资深内容规划师。请基于用户正在编辑的文档，给出：1. 合理的整体结构大纲（多级标题）；2. 每一部分应涵盖的要点；3. 若已有内容，指出可补充、重组或深化的方向。用 Markdown 标题与列表输出。",
  },
  {
    key: "ideas",
    icon: "💡",
    label: () => "ai.action.ideas",
    system: "你是一名有创造力的写作教师。请围绕用户当前文档的主题，提供多个有深度、可落地的写作角度与思路，包含可能的论点、论据或案例方向。用 Markdown 列表输出。",
  },
  {
    key: "continue",
    icon: "✍️",
    label: () => "ai.action.continue",
    system: "你是写作助手。请基于用户文档现有内容，自然地续写接下来的 1–2 段，保持原有语气与风格。只输出续写内容，不重复已有内容。",
  },
  {
    key: "polish",
    icon: "✨",
    label: () => "ai.action.polish",
    system: "你是文字润色与逻辑优化专家。请改进用户文档的表达、连贯性与可读性，保持原意与 Markdown 格式，输出润色后的完整文本。",
  },
];

export function AiAssistant() {
  const locale = useLocale((s) => s.locale);
  const t = tFor(locale);
  const content = useAppStore((s) => s.content);
  const setContent = useAppStore((s) => s.setContent);
  const workspaceRoot = useAppStore((s) => s.workspaceRoot);
  
  // AI 配置
  const providers = useAppStore((s) => s.aiProviders);
  const activeProviderId = useAppStore((s) => s.aiActiveProviderId);
  const setAiActiveProvider = useAppStore((s) => s.setAiActiveProvider);
  const updateAiProvider = useAppStore((s) => s.updateAiProvider);
  const getActiveAiProvider = useAppStore((s) => s.getActiveAiProvider);
  const addAiProvider = useAppStore((s) => s.addAiProvider);
  const loadAiProviders = useAppStore((s) => s.loadAiProviders);
  
  // 聊天会话
  const sessions = useAppStore((s) => s.aiSessions);
  const activeSessionId = useAppStore((s) => s.aiActiveSessionId);
  const createAiSession = useAppStore((s) => s.createAiSession);
  const deleteAiSession = useAppStore((s) => s.deleteAiSession);
  const setAiActiveSession = useAppStore((s) => s.setAiActiveSession);
  
  // UI 面板
  const open = useAppStore((s) => s.aiAssistantOpen);
  const setOpen = useAppStore((s) => s.setAiAssistantOpen);
  const setSettingsPanelOpen = useAppStore((s) => s.setSettingsPanelOpen);

  // 本地状态
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [streaming, setStreaming] = useState("");
  const [error, setError] = useState("");
  const [projectDir, setProjectDir] = useState("");
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // 当前活跃 provider
  const activeProvider = providers.find((p) => p.id === activeProviderId) || providers.find((p) => p.apiKey) || null;
  const activeTemplate = activeProvider ? getTemplate(activeProvider.templateId) : null;
  const configuredProviders = providers.filter((p) => p.apiKey);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => { scrollToBottom(); }, [messages, streaming, scrollToBottom]);

  // 初始化：加载 providers，确保有活跃会话
  useEffect(() => {
    void loadAiProviders();
  }, [loadAiProviders]);

  useEffect(() => {
    if (sessions.length === 0) {
      createAiSession(projectDir || workspaceRoot || undefined);
    }
  }, [sessions.length, createAiSession, projectDir, workspaceRoot]);

  // 当 workspaceRoot 变化且 projectDir 为空时同步
  useEffect(() => {
    if (!projectDir && workspaceRoot) {
      setProjectDir(workspaceRoot);
    }
  }, [workspaceRoot, projectDir]);

  const buildProjectContext = useCallback((): string => {
    if (!projectDir) return "";
    const ws = workspaceRoot || "";
    const currentDoc = content ? content.slice(0, 4000) : "";
    const parts: string[][] = [];
    if (ws) parts.push(["Project root:", ws]);
    if (projectDir) parts.push(["Selected project directory:", projectDir]);
    if (currentDoc) parts.push(["Current document (first 4000 chars):", currentDoc]);
    return parts.map(([k, v]) => k + "\n" + v).join("\n\n");
  }, [projectDir, workspaceRoot, content]);

  const runChat = useCallback(
    async (userText: string, systemPrompt?: string) => {
      if (loading) return;
      if (!activeProvider || !activeProvider.apiKey) {
        setError("请先在设置中配置 AI 供应商的 API Key");
        setSettingsPanelOpen(true);
        return;
      }
      const userMsg: ChatMessage = { role: "user", content: userText };
      const newMessages = [...messages, userMsg];
      setMessages(newMessages);
      setInput("");
      setError("");
      setLoading(true);
      setStreaming("");
      try {
        const projectContext = buildProjectContext();
        const docContext = content || "";
        const fullText = await chat({
          config: { apiKey: activeProvider.apiKey, endpoint: activeProvider.endpoint, model: activeProvider.model, enabled: true },
          history: newMessages.map((m) => ({ role: m.role, content: m.content })),
          documentContext: docContext,
          projectContext,
          onChunk: (chunk) => setStreaming((prev) => prev + chunk),
          systemPrompt,
        });
        setMessages([...newMessages, { role: "assistant", content: fullText }]);
        setStreaming("");
      } catch (e: any) {
        setError(e.message || "请求失败，请检查网络和配置");
      } finally {
        setLoading(false);
      }
    },
    [loading, activeProvider, messages, content, buildProjectContext, setSettingsPanelOpen]
  );

  const handleSend = () => {
    const text = input.trim();
    if (!text || loading) return;
    void runChat(text);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInsert = (text: string) => {
    const newContent = content + "\n\n" + text + "\n";
    setContent(newContent);
  };

  const handleNewChat = () => {
    createAiSession(projectDir || workspaceRoot || undefined);
    setMessages([]);
    setInput("");
    setError("");
    setStreaming("");
  };

  const handleSelectSession = (session: ChatSession) => {
    setAiActiveSession(session.id);
    setMessages(session.messages);
    if (session.projectDir) setProjectDir(session.projectDir);
  };

  const handlePickProjectDir = async () => {
    try {
      const selected = await openDialog({ directory: true, title: "选择项目目录" });
      if (selected) setProjectDir(typeof selected === "string" ? selected : selected[0]);
    } catch { /* ignore */ }
  };

  if (!open) return null;

  return (
    <div className="textora-ai-panel" style={{
      position: "absolute", right: 0, top: 0, bottom: 0, width: 380,
      background: "var(--textora-bg)", borderLeft: "1px solid var(--textora-border)",
      display: "flex", flexDirection: "column", zIndex: 50,
    }}>
      {/* 顶部工具栏 */}
      <div style={{
        display: "flex", alignItems: "center", gap: 4,
        padding: "8px 12px", borderBottom: "1px solid var(--textora-border)",
      }}>
        <button className="textora-btn" onClick={handleNewChat} title="新建对话"
          style={{ fontSize: 12, padding: "2px 8px" }}>+ 新建</button>
        <button className="textora-btn" onClick={() => setShowHistory(!showHistory)} title="历史对话"
          style={{ fontSize: 12, padding: "2px 8px" }}>📋 历史</button>
        <div style={{ flex: 1 }} />
        {/* 模型选择器 */}
        <div style={{ position: "relative" }}>
          <button className="textora-btn" onClick={() => setShowModelPicker(!showModelPicker)}
            style={{ fontSize: 11, padding: "2px 8px", maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {activeProvider ? (activeProvider.label + " / " + activeProvider.model) : "选择模型"} ▾
          </button>
          {showModelPicker && (
            <div className="textora-card" style={{
              position: "absolute", top: "100%", right: 0, zIndex: 100,
              minWidth: 200, maxHeight: 300, overflow: "auto", padding: 4,
            }}>
              {configuredProviders.length === 0 ? (
                <div style={{ padding: 8, fontSize: 12, color: "var(--textora-fg-muted)" }}>
                  暂无已配置供应商，请前往设置配置
                </div>
              ) : (
                configuredProviders.map((p) => {
                  const tmpl = getTemplate(p.templateId);
                  const models = tmpl?.models || [p.model];
                  return (
                    <div key={p.id} style={{ marginBottom: 4 }}>
                      <div style={{ fontSize: 11, fontWeight: 600, padding: "4px 8px", color: "var(--textora-fg-muted)" }}>
                        {p.label}
                      </div>
                      {models.map((m: string) => (
                        <div key={m} onClick={() => { updateAiProvider(p.id, { model: m }); setShowModelPicker(false); }}
                          className="textora-ai-model-item" style={{
                            padding: "4px 12px", fontSize: 12, cursor: "pointer",
                            borderRadius: 4,
                            background: p.id === activeProviderId && m === p.model ? "var(--textora-accent)" : "transparent",
                            color: p.id === activeProviderId && m === p.model ? "#fff" : "var(--textora-fg)",
                          }}>
                          {m}
                        </div>
                      ))}
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>
        <button className="textora-btn" onClick={() => setOpen(false)} title="关闭"
          style={{ fontSize: 14, padding: "0 6px" }}>✕</button>
      </div>

      {/* 项目目录选择 */}
      <div style={{
        display: "flex", alignItems: "center", gap: 4,
        padding: "6px 12px", borderBottom: "1px solid var(--textora-border)",
        background: "var(--textora-bg-elev)",
      }}>
        <span style={{ fontSize: 11, color: "var(--textora-fg-muted)", whiteSpace: "nowrap" }}>📁 项目:</span>
        <input
          type="text" value={projectDir} onChange={(e) => setProjectDir(e.target.value)}
          placeholder="选择项目目录，AI 将理解项目上下文"
          style={{
            flex: 1, fontSize: 11, padding: "2px 6px",
            border: "1px solid var(--textora-border)", borderRadius: 4,
            background: "var(--textora-bg)", color: "var(--textora-fg)",
          }}
        />
        <button className="textora-btn" onClick={handlePickProjectDir} title="浏览目录"
          style={{ fontSize: 11, padding: "2px 6px" }}>浏览</button>
      </div>

      {/* 历史面板 */}
      {showHistory && (
        <div style={{
          maxHeight: 200, overflow: "auto", borderBottom: "1px solid var(--textora-border)",
          background: "var(--textora-bg-elev)",
        }}>
          {sessions.length === 0 ? (
            <div style={{ padding: 12, fontSize: 12, color: "var(--textora-fg-muted)", textAlign: "center" }}>
              暂无历史对话
            </div>
          ) : (
            sessions.map((s) => (
              <div key={s.id} onClick={() => { handleSelectSession(s); setShowHistory(false); }}
                style={{
                  padding: "6px 12px", fontSize: 12, cursor: "pointer",
                  borderBottom: "1px solid var(--textora-border)",
                  background: s.id === activeSessionId ? "var(--textora-bg-muted)" : "transparent",
                }}>
                <div style={{ fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {s.title || "未命名对话"}
                </div>
                <div style={{ fontSize: 10, color: "var(--textora-fg-muted)" }}>
                  {new Date(s.updatedAt).toLocaleString()} · {s.messages.length} 条消息
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* 消息列表 */}
      <div style={{
        flex: 1, overflow: "auto", padding: "12px 14px", display: "flex", flexDirection: "column", gap: 12,
      }}>
        {messages.length === 0 && !loading && (
          <div style={{ color: "var(--textora-fg-muted)", fontSize: 13, textAlign: "center", marginTop: 40 }}>
            👋 你好！我是 AI 写作助手。<br /><br />
            选择项目目录后，我可以：<br />
            • 帮你规划和撰写 Markdown 文档<br />
            • 理解项目上下文，生成相关内容<br />
            • 润色、续写、提供写作思路<br /><br />
            在下方输入你的问题，按 Enter 发送。
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i} style={{
            alignSelf: msg.role === "user" ? "flex-end" : "flex-start",
            maxWidth: "90%", padding: "8px 12px", borderRadius: 8,
            fontSize: 13, lineHeight: 1.5, whiteSpace: "pre-wrap", wordBreak: "break-word",
            background: msg.role === "user" ? "var(--textora-accent)" : "var(--textora-bg-elev)",
            color: msg.role === "user" ? "#fff" : "var(--textora-fg)",
            border: msg.role === "assistant" ? "1px solid var(--textora-border)" : "none",
          }}>
            {msg.content}
            {msg.role === "assistant" && (
              <div style={{ marginTop: 6, display: "flex", gap: 6 }}>
                <button className="textora-btn" style={{ fontSize: 11, padding: "1px 8px" }}
                  onClick={() => navigator.clipboard.writeText(msg.content)}>复制</button>
                <button className="textora-btn textora-btn-primary" style={{ fontSize: 11, padding: "1px 8px" }}
                  onClick={() => handleInsert(msg.content)}>插入文档</button>
              </div>
            )}
          </div>
        ))}
        {streaming && (
          <div style={{
            alignSelf: "flex-start", maxWidth: "90%", padding: "8px 12px", borderRadius: 8,
            fontSize: 13, lineHeight: 1.5, whiteSpace: "pre-wrap", wordBreak: "break-word",
            background: "var(--textora-bg-elev)", border: "1px solid var(--textora-accent)",
            color: "var(--textora-fg)",
          }}>
            {streaming}<span className="textora-cursor-blink">|</span>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* 快捷指令 */}
      <div style={{
        padding: "8px 14px 0", display: "flex", flexWrap: "wrap", gap: 6,
        borderTop: "1px solid var(--textora-border)",
      }}>
        <span style={{ width: "100%", fontSize: 11, color: "var(--textora-fg-muted)", marginBottom: 2 }}>
          快捷指令
        </span>
        {QUICK_ACTIONS.map((a) => (
          <button key={a.key}
            className="text-xs px-2 py-1 rounded border"
            style={{
              borderColor: "var(--textora-border)", color: "var(--textora-fg)",
              background: "var(--textora-bg-elev)", cursor: "pointer",
              opacity: loading ? 0.5 : 1,
            }}
            disabled={loading}
            onClick={() => void runChat(t(a.label()), a.system)}
          >
            {a.icon} {t(a.label())}
          </button>
        ))}
      </div>

      {/* 输入框 */}
      <div style={{
        padding: "10px 14px", borderTop: "1px solid var(--textora-border)",
        display: "flex", gap: 8, alignItems: "flex-end",
      }}>
        <textarea ref={inputRef} value={input}
          onChange={(e) => setInput(e.target.value)} onKeyDown={handleKeyDown}
          placeholder="输入你的问题... (Enter 发送, Shift+Enter 换行)"
          rows={2}
          style={{
            flex: 1, resize: "none", padding: "6px 10px", fontSize: 13,
            border: "1px solid var(--textora-border)", borderRadius: 6,
            background: "var(--textora-bg)", color: "var(--textora-fg)",
            fontFamily: "inherit", lineHeight: 1.5,
          }}
        />
        <button className="textora-btn textora-btn-primary"
          onClick={handleSend} disabled={loading || !input.trim()}
          style={{ padding: "6px 14px", height: 36 }}>
          {loading ? "..." : "发送"}
        </button>
      </div>
    </div>
  );
}

// Helper to update provider (used in model picker)
function updateAiProvider(id: string, patch: Partial<ProviderConfig>) {
  const { useAppStore } = require("../store/useAppStore");
  useAppStore.getState().updateAiProvider(id, patch);
}
