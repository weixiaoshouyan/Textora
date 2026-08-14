/**
 * 设置面板通用控件（分类图标 / 行 / 开关）。
 */
import React from "react";

export function CategoryIcon({ name }: { name: string }) {
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

export function ViewRow({
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

export function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span style={{ color: "var(--textora-fg-muted)" }}>{label}</span>
      <div>{children}</div>
    </div>
  );
}

export function Switch({
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
