import { useState, useEffect, useCallback } from "react";
import { useAppStore } from "../store/useAppStore";
import { useLocale, tFor } from "../i18n";
import {
  SHORTCUTS,
  getBinding,
  formatBinding,
  findConflict,
  saveCustomBindings,
  loadCustomBindings,
  resetBinding,
  eventToBinding,
} from "../hooks/shortcutSchema";
import { refreshShortcutBindings } from "../hooks/useShortcuts";
import {
  PROVIDER_TEMPLATES,
  saveProviderConfigs,
  setActiveProviderId as setActiveProviderIdFromConfig,
  getTemplate,
  type ProviderConfig,
} from "../ai/config";
import { chat, listModels } from "../ai/aiService";
import { getAppVersion } from "../ipc";

type Category = "general" | "editor" | "view" | "ai" | "shortcuts" | "about";

const THEMES: Array<{ value: "light" | "dark" | "sepia" | "nord"; key: string }> = [
  { value: "light", key: "settings.theme.light" },
  { value: "dark", key: "settings.theme.dark" },
  { value: "sepia", key: "settings.theme.sepia" },
  { value: "nord", key: "settings.theme.nord" },
];

const FONTS: Array<{ value: string; label: string }> = [
  {
    value:
      "Inter, 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif",
    label: "System Sans",
  },
  {
    value:
      "'Source Han Serif SC', 'Songti SC', 'SimSun', Georgia, 'Times New Roman', serif",
    label: "Serif",
  },
  {
    value:
      "ui-monospace, SFMono-Regular, 'JetBrains Mono', Menlo, Consolas, monospace",
    label: "Monospace",
  },
];

