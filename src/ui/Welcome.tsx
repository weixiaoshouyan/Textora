import { useEffect, useState } from "react";
import { useAppStore } from "../store/useAppStore";
import { useLocale, tFor } from "../i18n";
import { readRecents, type RecentFile } from "../store/recents";

export function Welcome() {
  const newFile = useAppStore((s) => s.newFile);
  const openFile = useAppStore((s) => s.openFile);
  const openPath = useAppStore((s) => s.openPath);
  const locale = useLocale((s) => s.locale);
  const t = tFor(locale);

  const [visible, setVisible] = useState(false);
  const [recents, setRecents] = useState<RecentFile[]>([]);

  useEffect(() => {
    const id = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(id);
  }, []);

  // 欢迎页每次出现时读取最近打开的文件
  useEffect(() => {
    setRecents(readRecents());
  }, []);

  /** 父目录路径（去掉文件名） */
  const parentDirOf = (p: string): string => {
    const parts = p.split(/[\\/]/).filter(Boolean);
    parts.pop();
    return parts.join("/") || p;
  };

  return (
    <div
      className="flex items-center justify-center h-full"
      style={{ background: "var(--textora-bg)" }}
    >
      <div
        className="text-center w-full mx-auto"
        style={{
          maxWidth: 500,
          padding: "0 24px",
          opacity: visible ? 1 : 0,
          transform: visible ? "translateY(0)" : "translateY(12px)",
          transition: "opacity 0.5s ease, transform 0.5s ease",
        }}
      >
        {/* Logo */}
        <div className="mx-auto mb-6" style={{ width: 64, height: 64 }}>
          <svg
            viewBox="0 0 64 64"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="w-full h-full"
          >
            <rect
              x="12"
              y="6"
              width="34"
              height="46"
              rx="4"
              fill="var(--textora-bg-elev)"
              stroke="var(--textora-border)"
              strokeWidth="2"
            />
            <path
              d="M20 18h18M20 26h18M20 34h12"
              stroke="var(--textora-fg-muted)"
              strokeWidth="2"
              strokeLinecap="round"
            />
            <path
              d="M40 42l8 12 8-12"
              stroke="var(--textora-accent)"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
            <circle cx="48" cy="48" r="3" fill="var(--textora-accent)" />
          </svg>
        </div>

        {/* Title & subtitle */}
        <h1
          className="text-xl font-semibold mb-1"
          style={{ color: "var(--textora-fg)", letterSpacing: "-0.01em" }}
        >
          {t("app.title")}
        </h1>
        <p
          className="text-sm mb-10"
          style={{ color: "var(--textora-fg-muted)" }}
        >
          {t("welcome.subtitle")}
        </p>

        {/* Primary action: New File */}
        <button
          className="w-full flex items-center justify-center gap-2 rounded-lg py-2.5 px-5 text-sm font-medium transition-all duration-150 cursor-pointer"
          style={{
            background: "var(--textora-accent)",
            color: "var(--textora-accent-fg)",
            border: "none",
            boxShadow: "var(--textora-shadow)",
          }}
          onClick={newFile}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.filter = "brightness(1.08)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.filter = "none";
          }}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M8 3v10M3 8h10"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
          </svg>
          {t("new")}
        </button>

        {/* Secondary action: Open File */}
        <button
          className="mt-3 text-sm transition-colors duration-150 cursor-pointer"
          style={{
            background: "none",
            border: "none",
            color: "var(--textora-fg-muted)",
            padding: "6px 12px",
          }}
          onClick={() => void openFile()}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.color = "var(--textora-accent)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.color = "var(--textora-fg-muted)";
          }}
        >
          {t("open")}
        </button>

        {/* Recent files */}
        {recents.length > 0 && (
          <div className="mt-8 text-left">
            <div
              className="text-xs font-medium mb-2"
              style={{ color: "var(--textora-fg-muted)", letterSpacing: "0.02em" }}
            >
              {t("welcome.recentFiles")}
            </div>
            <ul style={{ maxHeight: 200, overflowY: "auto" }}>
              {recents.map((r) => (
                <li key={r.path}>
                  <button
                    className="w-full flex items-baseline gap-2 rounded-md px-2 py-1.5 text-left transition-colors duration-100 cursor-pointer"
                    style={{
                      background: "none",
                      border: "none",
                      color: "var(--textora-fg)",
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLElement).style.background = "var(--textora-bg-elev)";
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLElement).style.background = "none";
                    }}
                    onClick={() => void openPath(r.path)}
                    title={r.path}
                  >
                    <span
                      className="truncate text-sm"
                      style={{ flexShrink: 1, minWidth: 0 }}
                    >
                      {r.name}
                    </span>
                    <span
                      className="truncate text-xs"
                      style={{ color: "var(--textora-fg-muted)", flexShrink: 0 }}
                    >
                      {parentDirOf(r.path)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
