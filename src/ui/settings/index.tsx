/**
 * 设置面板主组件：分类导航 + 各 section 组装。
 * section 按分类拆分：General/Editor/View/AI/Shortcuts/About。
 */
import React, { useEffect, useState } from "react";
import { useAppStore } from "../../store/useAppStore";
import { useLocale, tFor } from "../../i18n";
import { getAppVersion } from "../../ipc";
import { CategoryIcon } from "./controls";
import { GeneralSection } from "./GeneralSection";
import { EditorSection } from "./EditorSection";
import { ViewSection } from "./ViewSection";
import { AISection } from "./AISection";
import { AboutSection } from "./AboutSection";
import { ShortcutsSection } from "./ShortcutsSection";

type Category = "general" | "editor" | "view" | "ai" | "shortcuts" | "about";

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
