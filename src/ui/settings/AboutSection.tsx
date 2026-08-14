/**
 * 设置面板：关于分类（版本 / 仓库 / 许可证）。
 */
import React from "react";

export function AboutSection({ appVersion, t }: { appVersion: string; t: (key: string) => string }) {
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
