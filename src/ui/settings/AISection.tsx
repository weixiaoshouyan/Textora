/**
 * 设置面板：AI 助手分类（一键配置 / 供应商管理 / 模型列表 / 连接测试）。
 */
import React, { useEffect, useState } from "react";
import { useAppStore } from "../../store/useAppStore";
import {
  PROVIDER_TEMPLATES,
  getTemplate,
  saveProviderConfigs,
  setActiveProviderId as setActiveProviderIdFromConfig,
  type ProviderConfig,
} from "../../ai/config";
import { chat, listModels } from "../../ai/aiService";

export function AISection({
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
