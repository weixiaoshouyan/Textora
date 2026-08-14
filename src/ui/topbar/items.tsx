/**
 * 顶栏子组件：菜单栏项 / 下拉项 / 图标按钮 / SVG 图标集。
 */
import React, { forwardRef } from "react";

/* --- Menu bar item --- */

export const MenuBarItem = forwardRef<HTMLDivElement, {
  label: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}>(({ label, open, onToggle, children }, ref) => {
  return (
    <div className="relative" ref={ref}>
      <button
        className="px-2 rounded-sm"
        style={{
          fontSize: 12,
          lineHeight: "24px",
          height: 24,
          background: open ? "var(--textora-bg-muted)" : "transparent",
          color: "var(--textora-fg-muted)",
          transition: "background 0.15s, color 0.15s",
        }}
        onClick={onToggle}
        onMouseEnter={(e) => {
          if (!open) e.currentTarget.style.background = "var(--textora-bg-muted)";
        }}
        onMouseLeave={(e) => {
          if (!open) e.currentTarget.style.background = "transparent";
        }}
        onMouseDown={(e) => e.preventDefault()}
      >
        {label}
      </button>
      {open && (
        <div
          className="absolute left-0 top-full mt-0.5 textora-card py-1 z-50 min-w-[200px]"
        >
          {children}
        </div>
      )}
    </div>
  );
});

MenuBarItem.displayName = "MenuBarItem";

/* --- Dropdown items --- */

export function DropdownItem({
  label,
  shortcut,
  checked,
  onClick,
}: {
  label: string;
  shortcut?: string;
  checked?: boolean;
  onClick: () => void;
}) {
  return (
    <div
      className="flex items-center justify-between px-3 py-1.5 cursor-pointer"
      style={{ transition: "background 0.12s" }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = "var(--textora-bg-muted)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "transparent";
      }}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
    >
      <span className="flex items-center gap-2" style={{ fontSize: 12 }}>
        <span
          className="w-3 text-center"
          style={{ color: "var(--textora-accent)", fontSize: 12 }}
        >
          {checked ? "\u2713" : ""}
        </span>
        {label}
      </span>
      {shortcut && (
        <span style={{ color: "var(--textora-fg-muted)", fontSize: 11 }}>
          {shortcut}
        </span>
      )}
    </div>
  );
}

export function DropdownDivider() {
  return <hr className="my-1" style={{ borderColor: "var(--textora-border)" }} />;
}

/* --- Icon button --- */

export function IconButton({
  children,
  onClick,
  title,
  ariaLabel,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title?: string;
  ariaLabel?: string;
}) {
  return (
    <button
      className="w-7 h-7 flex items-center justify-center rounded-sm"
      style={{
        color: "var(--textora-fg-muted)",
        transition: "background 0.15s, color 0.15s",
      }}
      onClick={onClick}
      title={title}
      aria-label={ariaLabel || title}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = "var(--textora-bg-muted)";
        e.currentTarget.style.color = "var(--textora-fg)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "transparent";
        e.currentTarget.style.color = "var(--textora-fg-muted)";
      }}
      onMouseDown={(e) => e.preventDefault()}
    >
      {children}
    </button>
  );
}

/* --- SVG icons --- */

export function SearchIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

export function CommandIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 3a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3 3 3 0 0 0 3-3 3 3 0 0 0-3-3H6a3 3 0 0 0-3 3 3 3 0 0 0 3 3 3 3 0 0 0 3-3V6a3 3 0 0 0-3-3 3 3 0 0 0-3 3 3 3 0 0 0 3 3h12a3 3 0 0 0 3-3 3 3 0 0 0-3-3z" />
    </svg>
  );
}

export function AiIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3l1.9 4.6L18.5 9.5l-4.6 1.9L12 16l-1.9-4.6L5.5 9.5l4.6-1.9z" />
      <path d="M19 14l.8 2L22 16.8l-2 .8L19 20l-.8-2.4-2-.8 2-.8z" />
    </svg>
  );
}

export function ThemeIcon({ theme }: { theme: string }) {
  if (theme === "dark") {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
      </svg>
    );
  }
  if (theme === "sepia") {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 3v18" />
        <path d="M12 3a4 4 0 0 1 0 18" />
      </svg>
    );
  }
  if (theme === "nord") {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2L2 7l10 5 10-5-10-5z" />
        <path d="M2 17l10 5 10-5" />
        <path d="M2 12l10 5 10-5" />
      </svg>
    );
  }
  // light - sun
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="5" />
      <line x1="12" y1="1" x2="12" y2="3" />
      <line x1="12" y1="21" x2="12" y2="23" />
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
      <line x1="1" y1="12" x2="3" y2="12" />
      <line x1="21" y1="12" x2="23" y2="12" />
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
    </svg>
  );
}
