import type { ReactNode } from "react";

export function MenuItem({
  children,
  onClick,
  icon,
  disabled,
  shortcut,
}: {
  children: ReactNode;
  onClick: () => void;
  icon?: ReactNode;
  disabled?: boolean;
  shortcut?: string;
}) {
  return (
    <div
      className="flex items-center gap-2 px-3 py-[5px] cursor-pointer whitespace-nowrap"
      style={{
        color: disabled ? "var(--textora-fg-muted)" : "var(--textora-fg)",
        opacity: disabled ? 0.5 : 1,
        transition: "background 0.15s ease",
        pointerEvents: disabled ? "none" : "auto",
      }}
      onMouseEnter={(e) =>
        (e.currentTarget.style.background = "var(--textora-bg-muted)")
      }
      onMouseLeave={(e) =>
        (e.currentTarget.style.background = "transparent")
      }
      onClick={onClick}
    >
      {icon && (
        <span style={{ width: 14, height: 14, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          {icon}
        </span>
      )}
      <span style={{ flex: 1 }}>{children}</span>
      {shortcut && (
        <span
          style={{
            fontSize: 11,
            opacity: 0.6,
            fontFamily: "ui-monospace, monospace",
            minWidth: 40,
            textAlign: "right",
          }}
        >
          {shortcut}
        </span>
      )}
    </div>
  );
}