export function SettingsPanel() {
  const settings = useAppStore((s) => s.settings);
  const theme = useAppStore((s) => s.theme);
  const updateSettings = useAppStore((s) => s.updateSettings);
  const toggleFocus = useAppStore((s) => s.toggleFocus);
  const toggleTypewriter = useAppStore((s) => s.toggleTypewriter);
  const toggleSource = useAppStore((s) => s.toggleSource);
  const toggleReading = useAppStore((s) => s.toggleReading);
  const toggleSpellcheck = useAppStore((s) => s.toggleSpellcheck);
  const toggleSidebar = useAppStore((s) => s.toggleSidebar);
  const toggleOutline = useAppStore((s) => s.toggleOutline);
  const setTheme = useAppStore((s) => s.setTheme);
  const setAiAssistantOpen = useAppStore((s) => s.setAiAssistantOpen);
  const aiProviders = useAppStore((s) => s.aiProviders);
  const addAiProvider = useAppStore((s) => s.addAiProvider);
  const removeAiProvider = useAppStore((s) => s.removeAiProvider);
  const updateAiProvider = useAppStore((s) => s.updateAiProvider);
  const close = () => useAppStore.setState({ settingsPanelOpen: false });
  const locale = useLocale((s) => s.locale);
  const setLocale = useLocale((s) => s.setLocale);
  const t = tFor(locale);

  const [activeCategory, setActiveCategory] = useState<Category>("general");
  const [appVersion, setAppVersion] = useState("");

  useEffect(() => {
    void getAppVersion().then((v) => setAppVersion(v));
  }, []);

  const categories: Array<{ id: Category; label: string; icon: string }> = [
    { id: "general", label: t("settings.category.general"), icon: "general" },
    { id: "editor", label: t("settings.category.editor"), icon: "editor" },
    { id: "view", label: t("settings.category.view"), icon: "view" },
    { id: "ai", label: t("settings.category.ai"), icon: "ai" },
    { id: "shortcuts", label: t("settings.category.shortcuts"), icon: "shortcuts" },
    { id: "about", label: t("settings.category.about"), icon: "about" },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm transition-opacity"
      style={{ background: "rgba(0,0,0,0.3)" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div
        className="textora-card textora-glass animate-pop-in flex rounded-2xl shadow-2xl border overflow-hidden"
        style={{
          width: 760,
          maxWidth: "92vw",
          height: 560,
          maxHeight: "88vh",
          borderColor: "var(--textora-border-glass)",
        }}
      >
        {/* Left sidebar */}
        <div
          className="flex flex-col shrink-0"
          style={{
            width: 168,
            background: "var(--textora-bg-elev)",
            borderRight: "1px solid var(--textora-border)",
          }}
        >
          <div
            className="px-4 py-3 font-semibold"
            style={{ fontSize: 13, borderBottom: "1px solid var(--textora-border)" }}
          >
            {t("settings.title")}
          </div>
          <div className="flex-1 overflow-auto py-1">
            {categories.map((cat) => (
              <button
                key={cat.id}
                className="w-full flex items-center gap-2.5 px-4 py-2 text-left cursor-pointer transition-colors"
                style={{
                  fontSize: 12.5,
                  fontWeight: activeCategory === cat.id ? 600 : 400,
                  color: activeCategory === cat.id ? "var(--textora-accent)" : "var(--textora-fg-muted)",
                  background: activeCategory === cat.id ? "color-mix(in srgb, var(--textora-accent) 8%, transparent)" : "transparent",
                  borderLeft: activeCategory === cat.id ? "2px solid var(--textora-accent)" : "2px solid transparent",
                }}
                onMouseEnter={(e) => {
                  if (activeCategory !== cat.id)
                    e.currentTarget.style.background = "var(--textora-bg-muted)";
                }}
                onMouseLeave={(e) => {
                  if (activeCategory !== cat.id)
                    e.currentTarget.style.background = "transparent";
                }}
                onClick={() => setActiveCategory(cat.id)}
              >
                <CategoryIcon name={cat.icon} />
                {cat.label}
              </button>
            ))}
          </div>
        </div>

        {/* Right content */}
        <div className="flex-1 flex flex-col min-w-0">
          <div
            className="flex items-center justify-between px-5 py-3 shrink-0"
            style={{ borderBottom: "1px solid var(--textora-border)" }}
          >
            <span className="font-semibold" style={{ fontSize: 13 }}>
              {categories.find((c) => c.id === activeCategory)?.label}
            </span>
            <button
              className="text-xs px-2 py-0.5 rounded cursor-pointer"
              style={{ color: "var(--textora-fg-muted)" }}
              onClick={close}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--textora-bg-muted)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              ✕
            </button>
          </div>
          <div className="flex-1 overflow-auto px-5 py-4">
            {activeCategory === "general" && (
              <GeneralSection
                settings={settings}
                updateSettings={updateSettings}
                theme={theme}
                locale={locale}
                setTheme={setTheme}
                setLocale={setLocale}
                t={t}
              />
            )}
            {activeCategory === "editor" && (
              <EditorSection
                settings={settings}
                updateSettings={updateSettings}
                toggleSpellcheck={toggleSpellcheck}
                t={t}
              />
            )}
            {activeCategory === "view" && (
              <ViewSection
                settings={settings}
                updateSettings={updateSettings}
                toggleFocus={toggleFocus}
                toggleTypewriter={toggleTypewriter}
                toggleSource={toggleSource}
                toggleReading={toggleReading}
                toggleSidebar={toggleSidebar}
                toggleOutline={toggleOutline}
                t={t}
              />
            )}
            {activeCategory === "ai" && (
              <AISection
                aiProviders={aiProviders}
                addAiProvider={addAiProvider}
                removeAiProvider={removeAiProvider}
                updateAiProvider={updateAiProvider}
                setAiAssistantOpen={setAiAssistantOpen}
                t={t}
              />
            )}
            {activeCategory === "shortcuts" && <ShortcutsSection t={t} />}
            {activeCategory === "about" && (
              <AboutSection appVersion={appVersion} t={t} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ===== Category Icons =====

function CategoryIcon({ name }: { name: string }) {
  const props = {
    width: 14,
    height: 14,
    viewBox: "0 0 14 14",
    fill: "none",
    style: { flexShrink: 0 },
  };
  switch (name) {
    case "general":
      return (
        <svg {...props}>
          <circle cx="7" cy="7" r="2.5" stroke="currentColor" strokeWidth="1.2" />
          <path d="M7 1.5v1.5M7 11v1.5M1.5 7h1.5M11 7h1.5M3 3l1 1M10 10l1 1M3 11l1-1M10 4l1-1" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      );
    case "editor":
      return (
        <svg {...props}>
          <path d="M2 3h10v8H2z" stroke="currentColor" strokeWidth="1.2" />
          <path d="M4 5.5h6M4 7.5h4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      );
    case "view":
      return (
        <svg {...props}>
          <path d="M1.5 3.5h11v7h-11z" stroke="currentColor" strokeWidth="1.2" />
          <path d="M1.5 5.5h11" stroke="currentColor" strokeWidth="1.2" />
        </svg>
      );
    case "ai":
      return (
        <svg {...props}>
          <path d="M7 1.5l1.3 3.2 3.2 1.3-3.2 1.3L7 10.5 5.7 7.3 2.5 6l3.2-1.3z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
        </svg>
      );
    case "shortcuts":
      return (
        <svg {...props}>
          <rect x="2" y="3" width="10" height="8" rx="1" stroke="currentColor" strokeWidth="1.2" />
          <path d="M4 6h1M4 8h2M8 6h2M8 8h1" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      );
    case "about":
      return (
        <svg {...props}>
          <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.2" />
          <path d="M7 6v3.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          <circle cx="7" cy="4" r="0.5" fill="currentColor" />
        </svg>
      );
    default:
      return null;
  }
}

// ===== General Section =====

function GeneralSection({
  settings,
  updateSettings,
  theme,
  locale,
  setTheme,
  setLocale,
  t,
}: {
  settings: any;
  updateSettings: (patch: any) => void;
  theme: string;
  locale: string;
  setTheme: (theme: any) => void;
  setLocale: (locale: any) => void;
  t: (key: string) => string;
}) {
  return (
    <div className="flex flex-col gap-5">
      <Row label={t("settings.theme")}>
        <div className="flex gap-1.5 flex-wrap">
          {THEMES.map((th) => (
            <button
              key={th.value}
              className="text-xs px-2.5 py-1.5 rounded border transition-colors cursor-pointer"
              style={{
                background: theme === th.value ? "var(--textora-accent)" : "transparent",
                color: theme === th.value ? "var(--textora-accent-fg)" : "var(--textora-fg-muted)",
                borderColor: theme === th.value ? "var(--textora-accent)" : "var(--textora-border)",
              }}
              onMouseEnter={() =>
                document.documentElement.setAttribute("data-theme", th.value)
              }
              onMouseLeave={() =>
                document.documentElement.setAttribute("data-theme", theme)
              }
              onClick={() => setTheme(th.value)}
            >
              {t(th.key)}
            </button>
          ))}
        </div>
      </Row>

      <Row label={t("settings.language")}>
        <div className="flex gap-1.5">
          {(["zh", "en"] as const).map((l) => (
            <button
              key={l}
              className="text-xs px-2.5 py-1.5 rounded border transition-colors cursor-pointer"
              style={{
                background: locale === l ? "var(--textora-accent)" : "transparent",
                color: locale === l ? "var(--textora-accent-fg)" : "var(--textora-fg-muted)",
                borderColor: locale === l ? "var(--textora-accent)" : "var(--textora-border)",
              }}
              onClick={() => setLocale(l)}
            >
              {l === "zh" ? "中文" : "English"}
            </button>
          ))}
        </div>
      </Row>

      <Row label={t("settings.autoSave")}>
        <select
          className="px-2 py-1 border rounded text-xs bg-transparent cursor-pointer"
          style={{ borderColor: "var(--textora-border)", color: "var(--textora-fg)" }}
          value={settings.autoSaveSeconds}
          onChange={(e) => {
            const val = Number(e.target.value);
            updateSettings({ autoSaveSeconds: val });
          }}
        >
          <option value={0}>{t("autoSave.off")}</option>
          <option value={30}>{t("autoSave.30s")}</option>
          <option value={60}>{t("autoSave.1m")}</option>
          <option value={300}>{t("autoSave.5m")}</option>
        </select>
      </Row>
    </div>
  );
}

// ===== Editor Section =====

function EditorSection({
  settings,
  updateSettings,
  toggleSpellcheck,
  t,
}: {
  settings: any;
  updateSettings: (patch: any) => void;
  toggleSpellcheck: () => void;
  t: (key: string) => string;
}) {
  return (
    <div className="flex flex-col gap-5">
      <Row label={t("settings.fontSize")}>
        <div className="flex items-center gap-2">
          <input
            type="range"
            min={10}
            max={32}
            value={settings.fontSize}
            onChange={(e) => updateSettings({ fontSize: Number(e.target.value) })}
            style={{ accentColor: "var(--textora-accent)" }}
          />
          <span className="text-xs font-mono" style={{ color: "var(--textora-fg-muted)" }}>
            {settings.fontSize}px
          </span>
        </div>
      </Row>

      <Row label={t("settings.fontFamily")}>
        <select
          className="px-2 py-1 border rounded text-xs bg-transparent cursor-pointer"
          style={{ borderColor: "var(--textora-border)", color: "var(--textora-fg)" }}
          value={settings.fontFamily}
          onChange={(e) => updateSettings({ fontFamily: e.target.value })}
        >
          {FONTS.map((f) => (
            <option key={f.label} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
      </Row>

      <Row label={t("settings.spellcheck")}>
        <Switch checked={settings.spellcheck} onChange={toggleSpellcheck} />
      </Row>
    </div>
  );
}

// ===== View Section =====

function ViewSection({
  settings,
  updateSettings,
  toggleFocus,
  toggleTypewriter,
  toggleSource,
  toggleReading,
  toggleSidebar,
  toggleOutline,
  t,
}: {
  settings: any;
  updateSettings: (patch: Partial<any>) => void;
  toggleFocus: () => void;
  toggleTypewriter: () => void;
  toggleSource: () => void;
  toggleReading: () => void;
  toggleSidebar: () => void;
  toggleOutline: () => void;
  t: (key: string) => string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <ViewRow label={t("sidebar")} checked={settings.sidebarVisible} onChange={toggleSidebar} />
      <ViewRow label={t("outline")} checked={settings.outlineVisible} onChange={toggleOutline} />
      <ViewRow label={t("focus")} checked={settings.focusMode} onChange={toggleFocus} />
      <ViewRow label={t("typewriter")} checked={settings.typewriterMode} onChange={toggleTypewriter} />
      <ViewRow label={t("source")} checked={settings.sourceMode} onChange={toggleSource} />
      <ViewRow label={t("settings.readingMode")} checked={settings.readingMode} onChange={toggleReading} />
      <div className="pt-2 text-xs font-semibold" style={{ color: "var(--textora-fg-muted)" }}>
        {t("settings.pdfExport")}
      </div>
      <ViewRow
        label={t("settings.pdfHeader")}
        checked={!!settings.pdfHeader}
        onChange={() => updateSettings({ pdfHeader: !settings.pdfHeader })}
      />
      <ViewRow
        label={t("settings.pdfFooter")}
        checked={!!settings.pdfFooter}
        onChange={() => updateSettings({ pdfFooter: !settings.pdfFooter })}
      />
    </div>
  );
}

function ViewRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <div className="flex items-center justify-between py-2 text-xs" style={{ borderBottom: "1px solid var(--textora-border)" }}>
      <span style={{ color: "var(--textora-fg)" }}>{label}</span>
      <Switch checked={checked} onChange={onChange} />
    </div>
  );
}

// ===== AI Section =====

function AISection({
  aiProviders,
  addAiProvider,
  removeAiProvider,
  updateAiProvider,
  setAiAssistantOpen,
  t,
}: {
  aiProviders: ProviderConfig[];
  addAiProvider: (templateId: string, label: string, apiKey: string, model: string) => void;
  removeAiProvider: (id: string) => void;
  updateAiProvider: (id: string, patch: Partial<ProviderConfig>) => void;
  setAiAssistantOpen: (open: boolean) => void;
  t: (key: string) => string;
}) {
  const aiActiveProviderId = useAppStore((s) => s.aiActiveProviderId);
  const [showApiKeys, setShowApiKeys] = useState<Record<string, boolean>>({});
  const [testStatuses, setTestStatuses] = useState<Record<string, { loading: boolean; success?: boolean; msg?: string }>>({});
  const [expandedProviderId, setExpandedProviderId] = useState<string | null>(null);
  const [availableModels, setAvailableModels] = useState<Record<string, string[]>>({});
  const [modelLoading, setModelLoading] = useState<Record<string, boolean>>({});

  // 一键配置状态
  const domesticTemplates = PROVIDER_TEMPLATES.filter((t) => t.domestic);
  const [quickTemplateId, setQuickTemplateId] = useState(domesticTemplates[0]?.id ?? "");
  const [quickApiKey, setQuickApiKey] = useState("");
  const [quickShowKey, setQuickShowKey] = useState(false);
  const [quickModel, setQuickModel] = useState(domesticTemplates[0]?.defaultModel ?? "");
  const [quickSuccess, setQuickSuccess] = useState(false);
  const [quickModels, setQuickModels] = useState<string[]>([]);
  const [quickModelsLoading, setQuickModelsLoading] = useState(false);

  const quickTemplate = PROVIDER_TEMPLATES.find((t) => t.id === quickTemplateId);

  // 当 API key 或 endpoint 变化时，尝试获取模型列表
  const quickEndpoint = quickTemplate?.endpoint;
  useEffect(() => {
    if (!quickEndpoint || !quickApiKey.trim()) {
      setQuickModels([]);
      return;
    }

    const fetchModels = async () => {
      setQuickModelsLoading(true);
      try {
        const models = await listModels({
          apiKey: quickApiKey.trim(),
          endpoint: quickEndpoint,
          model: "",
          enabled: true,
        });
        setQuickModels(models);
        // 如果当前选中的模型不在列表中，自动选择第一个（函数式更新避免依赖 quickModel）
        setQuickModel((prev) => (models.length > 0 && !models.includes(prev) ? models[0] : prev));
      } catch (err) {
        console.warn("Failed to fetch models:", err);
        setQuickModels([]);
      } finally {
        setQuickModelsLoading(false);
      }
    };

    // 延迟 500ms 再请求，避免用户输入过程中频繁请求
    const timer = setTimeout(fetchModels, 500);
    return () => clearTimeout(timer);
  }, [quickApiKey, quickEndpoint]);

  // 为已配置的 provider 获取模型列表
  const fetchModelsForProvider = async (provider: ProviderConfig) => {
    if (!provider.apiKey || !provider.endpoint) return;
    
    setModelLoading((prev) => ({ ...prev, [provider.id]: true }));
    try {
      const models = await listModels({
        apiKey: provider.apiKey,
        endpoint: provider.endpoint,
        model: provider.model,
        enabled: true,
      });
      setAvailableModels((prev) => ({ ...prev, [provider.id]: models }));
    } catch (err) {
      console.warn("Failed to fetch models for provider:", err);
    } finally {
      setModelLoading((prev) => ({ ...prev, [provider.id]: false }));
    }
  };

  // 当 provider 展开时，获取其模型列表
  useEffect(() => {
    if (expandedProviderId) {
      const provider = aiProviders.find((p) => p.id === expandedProviderId);
      if (provider && !availableModels[expandedProviderId]) {
        fetchModelsForProvider(provider);
      }
    }
    // 展开变化 / providers 加载完成 / 模型列表补齐后重试；守卫条件避免重复请求
  }, [expandedProviderId, aiProviders, availableModels]);

  const handleQuickApply = () => {
    if (!quickTemplateId || !quickApiKey.trim()) return;
    const template = getTemplate(quickTemplateId);
    if (!template) return;
    // 检查是否已有同 templateId 且同 apiKey 的 provider
    const existing = aiProviders.find(
      (p) => p.templateId === quickTemplateId && p.apiKey === quickApiKey.trim()
    );
    if (existing) {
      // 已存在，直接设为活跃
      useAppStore.getState().setAiActiveProvider(existing.id);
      setQuickSuccess(true);
      setTimeout(() => setQuickSuccess(false), 2000);
      return;
    }
    const label = template.label;
    addAiProvider(quickTemplateId, label, quickApiKey.trim(), quickModel || template.defaultModel);
    setQuickApiKey("");
    setQuickSuccess(true);
    setTimeout(() => setQuickSuccess(false), 2000);
  };

  const setActiveProviderId = (id: string) => {
    useAppStore.setState({ aiActiveProviderId: id });
    const { aiProviders } = useAppStore.getState();
    void saveProviderConfigs(aiProviders);
    setActiveProviderIdFromConfig(id);
  };

  const handleTestConnection = async (provider: ProviderConfig) => {
    setTestStatuses((prev) => ({ ...prev, [provider.id]: { loading: true } }));
    try {
      const resp = await chat({
        config: {
          apiKey: provider.apiKey,
          endpoint: provider.endpoint,
          model: provider.model,
          enabled: true,
        },
        history: [{ role: "user", content: "Hello" }],
        systemPrompt: "Reply ONLY with OK.",
      });
      if (resp) {
        setTestStatuses((prev) => ({ ...prev, [provider.id]: { loading: false, success: true } }));
      } else {
        throw new Error("No response body");
      }
    } catch (err: any) {
      setTestStatuses((prev) => ({
        ...prev,
        [provider.id]: { loading: false, success: false, msg: err?.message || "Failed" },
      }));
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {/* 一键配置 */}
      <div>
        <div className="text-xs font-semibold mb-1" style={{ color: "var(--textora-fg)" }}>
          {t("settings.ai.quickSetup")}
        </div>
        <div className="text-xs mb-3" style={{ color: "var(--textora-fg-muted)" }}>
          {t("settings.ai.quickSetup.hint")}
        </div>
        <div
          className="rounded-lg p-3"
          style={{ background: "var(--textora-bg-elev)", border: "1px solid var(--textora-border)" }}
        >
          {/* Provider selector */}
          <div className="flex items-center gap-2 mb-2.5">
            <span className="text-xs w-16 shrink-0" style={{ color: "var(--textora-fg-muted)" }}>
              {t("settings.ai.provider")}
            </span>
            <select
              className="flex-1 px-2 py-1.5 border rounded text-xs bg-transparent cursor-pointer"
              style={{ borderColor: "var(--textora-border)", color: "var(--textora-fg)" }}
              value={quickTemplateId}
              onChange={(e) => {
                const id = e.target.value;
                setQuickTemplateId(id);
                const tmpl = getTemplate(id);
                if (tmpl) setQuickModel(tmpl.defaultModel);
              }}
            >
              {domesticTemplates.map((tmpl) => (
                <option key={tmpl.id} value={tmpl.id}>
                  {tmpl.label}
                </option>
              ))}
            </select>
          </div>

          {/* API Key */}
          <div className="flex items-center gap-2 mb-2.5">
            <span className="text-xs w-16 shrink-0" style={{ color: "var(--textora-fg-muted)" }}>
              API Key
            </span>
            <div className="flex-1 flex gap-1">
              <input
                type={quickShowKey ? "text" : "password"}
                value={quickApiKey}
                placeholder={quickTemplate?.keyPlaceholder || "..."}
                onChange={(e) => setQuickApiKey(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleQuickApply(); }}
                className="flex-1 px-2 py-1.5 border rounded text-xs outline-none"
                style={{ borderColor: "var(--textora-border)", background: "var(--textora-bg)", color: "var(--textora-fg)" }}
              />
              <button
                type="button"
                onClick={() => setQuickShowKey(!quickShowKey)}
                className="text-xs px-2 py-1.5 rounded border cursor-pointer"
                style={{ color: "var(--textora-fg-muted)", borderColor: "var(--textora-border)" }}
              >
                {quickShowKey ? t("settings.ai.hideKey") : t("settings.ai.showKey")}
              </button>
            </div>
          </div>

          {/* Model selector + apply */}
          <div className="flex items-center gap-2">
            <span className="text-xs w-16 shrink-0" style={{ color: "var(--textora-fg-muted)" }}>
              {t("settings.ai.model")}
            </span>
            {quickModelsLoading ? (
              <div className="flex-1 flex items-center gap-2 px-2 py-1.5 text-xs" style={{ color: "var(--textora-fg-muted)" }}>
                <span>⏳</span>
                <span>加载模型列表中...</span>
              </div>
            ) : quickModels.length > 0 ? (
              <select
                className="flex-1 px-2 py-1.5 border rounded text-xs bg-transparent cursor-pointer"
                style={{ borderColor: "var(--textora-border)", color: "var(--textora-fg)" }}
                value={quickModel}
                onChange={(e) => setQuickModel(e.target.value)}
              >
                {quickModels.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            ) : (
              <select
                className="flex-1 px-2 py-1.5 border rounded text-xs bg-transparent cursor-pointer"
                style={{ borderColor: "var(--textora-border)", color: "var(--textora-fg)" }}
                value={quickModel}
                onChange={(e) => setQuickModel(e.target.value)}
              >
                {quickTemplate?.models.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            )}
            {quickTemplate?.keyHint && (
              <a
                href={quickTemplate.keyHint}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs px-2 py-1.5 rounded border cursor-pointer"
                style={{ color: "var(--textora-accent)", borderColor: "var(--textora-border)" }}
              >
                {t("settings.ai.quickSetup.getKey")}
              </a>
            )}
            <button
              type="button"
              disabled={!quickApiKey.trim()}
              onClick={handleQuickApply}
              className="text-xs px-3 py-1.5 rounded font-medium cursor-pointer"
              style={{
                background: quickApiKey.trim() ? "var(--textora-accent)" : "var(--textora-bg-muted)",
                color: quickApiKey.trim() ? "var(--textora-accent-fg)" : "var(--textora-fg-muted)",
                border: "none",
              }}
            >
              {t("settings.ai.quickSetup.apply")}
            </button>
          </div>
          {quickSuccess && (
            <div className="mt-2 text-xs px-2 py-1 rounded" style={{ background: "color-mix(in srgb, green 12%, transparent)", color: "green" }}>
              ✓ {t("settings.ai.quickSetup.success")}
            </div>
          )}
        </div>
      </div>

      {/* 已配置供应商列表 */}
      <div>
        <div className="text-xs font-semibold mb-2" style={{ color: "var(--textora-fg)" }}>
          {t("settings.ai.customProviders")}
        </div>
        {aiProviders.length === 0 ? (
          <div className="text-xs py-4 text-center rounded-lg" style={{ color: "var(--textora-fg-muted)", border: "1px dashed var(--textora-border)" }}>
            {t("settings.ai.noProvidersHint")}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {aiProviders.map((provider) => {
              const template = PROVIDER_TEMPLATES.find((t) => t.id === provider.templateId);
              const isShowKey = showApiKeys[provider.id] || false;
              const testStatus = testStatuses[provider.id];
              const isActive = aiActiveProviderId === provider.id;
              const isExpanded = expandedProviderId === provider.id;

              return (
                <div key={provider.id} className="rounded-lg border overflow-hidden" style={{
                  background: isActive ? "color-mix(in srgb, var(--textora-accent) 6%, transparent)" : "transparent",
                  borderColor: isActive ? "var(--textora-accent)" : "var(--textora-border)",
                }}>
                  <div
                    className="flex items-center gap-2 p-2.5 cursor-pointer"
                    onClick={() => setExpandedProviderId(isExpanded ? null : provider.id)}
                  >
                    <input
                      type="radio"
                      name="activeProvider"
                      checked={isActive}
                      onChange={(e) => { e.stopPropagation(); setActiveProviderId(provider.id); }}
                      className="cursor-pointer"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-medium truncate" style={{ color: "var(--textora-fg)" }}>
                          {provider.label}
                        </span>
                        {isActive && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded-full" style={{ background: "var(--textora-accent)", color: "var(--textora-accent-fg)" }}>
                            {t("settings.ai.active")}
                          </span>
                        )}
                        {testStatus?.success === true && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded-full" style={{ background: "color-mix(in srgb, green 12%, transparent)", color: "green" }}>
                            {t("settings.ai.testSuccess")}
                          </span>
                        )}
                        {testStatus?.success === false && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded-full" style={{ background: "color-mix(in srgb, red 12%, transparent)", color: "red" }} title={testStatus.msg}>
                            {t("settings.ai.testFailed")}
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] truncate" style={{ color: "var(--textora-fg-muted)" }}>
                        {provider.model || "—"}
                      </span>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); removeAiProvider(provider.id); }}
                      className="text-xs px-1.5 py-0.5 rounded cursor-pointer"
                      style={{ color: "var(--textora-fg-muted)" }}
                      onMouseEnter={(e) => { e.currentTarget.style.color = "red"; e.currentTarget.style.background = "color-mix(in srgb, red 8%, transparent)"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.color = "var(--textora-fg-muted)"; e.currentTarget.style.background = "transparent"; }}
                    >
                      {t("settings.ai.delete")}
                    </button>
                    <span className="text-[10px]" style={{ color: "var(--textora-fg-muted)" }}>
                      {isExpanded ? "▾" : "▸"}
                    </span>
                  </div>

                  {isExpanded && (
                    <div className="p-2.5 pt-0">
                      <div className="grid gap-2 mt-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xs w-14 shrink-0" style={{ color: "var(--textora-fg-muted)" }}>{t("settings.ai.alias")}</span>
                          <input
                            type="text"
                            value={provider.label}
                            onChange={(e) => updateAiProvider(provider.id, { label: e.target.value })}
                            className="flex-1 text-xs px-2 py-1 border rounded outline-none"
                            style={{ background: "var(--textora-bg)", color: "var(--textora-fg)", borderColor: "var(--textora-border)" }}
                          />
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs w-14 shrink-0" style={{ color: "var(--textora-fg-muted)" }}>API Key</span>
                          <div className="flex-1 flex gap-1">
                            <input
                              type={isShowKey ? "text" : "password"}
                              value={provider.apiKey}
                              placeholder={template?.keyPlaceholder || "..."}
                              onChange={(e) => updateAiProvider(provider.id, { apiKey: e.target.value })}
                              className="flex-1 text-xs px-2 py-1 border rounded outline-none"
                              style={{ background: "var(--textora-bg)", color: "var(--textora-fg)", borderColor: "var(--textora-border)" }}
                            />
                            <button
                              type="button"
                              onClick={() => setShowApiKeys((prev) => ({ ...prev, [provider.id]: !isShowKey }))}
                              className="text-xs px-2 py-1 rounded border cursor-pointer"
                              style={{ color: "var(--textora-fg-muted)", borderColor: "var(--textora-border)" }}
                            >
                              {isShowKey ? t("settings.ai.hideKey") : t("settings.ai.showKey")}
                            </button>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs w-14 shrink-0" style={{ color: "var(--textora-fg-muted)" }}>{t("settings.ai.model")}</span>
                          {modelLoading[provider.id] ? (
                            <div className="flex-1 flex items-center gap-2 px-2 py-1 text-xs" style={{ color: "var(--textora-fg-muted)" }}>
                              <span>⏳</span>
                              <span>加载模型列表中...</span>
                            </div>
                          ) : availableModels[provider.id]?.length > 0 ? (
                            <select
                              className="flex-1 text-xs px-2 py-1 border rounded outline-none cursor-pointer"
                              style={{ background: "var(--textora-bg)", color: "var(--textora-fg)", borderColor: "var(--textora-border)" }}
                              value={provider.model}
                              onChange={(e) => updateAiProvider(provider.id, { model: e.target.value })}
                            >
                              {availableModels[provider.id].map((m) => (
                                <option key={m} value={m}>{m}</option>
                              ))}
                            </select>
                          ) : (
                            <input
                              type="text"
                              value={provider.model}
                              placeholder="model name"
                              onChange={(e) => updateAiProvider(provider.id, { model: e.target.value })}
                              className="flex-1 text-xs px-2 py-1 border rounded outline-none"
                              style={{ background: "var(--textora-bg)", color: "var(--textora-fg)", borderColor: "var(--textora-border)" }}
                            />
                          )}
                          <button
                            type="button"
                            onClick={() => fetchModelsForProvider(provider)}
                            disabled={modelLoading[provider.id] || !provider.apiKey}
                            className="text-xs px-2 py-1 rounded border cursor-pointer"
                            style={{ color: "var(--textora-fg-muted)", borderColor: "var(--textora-border)" }}
                            title="刷新模型列表"
                          >
                            🔄
                          </button>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs w-14 shrink-0" style={{ color: "var(--textora-fg-muted)" }}>{t("settings.ai.endpoint")}</span>
                          <input
                            type="text"
                            value={provider.endpoint}
                            onChange={(e) => updateAiProvider(provider.id, { endpoint: e.target.value })}
                            className="flex-1 text-xs px-2 py-1 border rounded outline-none"
                            style={{ background: "var(--textora-bg)", color: "var(--textora-fg)", borderColor: "var(--textora-border)" }}
                          />
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <button
                            type="button"
                            disabled={testStatus?.loading || !provider.apiKey}
                            onClick={() => handleTestConnection(provider)}
                            className="text-xs px-3 py-1.5 rounded border cursor-pointer"
                            style={{ color: "var(--textora-fg)", borderColor: "var(--textora-border)" }}
                          >
                            {testStatus?.loading ? t("settings.ai.testing") : t("settings.ai.testConnection")}
                          </button>
                          {testStatus?.success === false && testStatus.msg && (
                            <span className="text-xs truncate" style={{ color: "red" }} title={testStatus.msg}>
                              {testStatus.msg}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 添加其他模板 */}
      <div>
        <div className="text-xs font-semibold mb-2" style={{ color: "var(--textora-fg)" }}>
          {t("settings.ai.preset")}
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          {PROVIDER_TEMPLATES.map((tmpl) => (
            <button
              key={tmpl.id}
              className="text-xs px-2.5 py-1 rounded-full border cursor-pointer transition-colors"
              style={{ color: "var(--textora-fg)", borderColor: "var(--textora-border)" }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--textora-accent)"; e.currentTarget.style.color = "var(--textora-accent)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--textora-border)"; e.currentTarget.style.color = "var(--textora-fg)"; }}
              onClick={() => {
                const count = aiProviders.filter((p) => p.templateId === tmpl.id).length;
                const suffix = count > 0 ? ` #${count + 1}` : "";
                addAiProvider(tmpl.id, `${tmpl.label}${suffix}`, "", tmpl.defaultModel || "");
              }}
            >
              + {tmpl.label}
            </button>
          ))}
        </div>
      </div>

      <div className="pt-2" style={{ borderTop: "1px solid var(--textora-border)" }}>
        <button
          className="text-xs px-3 py-1.5 rounded font-medium cursor-pointer"
          style={{ background: "var(--textora-accent)", color: "var(--textora-accent-fg)", border: "none" }}
          onClick={() => setAiAssistantOpen(true)}
        >
          {t("settings.ai.open")}
        </button>
      </div>
    </div>
  );
}

// ===== About Section =====

function AboutSection({ appVersion, t }: { appVersion: string; t: (key: string) => string }) {
  return (
    <div className="flex flex-col items-center gap-4 py-8">
      <div
        className="flex items-center justify-center rounded-2xl"
        style={{
          width: 64,
          height: 64,
          background: "var(--textora-accent)",
        }}
      >
        <span style={{ fontSize: 28, color: "var(--textora-accent-fg)", fontWeight: 700 }}>T</span>
      </div>
      <div className="text-center">
        <div className="font-semibold" style={{ fontSize: 16 }}>Textora</div>
        <div className="text-xs mt-0.5" style={{ color: "var(--textora-fg-muted)" }}>
          {t("settings.about.description")}
        </div>
      </div>
      <div
        className="w-full rounded-lg p-3 flex flex-col gap-2 text-xs"
        style={{ background: "var(--textora-bg-elev)", border: "1px solid var(--textora-border)" }}
      >
        <div className="flex justify-between">
          <span style={{ color: "var(--textora-fg-muted)" }}>{t("settings.about.version")}</span>
          <span style={{ color: "var(--textora-fg)" }}>{appVersion || "—"}</span>
        </div>
        <div className="flex justify-between">
          <span style={{ color: "var(--textora-fg-muted)" }}>{t("settings.about.license")}</span>
          <span style={{ color: "var(--textora-fg)" }}>MIT</span>
        </div>
        <a
          href="https://github.com/textora/textora"
          target="_blank"
          rel="noopener noreferrer"
          className="flex justify-between items-center cursor-pointer"
          style={{ textDecoration: "none" }}
        >
          <span style={{ color: "var(--textora-fg-muted)" }}>{t("settings.about.repo")}</span>
          <span style={{ color: "var(--textora-accent)" }}>↗</span>
        </a>
      </div>
    </div>
  );
}

// ===== Shared UI components =====

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span style={{ color: "var(--textora-fg-muted)" }}>{label}</span>
      <div>{children}</div>
    </div>
  );
}

function Switch({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <button
      className="w-8 h-4 rounded-full relative transition-colors cursor-pointer"
      style={{
        background: checked ? "var(--textora-accent)" : "var(--textora-bg-muted)",
      }}
      onClick={onChange}
      role="switch"
      aria-checked={checked}
    >
      <span
        className="absolute top-0.5 left-0.5 w-3 h-3 rounded-full transition-transform"
        style={{
          background: "white",
          transform: checked ? "translateX(16px)" : "translateX(0)",
        }}
      />
    </button>
  );
}

// ===== Shortcuts Section =====

function ShortcutsSection({ t }: { t: (key: string) => string }) {
  const [custom, setCustom] = useState<Record<string, string>>(() => loadCustomBindings());
  const [recordingId, setRecordingId] = useState<string | null>(null);
  const [conflict, setConflict] = useState<string | null>(null);

  useEffect(() => {
    if (!recordingId) return;
    const handler = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape") {
        setRecordingId(null);
        setConflict(null);
        return;
      }
      const binding = eventToBinding(e);
      if (!binding) return;
      const conflictId = findConflict(binding, recordingId, custom);
      if (conflictId) {
        setConflict(conflictId);
        return;
      }
      const next = { ...custom, [recordingId]: binding };
      setCustom(next);
      saveCustomBindings(next);
      refreshShortcutBindings();
      setRecordingId(null);
      setConflict(null);
    };
    window.addEventListener("keydown", handler, { capture: true });
    return () => window.removeEventListener("keydown", handler, { capture: true });
  }, [recordingId, custom]);

  const handleReset = useCallback((id: string) => {
    const next = resetBinding(SHORTCUTS.find((s) => s.id === id)!, custom);
    setCustom(next);
    saveCustomBindings(next);
    refreshShortcutBindings();
    setRecordingId(null);
    setConflict(null);
  }, [custom]);

  const handleResetAll = useCallback(() => {
    setCustom({});
    saveCustomBindings({});
    refreshShortcutBindings();
    setRecordingId(null);
    setConflict(null);
  }, []);

  const categories: Array<"file" | "edit" | "view" | "tabs" | "app"> = ["file", "edit", "view", "tabs", "app"];
  const conflictName = conflict
    ? t(SHORTCUTS.find((s) => s.id === conflict)?.descriptionKey ?? "")
    : null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-xs" style={{ color: "var(--textora-fg-muted)" }}>
          {t("settings.shortcuts.hint")}
        </span>
        <button
          className="text-xs px-2 py-0.5 rounded cursor-pointer"
          style={{ color: "var(--textora-fg-muted)" }}
          onClick={handleResetAll}
          onMouseEnter={(e) => (e.currentTarget.style.background = "var(--textora-bg-muted)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
        >
          {t("settings.shortcuts.resetAll")}
        </button>
      </div>
      {conflict && (
        <div className="text-xs px-2 py-1 rounded" style={{ background: "#ffebe9", color: "#cf222e" }}>
          {t("settings.shortcuts.conflict").replace("{name}", conflictName ?? "")}
        </div>
      )}
      {categories.map((cat) => (
        <div key={cat}>
          <div className="text-xs mb-1 font-semibold" style={{ color: "var(--textora-fg-muted)" }}>
            {t(`sc.category.${cat}`)}
          </div>
          {SHORTCUTS.filter((s) => s.category === cat).map((def) => {
            const binding = getBinding(def, custom);
            const isRecording = recordingId === def.id;
            const isConflicted = conflict && recordingId === def.id;
            return (
              <div key={def.id} className="flex items-center justify-between py-1 text-xs" style={{ borderBottom: "1px solid var(--textora-border)" }}>
                <span style={{ color: "var(--textora-fg)" }}>{t(def.descriptionKey)}</span>
                <div className="flex items-center gap-1.5">
                  <button
                    className="px-2 py-0.5 rounded border text-xs cursor-pointer"
                    style={{
                      borderColor: isRecording ? "var(--textora-accent)" : isConflicted ? "#cf222e" : "var(--textora-border)",
                      background: isRecording ? "var(--textora-accent)" : "transparent",
                      color: isRecording ? "var(--textora-accent-fg)" : "var(--textora-fg)",
                      minWidth: 72,
                      textAlign: "center",
                      fontFamily: "ui-monospace, monospace",
                    }}
                    onClick={() => { setRecordingId(def.id); setConflict(null); }}
                  >
                    {isRecording ? t("settings.shortcuts.recording") : formatBinding(binding)}
                  </button>
                  {custom[def.id] && (
                    <button
                      className="text-xs px-1 py-0.5 rounded cursor-pointer"
                      style={{ color: "var(--textora-fg-muted)" }}
                      onClick={() => handleReset(def.id)}
                      title={t("settings.shortcuts.reset")}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--textora-bg-muted)")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                    >
                      ↺
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
