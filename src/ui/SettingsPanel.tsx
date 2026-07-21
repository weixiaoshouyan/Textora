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
import { PROVIDER_TEMPLATES, loadProviderConfigs, saveProviderConfigs, loadAllApiKeys, type ProviderConfig } from "../ai/config";

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
      const setAiAssistantOpen = useAppStore((s) => s.setAiAssistantOpen);
  const aiProviders = useAppStore((s) => s.aiProviders);
  const addAiProvider = useAppStore((s) => s.addAiProvider);
  const removeAiProvider = useAppStore((s) => s.removeAiProvider);
  const updateAiProvider = useAppStore((s) => s.updateAiProvider);
  const setTheme = useAppStore((s) => s.setTheme);
  const close = () => useAppStore.setState({ settingsPanelOpen: false });
  const locale = useLocale((s) => s.locale);
  const setLocale = useLocale((s) => s.setLocale);
  const t = tFor(locale);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.3)" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div
        className="textora-card w-[560px] max-w-[92vw] max-h-[88vh] overflow-auto p-5"
        style={{ background: "var(--textora-bg-elev)" }}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold">{t("settings.title")}</h2>
          <button
            className="text-xs px-2 py-0.5 rounded hover:bg-[var(--textora-bg-muted)]"
            style={{ color: "var(--textora-fg-muted)" }}
            onClick={close}
          >
            ✕
          </button>
        </div>

        <Section title={t("settings.general")}>
          <Row label={t("settings.theme")}>
            <div className="flex gap-1">
              {THEMES.map((th) => (
                <button
                  key={th.value}
                  className="text-xs px-2 py-1 rounded border transition-colors"
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
            <div className="flex gap-1">
              {(["zh", "en"] as const).map((l) => (
                <button
                  key={l}
                  className="text-xs px-2 py-1 rounded border transition-colors"
                  style={{
                    background: locale === l ? "var(--textora-accent)" : "transparent",
                    color: locale === l ? "var(--textora-accent-fg)" : "var(--textora-fg-muted)",
                    borderColor: locale === l ? "var(--textora-accent)" : "var(--textora-border)",
                  }}
                  onClick={() => setLocale(l)}
                >
                  {l === "zh" ? "中文" : "EN"}
                </button>
              ))}
            </div>
          </Row>
        </Section>

        <Section title={t("settings.editor")}>
          <Row label={t("settings.fontSize")}>
            <input
              type="number"
              min={10}
              max={32}
              className="px-2 py-0.5 border rounded w-16 text-xs bg-transparent"
              style={{ borderColor: "var(--textora-border)" }}
              value={settings.fontSize}
              onChange={(e) =>
                updateSettings({ fontSize: Number(e.target.value) || 16 })
              }
            />
          </Row>
          <Row label={t("settings.fontFamily")}>
            <select
              className="px-2 py-0.5 border rounded text-xs bg-transparent"
              style={{ borderColor: "var(--textora-border)" }}
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
          <Row label={t("settings.autoSave")}>
            <input
              type="number"
              min={0}
              max={600}
              className="px-2 py-0.5 border rounded w-16 text-xs bg-transparent"
              style={{ borderColor: "var(--textora-border)" }}
              value={settings.autoSaveSeconds}
              onChange={(e) =>
                updateSettings({
                  autoSaveSeconds: Math.max(0, Number(e.target.value) || 0),
                })
              }
            />
          </Row>
          <Row label={t("settings.spellcheck")}>
            <Switch checked={settings.spellcheck} onChange={toggleSpellcheck} />
          </Row>
        </Section>

        <Section title={t("settings.ai")}>
          <div style={{ fontSize: 11, color: "var(--textora-fg-muted)", marginBottom: 8 }}>
            选择供应商，填写 API Key 即可使用。支持同时配置多个供应商。
          </div>
          {aiProviders.map((provider) => {
            const template = PROVIDER_TEMPLATES.find((t) => t.id === provider.templateId);
            return (
              <div key={provider.id} style={{
                marginBottom: 8, padding: 8, borderRadius: 6,
                border: "1px solid var(--textora-border)", background: "var(--textora-bg-elev)",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                  <strong style={{ fontSize: 12, flex: 1 }}>{provider.label}</strong>
                  <Switch checked={provider.enabled}
                    onChange={() => updateAiProvider(provider.id, { enabled: !provider.enabled })} />
                  <button className="textora-btn" style={{ fontSize: 10, padding: "1px 6px", color: "red" }}
                    onClick={() => removeAiProvider(provider.id)}>删除</button>
                </div>
                <div style={{ display: "flex", gap: 4, alignItems: "center", marginBottom: 4 }}>
                  <input type="password" value={provider.apiKey}
                    placeholder={template?.keyPlaceholder || "API Key"}
                    onChange={(e) => updateAiProvider(provider.id, { apiKey: e.target.value })}
                    style={{
                      flex: 1, fontSize: 11, padding: "3px 6px",
                      border: "1px solid var(--textora-border)", borderRadius: 4,
                      background: "var(--textora-bg)", color: "var(--textora-fg)",
                    }}
                  />
                </div>
                <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                  <input type="text" value={provider.model} placeholder="模型名称"
                    onChange={(e) => updateAiProvider(provider.id, { model: e.target.value })}
                    style={{
                      flex: 1, fontSize: 11, padding: "3px 6px",
                      border: "1px solid var(--textora-border)", borderRadius: 4,
                      background: "var(--textora-bg)", color: "var(--textora-fg)",
                    }}
                  />
                  <input type="text" value={provider.endpoint} placeholder="API Endpoint"
                    onChange={(e) => updateAiProvider(provider.id, { endpoint: e.target.value })}
                    style={{
                      flex: 1, fontSize: 11, padding: "3px 6px",
                      border: "1px solid var(--textora-border)", borderRadius: 4,
                      background: "var(--textora-bg)", color: "var(--textora-fg)",
                    }}
                  />
                </div>
              </div>
            );
          })}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
            <span style={{ fontSize: 11, color: "var(--textora-fg-muted)", width: "100%" }}>添加供应商：</span>
            {PROVIDER_TEMPLATES.map((tmpl) => (
              <button key={tmpl.id}
                className="textora-btn" style={{ fontSize: 11, padding: "3px 10px" }}
                onClick={() => {
                  const label = prompt("配置名称", tmpl.label);
                  if (!label) return;
                  const key = prompt("API Key" + (tmpl.id === "ollama" ? " (本地可留空)" : ""));
                  if (key !== null) {
                    void addAiProvider(tmpl.id, label, key);
                  }
                }}
              >
                + {tmpl.label}
              </button>
            ))}
          </div>
          <div className="flex items-center justify-between pt-2">
            <span className="text-xs" style={{ color: "var(--textora-fg-muted)" }}>
              配置仅保存在本机，API Key 加密存储。
            </span>
            <button className="text-xs px-2 py-1 rounded border transition-colors"
              style={{ borderColor: "var(--textora-border)", color: "var(--textora-accent)" }}
              onClick={() => setAiAssistantOpen(true)}>
              打开 AI 助手
            </button>
          </div>
        </Section>\n        <Section title={t("settings.view")}>
          <Row label={t("settings.sidebarVisible")}>
            <Switch checked={settings.sidebarVisible} onChange={toggleSidebar} />
          </Row>
          <Row label={t("settings.outlineVisible")}>
            <Switch checked={settings.outlineVisible} onChange={toggleOutline} />
          </Row>
          <Row label={t("settings.focusMode")}>
            <Switch checked={settings.focusMode} onChange={toggleFocus} />
          </Row>
          <Row label={t("settings.typewriterMode")}>
            <Switch checked={settings.typewriterMode} onChange={toggleTypewriter} />
          </Row>
          <Row label={t("settings.sourceMode")}>
            <Switch checked={settings.sourceMode} onChange={toggleSource} />
          </Row>
          <Row label={t("settings.readingMode")}>
            <Switch checked={settings.readingMode} onChange={toggleReading} />
          </Row>
        </Section>

        <ShortcutsSection />
      </div>
    </div>
  );
}

function Section({ title, children }: { title: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="mb-3">
      <div
        className="text-xs mb-1.5"
        style={{ color: "var(--textora-fg-muted)" }}
      >
        {title}
      </div>
      <div
        className="rounded border p-2.5"
        style={{ borderColor: "var(--textora-border)" }}
      >
        {children}
      </div>
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-1 text-xs">
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
      className="w-8 h-4 rounded-full relative transition-colors"
      style={{
        background: checked ? "var(--textora-accent)" : "var(--textora-bg-muted)",
      }}
      onClick={onChange}
      role="switch"
      aria-checked={checked}
      aria-pressed={checked}
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

/** 快捷键自定义分区 */
function ShortcutsSection() {
  const locale = useLocale((s) => s.locale);
  const t = tFor(locale);
  const [custom, setCustom] = useState<Record<string, string>>(() => loadCustomBindings());
  const [recordingId, setRecordingId] = useState<string | null>(null);
  const [conflict, setConflict] = useState<string | null>(null);

  // 录制模式下拦截按键（capture 阶段，在全局快捷键处理之前）
  useEffect(() => {
    if (!recordingId) return;
    const handler = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      // Escape 取消录制
      if (e.key === "Escape") {
        setRecordingId(null);
        setConflict(null);
        return;
      }
      const binding = eventToBinding(e);
      if (!binding) return; // 纯修饰键，等待完整组合
      // 冲突检测
      const conflictId = findConflict(binding, recordingId, custom);
      if (conflictId) {
        setConflict(conflictId);
        // 仍然继续录制，让用户看到冲突提示
        return;
      }
      // 保存绑定
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

  // 按分类分组
  const categories: Array<"file" | "edit" | "view" | "tabs"> = ["file", "edit", "view", "tabs"];
  const conflictName = conflict
    ? t(SHORTCUTS.find((s) => s.id === conflict)?.descriptionKey ?? "")
    : null;

  return (
    <Section
      title={
        <span className="flex items-center justify-between w-full">
          <span>{t("settings.shortcuts")}</span>
          <button
            className="text-xs px-1.5 py-0.5 rounded hover:bg-[var(--textora-bg-muted)]"
            style={{ color: "var(--textora-fg-muted)" }}
            onClick={handleResetAll}
          >
            {t("settings.shortcuts.resetAll")}
          </button>
        </span>
      }
    >
      <div className="text-xs mb-1.5" style={{ color: "var(--textora-fg-muted)" }}>
        {t("settings.shortcuts.hint")}
      </div>
      {conflict && (
        <div
          className="text-xs mb-2 px-2 py-1 rounded"
          style={{ background: "#ffebe9", color: "#cf222e" }}
        >
          {t("settings.shortcuts.conflict").replace("{name}", conflictName ?? "")}
        </div>
      )}
      {categories.map((cat) => (
        <div key={cat} className="mb-2 last:mb-0">
          <div
            className="text-xs mb-1 font-medium"
            style={{ color: "var(--textora-fg-muted)" }}
          >
            {t(`sc.category.${cat}`)}
          </div>
          {SHORTCUTS.filter((s) => s.category === cat).map((def) => {
            const binding = getBinding(def, custom);
            const isRecording = recordingId === def.id;
            const isConflicted = conflict && recordingId === def.id;
            return (
              <div
                key={def.id}
                className="flex items-center justify-between py-1 text-xs"
              >
                <span style={{ color: "var(--textora-fg-muted)" }}>
                  {t(def.descriptionKey)}
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    className="px-2 py-0.5 rounded border text-xs"
                    style={{
                      borderColor: isRecording
                        ? "var(--textora-accent)"
                        : isConflicted
                          ? "#cf222e"
                          : "var(--textora-border)",
                      background: isRecording ? "var(--textora-accent)" : "transparent",
                      color: isRecording ? "var(--textora-accent-fg)" : "var(--textora-fg)",
                      minWidth: 80,
                      textAlign: "center",
                      fontFamily: "ui-monospace, monospace",
                    }}
                    onClick={() => {
                      setRecordingId(def.id);
                      setConflict(null);
                    }}
                  >
                    {isRecording ? t("settings.shortcuts.recording") : formatBinding(binding)}
                  </button>
                  {custom[def.id] && (
                    <button
                      className="text-xs px-1 py-0.5 rounded hover:bg-[var(--textora-bg-muted)]"
                      style={{ color: "var(--textora-fg-muted)" }}
                      onClick={() => handleReset(def.id)}
                      title={t("settings.shortcuts.reset")}
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
    </Section>
  );
}
