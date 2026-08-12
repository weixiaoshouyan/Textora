import { useState, useRef, useEffect } from "react";
import type { EditorView } from "@milkdown/prose/view";
import { useAppStore } from "../store/useAppStore";
import { chat } from "../ai/aiService";
import { confirmAiToolCall } from "../ai/confirmToolCall";
import { getActiveProvider } from "../ai/config";
import { useLocale } from "../i18n";

interface Props {
  view: EditorView | null;
  open: boolean;
  onClose: () => void;
  initialSelectedText?: string;
  position?: { x: number; y: number } | null;
}

export function InlineAiCopilot({ view, open, onClose, initialSelectedText = "", position }: Props) {
  const [customPrompt, setCustomPrompt] = useState("");
  const [resultText, setResultText] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [targetLang, setTargetLang] = useState("English");
  const containerRef = useRef<HTMLDivElement>(null);
  const locale = useLocale((s) => s.locale);

  useEffect(() => {
    if (open) {
      setResultText("");
      setErrorMsg("");
      setCustomPrompt("");
    }
  }, [open]);

  if (!open || !view) return null;

  // 获取当前选中的文本
  const { from, to } = view.state.selection;
  const selectedText = initialSelectedText || view.state.doc.textBetween(from, to, "\n");

  const runAiTask = async (promptInstruction: string) => {
    setLoading(true);
    setErrorMsg("");
    setResultText("");

    const providerConfig = await getActiveProvider();
    if (!providerConfig || !providerConfig.apiKey) {
      setErrorMsg(locale === "zh" ? "请先在【设置 -> AI 助手】中配置并启用默认 API Key" : "Please configure default API Key in Settings first.");
      setLoading(false);
      return;
    }

    const aiConfig = {
      apiKey: providerConfig.apiKey,
      endpoint: providerConfig.endpoint,
      model: providerConfig.model,
      enabled: providerConfig.enabled,
    };

    const userMessage = `${promptInstruction}\n\nTarget Text:\n"""\n${selectedText || "None"}\n"""`;

    try {
      await chat({
        config: aiConfig,
        history: [{ role: "user", content: userMessage }],
        systemPrompt: "You are an expert AI editor integrated into Textora. Return ONLY the directly rewritten, translated, or summarized content without meta commentary, markdown code block wrappers, or extra chatter unless asked. You can use tools to fetch additional context if needed.",
        enableTools: true,
        // 从 useAppStore 获取真实工作区根目录，用于 AI 工具调用时的路径边界校验
        workspaceRoot: useAppStore.getState().workspaceRoot || undefined,
        confirmToolCall: confirmAiToolCall,
        onChunk: (chunk) => {
          setResultText((prev) => prev + chunk);
        },
      });
    } catch (err: any) {
      setErrorMsg(err?.message || "AI Request Failed");
    } finally {
      setLoading(false);
    }
  };

  const handleReplace = () => {
    if (!resultText || !view) return;
    const { from, to } = view.state.selection;
    const tr = view.state.tr.replaceWith(
      from,
      to,
      view.state.schema.text(resultText)
    );
    view.dispatch(tr);
    onClose();
  };

  const handleInsertBelow = () => {
    if (!resultText || !view) return;
    const { to } = view.state.selection;
    const tr = view.state.tr.insert(
      to,
      view.state.schema.text("\n\n" + resultText)
    );
    view.dispatch(tr);
    onClose();
  };

  const presets = [
    { label: "✨ " + (locale === "zh" ? "润色语言" : "Polish"), prompt: "Improve the writing style, clarity, and tone of the following text:" },
    { label: "📝 " + (locale === "zh" ? "扩写内容" : "Expand"), prompt: "Expand on the following text with relevant details and logical flow:" },
    { label: "📌 " + (locale === "zh" ? "提炼摘要" : "Summarize"), prompt: "Provide a concise summary of the key points in the following text:" },
    { label: "🔧 " + (locale === "zh" ? "语法纠错" : "Fix Grammar"), prompt: "Fix any grammar, spelling, or punctuation errors in the following text:" },
    { label: "✍️ " + (locale === "zh" ? "接续写作" : "Continue"), prompt: "Based on the text below, naturally write the next paragraph keeping the same tone and style:" },
    { label: "💻 " + (locale === "zh" ? "解释代码" : "Explain Code"), prompt: "Explain the code block below step by step in detail:" },
    { label: "🚀 " + (locale === "zh" ? "重构优化" : "Optimize Code"), prompt: "Refactor and optimize the code block below for readability, performance and clean structure:" },
    { label: "🧹 " + (locale === "zh" ? "中英排版" : "Spacing"), prompt: "Format the following text, fix markdown issues and ensure proper spaces between Chinese and English words:" },
  ];

  const stylePosition = position
    ? { left: Math.min(position.x, window.innerWidth - 440), top: position.y + 10 }
    : { left: "50%", top: "20%", transform: "translateX(-50%)" };

  const languages = ["English", "简体中文", "日本語", "한국어", "Français", "Deutsch", "Español"];

  return (
    <div className="fixed inset-0 z-50 pointer-events-none">
      <div
        ref={containerRef}
        className="pointer-events-auto absolute w-[420px] textora-card textora-glass animate-pop-in p-3 rounded-xl shadow-2xl border"
        style={{
          ...stylePosition,
          borderColor: "var(--textora-border-glass)",
        }}
      >
        <div className="flex items-center justify-between pb-2 mb-2 border-b" style={{ borderColor: "var(--textora-border)" }}>
          <div className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: "var(--textora-accent)" }}>
            <span>✨</span>
            <span>Inline AI Copilot</span>
          </div>
          <button
            className="text-xs px-1.5 py-0.5 rounded hover:bg-black/10 dark:hover:bg-white/10"
            onClick={onClose}
            style={{ color: "var(--textora-fg-muted)" }}
          >
            ✕
          </button>
        </div>

        {/* Selected snippet preview */}
        {selectedText && (
          <div className="text-[11px] p-2 rounded mb-2 max-h-16 overflow-y-auto italic border" style={{ background: "var(--textora-code-bg)", color: "var(--textora-fg-muted)", borderColor: "var(--textora-border)" }}>
            "{selectedText.length > 120 ? selectedText.slice(0, 120) + "..." : selectedText}"
          </div>
        )}

        {/* Translation Row */}
        <div className="flex items-center gap-1.5 mb-2.5 bg-black/5 dark:bg-white/5 p-1.5 rounded border" style={{ borderColor: "var(--textora-border)" }}>
          <span className="text-[11px]" style={{ color: "var(--textora-fg-muted)" }}>🌐 {locale === "zh" ? "翻译为:" : "Translate to:"}</span>
          <select
            value={targetLang}
            onChange={(e) => setTargetLang(e.target.value)}
            disabled={loading}
            className="text-[11px] px-1.5 py-0.5 rounded border outline-none cursor-pointer"
            style={{ background: "var(--textora-bg)", color: "var(--textora-fg)", borderColor: "var(--textora-border)" }}
          >
            {languages.map((l) => (
              <option key={l} value={l}>{l}</option>
            ))}
          </select>
          <button
            type="button"
            disabled={loading}
            onClick={() => runAiTask(`Translate the following text into natural, fluent ${targetLang}:`)}
            className="text-[10px] px-2 py-0.5 rounded bg-blue-600 hover:bg-blue-700 text-white font-medium ml-auto"
          >
            {locale === "zh" ? "立即翻译" : "Translate"}
          </button>
        </div>

        {/* Presets */}
        <div className="grid grid-cols-4 gap-1 mb-2.5">
          {presets.map((p, idx) => (
            <button
              key={idx}
              disabled={loading}
              onClick={() => runAiTask(p.prompt)}
              className="text-[10px] py-1 px-1 rounded transition-all border hover:border-blue-400 truncate"
              style={{
                background: "var(--textora-bg-elev)",
                color: "var(--textora-fg)",
                borderColor: "var(--textora-border)",
              }}
              title={p.label}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Custom Prompt Input */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (customPrompt.trim()) runAiTask(customPrompt.trim());
          }}
          className="flex gap-1.5 mb-2"
        >
          <input
            type="text"
            className="flex-1 text-xs px-2.5 py-1.5 rounded outline-none border focus:border-blue-500"
            style={{ background: "var(--textora-bg)", color: "var(--textora-fg)", borderColor: "var(--textora-border)" }}
            placeholder={locale === "zh" ? "输入自定义指示 (例：改为口语化)" : "Ask AI to change text..."}
            value={customPrompt}
            onChange={(e) => setCustomPrompt(e.target.value)}
          />
          <button
            type="submit"
            disabled={loading || !customPrompt.trim()}
            className="text-xs px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50"
          >
            {loading ? "..." : (locale === "zh" ? "发送" : "Run")}
          </button>
        </form>

        {/* Error notification */}
        {errorMsg && (
          <div className="text-xs text-red-500 p-2 mb-2 rounded bg-red-500/10 border border-red-500/20">
            {errorMsg}
          </div>
        )}

        {/* AI Stream Result Display */}
        {resultText && (
          <div className="mt-2 border-t pt-2" style={{ borderColor: "var(--textora-border)" }}>
            <div className="text-[11px] font-medium mb-1" style={{ color: "var(--textora-fg-muted)" }}>
              {locale === "zh" ? "生成结果：" : "Result:"}
            </div>
            <div className="text-xs p-2.5 rounded max-h-40 overflow-y-auto whitespace-pre-wrap border leading-relaxed" style={{ background: "var(--textora-bg)", color: "var(--textora-fg)", borderColor: "var(--textora-border)" }}>
              {resultText}
            </div>
            <div className="flex gap-2 mt-2">
              <button
                onClick={handleReplace}
                className="flex-1 text-xs py-1.5 rounded font-medium bg-blue-600 hover:bg-blue-700 text-white"
              >
                {locale === "zh" ? "替换选中文本" : "Replace Selection"}
              </button>
              <button
                onClick={handleInsertBelow}
                className="flex-1 text-xs py-1.5 rounded border hover:bg-black/5 dark:hover:bg-white/5"
                style={{ color: "var(--textora-fg)", borderColor: "var(--textora-border)" }}
              >
                {locale === "zh" ? "在下方插入" : "Insert Below"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
