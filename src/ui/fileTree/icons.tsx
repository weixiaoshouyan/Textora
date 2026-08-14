/**
 * 文件树图标集（内联 SVG）。
 */
import React from "react";

export function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 10 10"
      fill="none"
      style={{
        transition: "transform 0.15s ease",
        transform: open ? "rotate(90deg)" : "rotate(0deg)",
        flexShrink: 0,
      }}
    >
      <path
        d="M3.5 2L6.5 5L3.5 8"
        stroke="var(--textora-fg-muted)"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function FolderIcon({ open }: { open: boolean }) {
  return open ? (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0 }}>
      <path
        d="M1 3.5C1 2.67 1.67 2 2.5 2H5.2c.4 0 .78.17 1.06.47l.44.53c.28.3.66.47 1.06.47H11c.55 0 1 .45 1 1v.5H2.75c-.54 0-1.04.27-1.34.72L1 6.5V3.5Z"
        fill="var(--textora-accent)"
        opacity="0.7"
      />
      <path
        d="M1 6.5C1 5.67 1.67 5 2.5 5H11.5C12.33 5 13 5.67 13 6.5V10.5C13 11.33 12.33 12 11.5 12H2.5C1.67 12 1 11.33 1 10.5V6.5Z"
        fill="var(--textora-accent)"
        opacity="0.5"
      />
    </svg>
  ) : (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0 }}>
      <path
        d="M2.5 2H5.2c.4 0 .78.17 1.06.47l.44.53c.28.3.66.47 1.06.47H11c.55 0 1 .45 1 1V10.5c0 .83-.67 1.5-1.5 1.5h-9C1.67 12 1 11.33 1 10.5V3.5C1 2.67 1.67 2 2.5 2Z"
        fill="var(--textora-accent)"
        opacity="0.5"
      />
    </svg>
  );
}

export function FileIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0 }}>
      <path
        d="M4 1h4.5L12 4.5V12c0 .55-.45 1-1 1H4c-.55 0-1-.45-1-1V2c0-.55.45-1 1-1Z"
        fill="var(--textora-fg-muted)"
        opacity="0.35"
      />
      <path
        d="M8.5 1v3.5H12"
        stroke="var(--textora-fg-muted)"
        strokeOpacity="0.5"
        strokeWidth="0.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function PlusIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
      <path d="M5 1.5V8.5M1.5 5H8.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

export function RefreshIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
      <path
        d="M8.25 5A3.25 3.25 0 1 1 7.7 3.2"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
      <path d="M8.5 1.5V3.5H6.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function FolderPlusIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
      <path
        d="M1 3.5C1 2.67 1.67 2 2.5 2H5.2c.4 0 .78.17 1.06.47l.44.53c.28.3.66.47 1.06.47H9c.55 0 1 .45 1 1V4H2.75c-.54 0-1.04.27-1.34.72L1 5.5V3.5Z"
        fill="currentColor"
        opacity="0.6"
      />
      <circle cx="7" cy="7" r="2.5" fill="var(--textora-bg-elev)" stroke="currentColor" strokeWidth="1" />
      <path d="M7 5.75V8.25M5.75 7H8.25" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
    </svg>
  );
}

export function SearchIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ flexShrink: 0 }}>
      <circle cx="5" cy="5" r="3.2" stroke="var(--textora-fg-muted)" strokeWidth="1.2" />
      <path d="M7.5 7.5L10 10" stroke="var(--textora-fg-muted)" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

export function CloseIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
      <path d="M2 2L8 8M8 2L2 8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}
