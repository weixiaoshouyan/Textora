import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

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

/**
 * 右键菜单（支持多级子菜单）。
 *
 * 子菜单位置：渲染后基于「hover 菜单项」的实际 DOM 位置定位——
 * 优先从菜单项右侧弹出，右侧空间不足时翻到左侧；
 * 垂直方向做视口边界收拢。不再用「父菜单坐标 + 估算偏移」，
 * 否则子菜单会被视口 clamp 推到屏幕边缘（与父菜单分离）。
 */
export function ContextMenu({ x, y, items, onClose, level = 0 }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x, y });

  useLayoutEffect(() => {
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
      <MenuPanel items={items} onClose={onClose} level={level} />
    </div>
  );
}

/** 菜单面板：渲染一行行菜单项；hover 到带子菜单的项时在其右侧弹出子菜单 */
function MenuPanel({
  items,
  onClose,
  level,
}: {
  items: CtxMenuItem[];
  onClose: () => void;
  level: number;
}) {
  const rowRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const anchor = hoverIdx !== null ? rowRefs.current[hoverIdx] : null;

  return (
    <div
      className="rounded-xl textora-glass animate-pop-in shadow-2xl border py-1 min-w-[180px]"
      style={{
        borderColor: "var(--textora-border-glass)",
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
            ref={(el) => {
              rowRefs.current[idx] = el;
            }}
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
            {hasSub && anchor && hoverIdx === idx && (
              <SubMenu
                anchor={anchor}
                items={item.submenu!}
                onClose={onClose}
                level={level + 1}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

/**
 * 子菜单：fixed 定位，渲染后测量自身尺寸并基于锚点（父菜单项）计算位置。
 *
 * 关键：用 React Portal 渲染到 document.body——主菜单容器带 animate-pop-in
 * 动画（transform），transform 祖先会把 fixed 子元素的定位上下文劫持为自身，
 * 导致子菜单偏移（style.left 正确但实际渲染位置 +祖先偏移），
 * 且基于被劫持 rect 的视口 clamp 会反复放大偏移，最终把子菜单推到屏幕边缘。
 * Portal 到 body 后定位上下文恢复为 viewport。
 */
function SubMenu({
  anchor,
  items,
  onClose,
  level,
}: {
  anchor: HTMLElement;
  items: CtxMenuItem[];
  onClose: () => void;
  level: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x: 0, y: 0 });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const a = anchor.getBoundingClientRect();
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    // 右侧优先；放不下则翻到锚点左侧
    let nx = a.right + 4;
    if (nx + w > window.innerWidth - 8) {
      nx = a.left - w - 4;
    }
    nx = Math.max(4, nx);
    let ny = a.top;
    if (ny + h > window.innerHeight - 8) {
      ny = Math.max(4, window.innerHeight - h - 8);
    }
    setPos({ x: nx, y: ny });
  }, [anchor]);

  return createPortal(
    <div
      ref={ref}
      className="fixed z-[9999]"
      style={{ left: pos.x, top: pos.y }}
      onContextMenu={(e) => e.preventDefault()}
      // 阻止点击子菜单内部时冒泡到 document 的 mousedown 外点关闭监听
      onMouseDown={(e) => e.stopPropagation()}
    >
      <MenuPanel items={items} onClose={onClose} level={level} />
    </div>,
    document.body
  );
}
