import { useState, useEffect, useRef, useCallback } from "react";
import { FileTree } from "./FileTree";
import { Outline } from "./Outline";
import { useAppStore } from "../store/useAppStore";
import { useLocale, tFor } from "../i18n";

const MIN_WIDTH = 180;
const MAX_WIDTH = 600;

export function Sidebar() {
  const sidebarVisible = useAppStore((s) => s.settings.sidebarVisible);
  const outlineVisible = useAppStore((s) => s.settings.outlineVisible);
  const focusMode = useAppStore((s) => s.settings.focusMode);
  const sidebarWidth = useAppStore((s) => s.settings.sidebarWidth);
  const workspaceRoot = useAppStore((s) => s.workspaceRoot);
  const closeWorkspace = useAppStore((s) => s.closeWorkspace);
  const updateSettings = useAppStore((s) => s.updateSettings);
  const locale = useLocale((s) => s.locale);
  const t = tFor(locale);
  const [tab, setTab] = useState<"files" | "outline">("files");
  // latest-ref 模式：render 中写 ref 会被 react-hooks/refs 拦截，改为 effect 同步
  const tabRef = useRef(tab);
  useEffect(() => {
    tabRef.current = tab;
  }, [tab]);
  // dragging 同时需要给事件回调（ref）和渲染（state）使用
  const [dragging, setDragging] = useState(false);
  const draggingRef = useRef(false);
  const onMoveRef = useRef<((e: MouseEvent) => void) | null>(null);
  const onUpRef = useRef<((e: MouseEvent) => void) | null>(null);

  // outline 被关闭时，若当前停留在 outline 标签，自动切回 files，避免侧边栏空白
  useEffect(() => {
    if (!outlineVisible && tabRef.current === "outline") {
      setTab("files");
    }
  }, [outlineVisible]);

  useEffect(() => {
    return () => {
      // 组件卸载时清理拖拽监听器
      if (onMoveRef.current) {
        document.removeEventListener("mousemove", onMoveRef.current);
      }
      if (onUpRef.current) {
        document.removeEventListener("mouseup", onUpRef.current);
      }
    };
  }, []);

  const onResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      draggingRef.current = true;
      setDragging(true);
      const startX = e.clientX;
      const startWidth = sidebarWidth;
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";

      const onMove = (ev: MouseEvent) => {
        if (!draggingRef.current) return;
        const delta = ev.clientX - startX;
        const next = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, startWidth + delta));
        updateSettings({ sidebarWidth: next });
      };
      const onUp = () => {
        draggingRef.current = false;
        setDragging(false);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        onMoveRef.current = null;
        onUpRef.current = null;
      };
      onMoveRef.current = onMove;
      onUpRef.current = onUp;
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    },
    [sidebarWidth, updateSettings]
  );

  if (!sidebarVisible || focusMode) return null;

  return (
    <aside
      className="shrink-0 border-r overflow-hidden flex flex-col relative"
      style={{
        background: "var(--textora-bg-elev)",
        borderColor: "var(--textora-border)",
        width: sidebarWidth,
        transition: dragging ? "none" : "width 0.15s ease, opacity 0.15s ease",
      }}
    >
      <div
        className="flex shrink-0 items-center"
        style={{ borderBottom: "1px solid var(--textora-border)" }}
      >
        <TabButton
          active={tab === "files"}
          onClick={() => setTab("files")}
          label={t("sidebar.files")}
        />
        {outlineVisible && (
          <TabButton
            active={tab === "outline"}
            onClick={() => setTab("outline")}
            label={t("sidebar.outline")}
          />
        )}
        <div className="flex-1" />
        {workspaceRoot && (
          <button
            title={t("workspace.close")}
            onClick={() => closeWorkspace()}
            className="px-2 py-1 text-[11px] cursor-pointer"
            style={{ color: "var(--textora-fg-muted)", background: "transparent" }}
          >
            ✕
          </button>
        )}
      </div>
      <div className="flex-1 overflow-auto">
        {tab === "files" && <FileTree />}
        {tab === "outline" && outlineVisible && <Outline />}
      </div>
      {/* 拖拽调宽手柄 */}
      <div
        onMouseDown={onResizeStart}
        style={{
          position: "absolute",
          top: 0,
          right: -2,
          bottom: 0,
          width: 4,
          cursor: "col-resize",
          zIndex: 10,
        }}
        title={t("sidebar.dragToResize")}
      />
    </aside>
  );
}

function TabButton({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      className="flex-1 py-2 text-[11px] font-medium tracking-wide uppercase cursor-pointer transition-colors"
      style={{
        color: active ? "var(--textora-accent)" : "var(--textora-fg-muted)",
        borderBottom: active
          ? "1.5px solid var(--textora-accent)"
          : "1.5px solid transparent",
        background: "transparent",
        transition: "color 0.15s ease, border-color 0.15s ease",
      }}
      onClick={onClick}
    >
      {label}
    </button>
  );
}
