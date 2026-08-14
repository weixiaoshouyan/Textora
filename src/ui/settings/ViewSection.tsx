/**
 * 设置面板：视图分类（侧边栏 / 大纲 / 专注 / 打字机 / 源码 / 阅读 / PDF 导出）。
 */
import React from "react";
import { ViewRow } from "./controls";

export function ViewSection({
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
