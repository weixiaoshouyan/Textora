import { useEffect, useRef, useState } from "react";

export interface CtxMenuItem {
  label?: string;
  shortcut?: string;
  onClick?: () => void;
  submenu?: CtxMenuItem[];
  type?: "separator";
}

interface Props {
  x: number;
  y: number;
  items: CtxMenuItem[];
  onClose: () => void;
  level?: number;
}

export function ContextMenu({ x, y, items, onClose, level = 0 }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x, y });
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    let nx = x;
    let ny = y;
    if (nx + rect.width > window.innerWidth - 8) {
      nx = window.innerWidth - rect.width - 8;
    }
    if (ny + rect.height > window.innerHeight - 8) {
      ny = window.innerHeight - rect.height - 8;
    }
    setPos({ x: Math.max(4, nx), y: Math.max(4, ny) });
  }, [x, y]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    }
    function handleEsc(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEsc);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEsc);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="fixed z-[9999]"
      style={{ left: pos.x, top: pos.y }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div
        className="rounded shadow-lg border py-1 min-w-[180px]"
        style={{
          background: "var(--textora-bg-elev, var(--textora-bg))",
          borderColor: "var(--textora-border)",
          fontSize: 13,
        }}
      >
        {items.map((item, idx) => {
          if (item.type === "separator") {
            return (
              <div
                key={idx}
                style={{
                  height: 1,
                  margin: "4px 12px",
                  background: "var(--textora-border)",
                }}
              />
            );
          }
          const hasSub = !!item.submenu?.length;
          return (
            <div
              key={idx}
              className="ctx-menu-row"
              style={{
                position: "relative",
                padding: "5px 16px 5px 20px",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 16,
                background:
                  hoverIdx === idx
                    ? "var(--textora-accent)"
                    : "transparent",
                color:
                  hoverIdx === idx
                    ? "var(--textora-accent-fg)"
                    : "var(--textora-fg)",
              }}
              onMouseEnter={() => setHoverIdx(idx)}
              onMouseLeave={() => setHoverIdx(null)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                if (hasSub) return;
                if (item.onClick) item.onClick();
                onClose();
              }}
            >
              <span>{item.label}</span>
              <span
                style={{
                  fontSize: 11,
                  opacity: 0.6,
                  fontFamily: "ui-monospace, monospace",
                }}
              >
                {item.shortcut}
                {hasSub ? " ›" : ""}
              </span>
              {hasSub && hoverIdx === idx && (
                <ContextMenu
                  x={pos.x + 170}
                  y={pos.y + idx * 28}
                  items={item.submenu!}
                  onClose={onClose}
                  level={level + 1}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
