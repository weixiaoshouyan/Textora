import { useState, useRef } from "react";
import { useAppStore } from "../store/useAppStore";
import { useLocale, tFor } from "../i18n";
import { MenuItem } from "./MenuItem";

function kindIcon(kind: string): string {
  switch (kind) {
    case "markdown":
      return "M";
    case "code":
      return "{}";
    case "image":
      return "▣";
    case "binary":
      return "⚇";
    default:
      return "•";
  }
}

interface MenuState {
  x: number;
  y: number;
  tabId: string;
}

export function TabBar() {
  const tabs = useAppStore((s) => s.tabs);
  const activeTabId = useAppStore((s) => s.activeTabId);
  const setActiveTab = useAppStore((s) => s.setActiveTab);
  const closeTab = useAppStore((s) => s.closeTab);
  const reorderTabs = useAppStore((s) => s.reorderTabs);
  const closeOtherTabs = useAppStore((s) => s.closeOtherTabs);
  const closeAllTabs = useAppStore((s) => s.closeAllTabs);
  const locale = useLocale((s) => s.locale);
  const t = tFor(locale);

  const [menu, setMenu] = useState<MenuState | null>(null);
  const dragIdRef = useRef<string | null>(null);
  const dragOverIdRef = useRef<string | null>(null);

  if (tabs.length === 0) return null;

  const onContextMenu = (e: React.MouseEvent, tabId: string) => {
    e.preventDefault();
    setMenu({ x: e.clientX, y: e.clientY, tabId });
  };

  return (
    <div className="textora-tabbar" data-tauri-drag-region role="tablist" aria-orientation="horizontal">
      {tabs.map((tab) => (
        <div
          key={tab.id}
          className={`textora-tab${tab.id === activeTabId ? " active" : ""}`}
          onClick={() => setActiveTab(tab.id)}
          onMouseDown={(e) => {
            if (e.button === 1) {
              e.preventDefault();
              closeTab(tab.id);
            }
          }}
          onContextMenu={(e) => onContextMenu(e, tab.id)}
          onDragStart={(e) => {
            dragIdRef.current = tab.id;
            e.dataTransfer.effectAllowed = "move";
            // 透明拖影（避免默认的元素残影）
            const img = new Image();
            img.src =
              "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==";
            e.dataTransfer.setDragImage(img, 0, 0);
          }}
          onDragOver={(e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
            dragOverIdRef.current = tab.id;
          }}
          onDrop={(e) => {
            e.preventDefault();
            const fromId = dragIdRef.current;
            const toId = dragOverIdRef.current;
            if (fromId && toId && fromId !== toId) {
              reorderTabs(fromId, toId);
            }
            dragIdRef.current = null;
            dragOverIdRef.current = null;
          }}
          onDragEnd={() => {
            dragIdRef.current = null;
            dragOverIdRef.current = null;
          }}
          draggable
          role="tab"
          aria-selected={tab.id === activeTabId}
          aria-label={tab.name}
          title={tab.path ?? tab.name}
          data-tauri-drag-region={false}
        >
          <span style={{ opacity: 0.6, fontFamily: "monospace" }}>
            {kindIcon(tab.kind)}
          </span>
          <span className="textora-tab-name">{tab.name}</span>
          {tab.dirty && <span className="textora-tab-dirty" aria-hidden="true" />}
          <span
            className="textora-tab-close"
            onClick={(e) => {
              e.stopPropagation();
              closeTab(tab.id);
            }}
            title={t("menu.close")}
            aria-label={`${t("menu.close")} ${tab.name}`}
          >
            ✕
          </span>
        </div>
      ))}

      {menu && (
        <div
          className="fixed inset-0 z-50"
          onClick={() => setMenu(null)}
          onContextMenu={(e) => {
            e.preventDefault();
            setMenu(null);
          }}
        >
          <div
            className="fixed rounded-[8px] py-1.5 text-[12px]"
            style={{
              left: menu.x,
              top: menu.y,
              background: "var(--textora-bg-elev)",
              border: "1px solid var(--textora-border)",
              boxShadow: "0 4px 16px rgba(0,0,0,0.12), 0 1px 4px rgba(0,0,0,0.08)",
              minWidth: 160,
              overflow: "hidden",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <MenuItem
              onClick={() => {
                setActiveTab(menu.tabId);
                setMenu(null);
              }}
            >
              {t("menu.activate")}
            </MenuItem>
            <MenuItem
              onClick={() => {
                closeTab(menu.tabId);
                setMenu(null);
              }}
            >
              {t("menu.close")}
            </MenuItem>
            <MenuItem
              onClick={() => {
                closeOtherTabs(menu.tabId);
                setMenu(null);
              }}
              disabled={tabs.length <= 1}
            >
              {t("menu.closeOthers")}
            </MenuItem>
            <MenuItem
              onClick={() => {
                closeAllTabs();
                setMenu(null);
              }}
              disabled={tabs.length === 0}
            >
              {t("menu.closeAll")}
            </MenuItem>
          </div>
        </div>
      )}
    </div>
  );
}

