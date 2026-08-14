/**
 * 设置面板：通用分类（主题 / 语言 / 自动保存）。
 */
import React from "react";
import { Row } from "./controls";

const THEMES: Array<{ value: "light" | "dark" | "sepia" | "nord"; key: string }> = [
  { value: "light", key: "settings.theme.light" },
  { value: "dark", key: "settings.theme.dark" },
  { value: "sepia", key: "settings.theme.sepia" },
  { value: "nord", key: "settings.theme.nord" },
];


export function GeneralSection({
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
