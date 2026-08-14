/**
 * 设置面板：编辑器分类（字号 / 字体 / 拼写检查）。
 */
import React from "react";
import { Row, Switch } from "./controls";

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


export function EditorSection({
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
