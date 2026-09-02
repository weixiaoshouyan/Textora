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
import { DEFAULT_AI_TITLE } from "../store/slices/aiSlice";
import { chat, type ChatMessage } from "../ai/aiService";
import { confirmAiToolCall } from "../ai/confirmToolCall";
import { useLocale, tFor } from "../i18n";
import { extractDocumentContext, buildProjectContext } from "./ai/chatLogic";
import { AiMarkdown } from "./ai/AiMarkdown";
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
  // tStable：runChat 是 useCallback（依赖数组固定），不能依赖每次渲染都新建的 t；
  // 通过 getState 读最新 locale，仅在调用时取词
  const tStable = useCallback((key: string) => tFor(useLocale.getState().locale)(key), []);
  const content = useAppStore((s) => s.content);
  const workspaceRoot = useAppStore((s) => s.workspaceRoot);
  
  // AI 配置
  const providers = useAppStore((s) => s.aiProviders);
  const activeProviderId = useAppStore((s) => s.aiActiveProviderId);
  const setAiActiveProvider = useAppStore((s) => s.setAiActiveProvider);
  const loadAiProviders = useAppStore((s) => s.loadAiProviders);
  
  // 聊天会话
  const sessions = useAppStore((s) => s.aiSessions);
  const activeSessionId = useAppStore((s) => s.aiActiveSessionId);
  const createAiSession = useAppStore((s) => s.createAiSession);
  const deleteAiSession = useAppStore((s) => s.deleteAiSession);
  const setAiActiveSession = useAppStore((s) => s.setAiActiveSession);
  const updateAiSessionMessages = useAppStore((s) => s.updateAiSessionMessages);
  
  // UI 面板
  const open = useAppStore((s) => s.aiAssistantOpen);
  const setOpen = useAppStore((s) => s.setAiAssistantOpen);
  const setSettingsPanelOpen = useAppStore((s) => s.setSettingsPanelOpen);
  const insertMarkdownAtCursor = useAppStore((s) => s.insertMarkdownAtCursor);

  // 本地状态
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [streaming, setStreaming] = useState("");
  // 流式文本的同步镜像：onChunk 逐块 setState，catch/finally 里读 state 是过期值，
  // abort 落库必须用 ref 取最新完整文本
  const streamingRef = useRef("");
  const appendStreaming = useCallback((chunk: string) => {
    streamingRef.current += chunk;
    setStreaming(streamingRef.current);
  }, []);
  // 错误信息：请求失败（网络/鉴权/超时）必须对用户可见，否则表现为"没有回复"无从排查
  const [error, setError] = useState("");
  const [projectDir, setProjectDir] = useState("");
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [toolExecutionMsg, setToolExecutionMsg] = useState("");
  // "直接写入文档"：AI 回复完成后自动追加到当前文档末尾，无需手动点击"插入文档"
  const [directInsert, setDirectInsert] = useState<boolean>(
    () => localStorage.getItem("textora.ai_direct_insert") !== "off"
  );
  const directInsertRef = useRef(directInsert);
  useEffect(() => { directInsertRef.current = directInsert; }, [directInsert]);
  const toggleDirectInsert = () => {
    setDirectInsert((prev) => {
      const next = !prev;
      localStorage.setItem("textora.ai_direct_insert", next ? "on" : "off");
      return next;
    });
  };
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  // 最新消息快照：避免 runChat 闭包读取 stale messages
  const messagesRef = useRef<ChatMessage[]>([]);
  useEffect(() => { messagesRef.current = messages; }, [messages]);
  // 当前活跃会话快照：流式响应期间切换会话时丢弃旧会话的写入
  const activeSessionRef = useRef<string | null>(null);
  useEffect(() => { activeSessionRef.current = activeSessionId; }, [activeSessionId]);
  // 在途请求的 abort 控制器：切换会话时取消旧请求
  const abortRef = useRef<AbortController | null>(null);
  const loadingRef = useRef(false);
  useEffect(() => { loadingRef.current = loading; }, [loading]);

  // 当前活跃 provider
  const activeProvider = providers.find((p) => p.id === activeProviderId) || providers.find((p) => p.apiKey) || null;
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

  // 切换会话（activeSessionId 变化）时取消在途请求，避免旧请求继续写旧会话或污染新会话 UI。
  // 注意：不能把 sessions 放进依赖——发消息时 updateAiSessionMessages 会更新 sessions，
  // 若依赖 sessions，请求刚发出就会被这个 effect abort（AI 聊天完全不可用）。
  useEffect(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setLoading(false);
    streamingRef.current = "";
    setStreaming("");
    setToolExecutionMsg("");
  }, [activeSessionId]);

  // 当会话消息历史变化时，同步当前会话的 UI（不 abort 在途请求）
  useEffect(() => {
    const active = sessions.find((s) => s.id === activeSessionId);
    if (active) {
      setMessages(active.messages || []);
      if (active.projectDir) setProjectDir(active.projectDir);
    } else {
      setMessages([]);
    }
  }, [activeSessionId, sessions]);

  // 当 workspaceRoot 变化且 projectDir 为空时同步
  useEffect(() => {
    if (!projectDir && workspaceRoot) {
      setProjectDir(workspaceRoot);
    }
  }, [workspaceRoot, projectDir]);

  // 文档/项目上下文提取逻辑见 ./ai/chatLogic.ts（纯函数，可单测）
  const getDocContext = useCallback((): string => extractDocumentContext(content), [content]);

  const buildProjectContextCb = useCallback((): string => {
    return buildProjectContext(projectDir, workspaceRoot || "");
  }, [projectDir, workspaceRoot]);

  const runChat = useCallback(
    async (userText: string, systemPrompt?: string) => {
      if (loadingRef.current) return;
      if (!activeProvider || !activeProvider.apiKey) {
        setError(tStable("ai.errorNoKey"));
        setSettingsPanelOpen(true);
        return;
      }

      // 确保当前有活跃的会话 ID（基于 ref 读取最新值，避免 stale closure）
      let sessionId = activeSessionRef.current;
      if (!sessionId) {
        sessionId = createAiSession(projectDir || workspaceRoot || undefined);
      }
      const mySession = sessionId;
      // 请求发起后若用户切换了会话，丢弃对旧会话 UI 的写入
      const stillActive = () => activeSessionRef.current === mySession;

      const userMsg: ChatMessage = { role: "user", content: userText };
      // 基于最新消息快照构建，副作用移出 state updater（StrictMode 下 updater 会被双调用）
      const newMessages = [...messagesRef.current, userMsg];
      setMessages(newMessages);
      updateAiSessionMessages(mySession, newMessages);

      setInput("");
      setError("");
      setLoading(true);
      streamingRef.current = "";
      setStreaming("");
      setToolExecutionMsg("");
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const projectContext = buildProjectContextCb();
        const docContext = getDocContext();
        const fullText = await chat({
          config: { apiKey: activeProvider.apiKey, endpoint: activeProvider.endpoint, model: activeProvider.model, enabled: true },
          history: newMessages.map((m) => ({ role: m.role, content: m.content })),
          documentContext: docContext,
          projectContext,
          enableTools: true,
          workspaceRoot: projectDir || workspaceRoot || "",
          onToolCall: (name) => {
            if (!stillActive()) return;
            setToolExecutionMsg(`${tStable("ai.toolRunning")}: ${name}...`);
          },
          confirmToolCall: confirmAiToolCall,
          onChunk: (chunk) => {
            // 会话已切换时不再把旧请求的流式文本写入新会话 UI
            if (!stillActive()) return;
            appendStreaming(chunk);
          },
          systemPrompt,
          signal: controller.signal,
        });
        const finalMessages: ChatMessage[] = [...newMessages, { role: "assistant", content: fullText }];
        updateAiSessionMessages(mySession, finalMessages);
        if (!stillActive()) {
          // 用户已切到其他会话：不再更新当前 UI，旧会话的历史已落库
          return;
        }
        setMessages(prev => [...prev, { role: "assistant", content: fullText }]);
        setStreaming("");
        setToolExecutionMsg("");
        // 若开启"直接写入文档"，AI 回复完成后自动追加到文档末尾
        if (directInsertRef.current && fullText.trim()) {
          try {
            insertMarkdownAtCursor(fullText);
          } catch (err) {
            console.warn("[AiAssistant] direct insert failed:", err);
          }
        }
      } catch (e: any) {
        // 用户主动点击"停止"或切换会话导致的 abort：
        // 把已流式输出的部分落库为 assistant 消息，否则这部分内容丢失
        // （旧会话只留用户消息、助手回复为空，且无法恢复）
        if (controller.signal.aborted) {
          if (streamingRef.current.trim()) {
            const partial: ChatMessage[] = [
              ...newMessages,
              { role: "assistant", content: streamingRef.current },
            ];
            updateAiSessionMessages(mySession, partial);
          }
          streamingRef.current = "";
          if (stillActive()) {
            setStreaming("");
            setToolExecutionMsg("");
          }
          return;
        }
        if (!stillActive()) return;
        setError(e.message || tStable("ai.errorUnknown"));
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
        streamingRef.current = "";
        if (stillActive()) {
          setLoading(false);
          setToolExecutionMsg("");
        }
      }
    },
    [activeProvider, buildProjectContextCb, getDocContext, setSettingsPanelOpen, createAiSession, updateAiSessionMessages, insertMarkdownAtCursor, projectDir, workspaceRoot, appendStreaming, tStable]
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
    // 走 Milkdown 高效插入路径，避免 replaceAllAction 全量 re-parse 卡死界面
    insertMarkdownAtCursor(text);
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
        <button className="textora-btn" onClick={handleNewChat} title={t("ai.newChat")}
          style={{ fontSize: 12, padding: "2px 8px" }}>+ {t("ai.newChat")}</button>
        <button className="textora-btn" onClick={() => setShowHistory(!showHistory)} title={t("ai.history")}
          style={{ fontSize: 12, padding: "2px 8px" }}>📋 {t("ai.history")}</button>
        <button className="textora-btn" onClick={toggleDirectInsert}
          title={directInsert ? t("ai.directWriteOn") : t("ai.directWriteOff")}
          style={{
            fontSize: 11, padding: "2px 8px",
            background: directInsert ? "var(--textora-accent)" : "transparent",
            color: directInsert ? "#fff" : "var(--textora-fg)",
            border: "1px solid var(--textora-border)",
          }}>
          {directInsert ? "✍️ " + t("ai.directWrite") : "✍️ " + t("ai.onlyChat")}
        </button>
        <div style={{ flex: 1 }} />
        {/* 模型选择器 */}
        <div style={{ position: "relative" }}>
          <button className="textora-btn" onClick={() => setShowModelPicker(!showModelPicker)}
            style={{ fontSize: 11, padding: "2px 8px", maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {activeProvider ? (activeProvider.label + " / " + (activeProvider.model || t("ai.unspecified"))) : t("ai.selectModel")} ▾
          </button>
          {showModelPicker && (
            <div className="textora-card" style={{
              position: "absolute", top: "100%", right: 0, zIndex: 100,
              minWidth: 200, maxHeight: 300, overflow: "auto", padding: 4,
            }}>
              {configuredProviders.length === 0 ? (
                <div style={{ padding: 8, fontSize: 12, color: "var(--textora-fg-muted)" }}>
                  {t("ai.noProviders")}
                </div>
              ) : (
                configuredProviders.map((p) => (
                  <div key={p.id} onClick={() => {
                    setAiActiveProvider(p.id);
                    setShowModelPicker(false);
                  }}
                    className="textora-ai-model-item" style={{
                      padding: "6px 12px", fontSize: 12, cursor: "pointer",
                      borderRadius: 4,
                      background: p.id === activeProviderId ? "var(--textora-accent)" : "transparent",
                      color: p.id === activeProviderId ? "#fff" : "var(--textora-fg)",
                      marginBottom: 2,
                    }}>
                    <div style={{ fontWeight: 600 }}>{p.label}</div>
                    <div style={{ fontSize: 10, opacity: 0.8 }}>{p.model || t("ai.unspecified")}</div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
        <button className="textora-btn" onClick={() => setOpen(false)} title={t("common.close")}
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
          placeholder={t("ai.projectDirPlaceholder")}
          style={{
            flex: 1, fontSize: 11, padding: "2px 6px",
            border: "1px solid var(--textora-border)", borderRadius: 4,
            background: "var(--textora-bg)", color: "var(--textora-fg)",
          }}
        />
        <button className="textora-btn" onClick={handlePickProjectDir} title={t("ai.browse")}
          style={{ fontSize: 11, padding: "2px 6px" }}>{t("ai.browse")}</button>
      </div>

      {/* 历史面板 */}
      {showHistory && (
        <div style={{
          maxHeight: 200, overflow: "auto", borderBottom: "1px solid var(--textora-border)",
          background: "var(--textora-bg-elev)",
        }}>
          {sessions.length === 0 ? (
            <div style={{ padding: 12, fontSize: 12, color: "var(--textora-fg-muted)", textAlign: "center" }}>
              {t("ai.noHistory")}
            </div>
          ) : (
            sessions.map((s) => (
              <div key={s.id}
                className="flex items-center justify-between hover:bg-black/5 dark:hover:bg-white/5"
                style={{
                  padding: "6px 12px", fontSize: 12, cursor: "pointer",
                  borderBottom: "1px solid var(--textora-border)",
                  background: s.id === activeSessionId ? "var(--textora-bg-muted)" : "transparent",
                }}>
                <div style={{ flex: 1, minWidth: 0 }} onClick={() => { handleSelectSession(s); setShowHistory(false); }}>
                  <div style={{ fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {s.title === DEFAULT_AI_TITLE || !s.title ? t("ai.untitledSession") : s.title}
                  </div>
                  <div style={{ fontSize: 10, color: "var(--textora-fg-muted)" }}>
                    {new Date(s.updatedAt).toLocaleString()} · {s.messages.length} 条消息
                  </div>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteAiSession(s.id);
                  }}
                  className="text-xs px-1.5 py-0.5 rounded text-red-500 hover:bg-red-500/10 ml-2"
                  title={t("ai.deleteSession")}
                >
                  🗑️
                </button>
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
            👋 {t("ai.welcomeShort")}<br /><br />
            {t("ai.welcomeBulletsTitle")}<br />
            • {t("ai.welcomeBullet1")}<br />
            • {t("ai.welcomeBullet2")}<br />
            • {t("ai.welcomeBullet3")}<br /><br />
            {directInsert ? "✍️ " + t("ai.modeDirect") : t("ai.modeChat")}
            <br />{t("ai.welcomeHint")}
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i} style={{
            alignSelf: msg.role === "user" ? "flex-end" : "flex-start",
            maxWidth: "90%", padding: "8px 12px", borderRadius: 8,
            fontSize: 13, lineHeight: 1.5,
            background: msg.role === "user" ? "var(--textora-accent)" : "var(--textora-bg-elev)",
            color: msg.role === "user" ? "#fff" : "var(--textora-fg)",
            border: msg.role === "assistant" ? "1px solid var(--textora-border)" : "none",
            wordBreak: "break-word",
          }}>
            {msg.role === "assistant" ? <AiMarkdown text={msg.content} /> : msg.content}
            {msg.role === "assistant" && (
              <div style={{ marginTop: 6, display: "flex", gap: 6 }}>
                <button className="textora-btn" style={{ fontSize: 11, padding: "1px 8px" }}
                  onClick={() => navigator.clipboard.writeText(msg.content)}>{t("ai.copy")}</button>
                <button className="textora-btn textora-btn-primary" style={{ fontSize: 11, padding: "1px 8px" }}
                  onClick={() => handleInsert(msg.content)}>{t("ai.insertDoc")}</button>
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
        {toolExecutionMsg && (
          <div style={{
            alignSelf: "flex-start", maxWidth: "90%", padding: "6px 10px", borderRadius: 8,
            fontSize: 12, lineHeight: 1.5, background: "var(--textora-bg)",
            color: "var(--textora-fg-muted)", fontStyle: "italic", border: "1px dashed var(--textora-border)",
            display: "flex", alignItems: "center", gap: 4
          }}>
            <span className="textora-spin">⚙️</span> {toolExecutionMsg}
          </div>
        )}
        {error && (
          <div role="alert" style={{
            alignSelf: "flex-start", maxWidth: "90%", padding: "8px 12px", borderRadius: 8,
            fontSize: 12, lineHeight: 1.5, whiteSpace: "pre-wrap", wordBreak: "break-word",
            background: "var(--textora-bg-elev)",
            color: "#d4380d",
            border: "1px solid #ffa39e",
            display: "flex", alignItems: "flex-start", gap: 6,
          }}>
            <span>⚠️</span>
            <span style={{ flex: 1 }}>{error}</span>
            <button
              className="textora-btn"
              style={{ fontSize: 11, padding: "0 6px", whiteSpace: "nowrap" }}
              onClick={() => setError("")}
            >
              ✕
            </button>
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
          {t("ai.quickActions")}
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
          placeholder={t("ai.placeholder") + " (Enter " + t("ai.enterSend") + ", Shift+Enter " + t("ai.enterNewline") + ")"}
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
          {loading ? "..." : t("ai.send")}
        </button>
      </div>
    </div>
  );
}

