import { useAppStore, getActiveTab } from "../store/useAppStore";

function fmtSize(n?: number): string {
  if (n == null) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

export function ImageView() {
  // 订阅 tabs / activeTabId，切换标签时视图同步更新
  const activeTabId = useAppStore((s) => s.activeTabId);
  const tabsVersion = useAppStore((s) => s.tabs);
  const active = getActiveTab({ activeTabId, tabs: tabsVersion } as any);
  if (!active?.imageData) {
    return (
      <div style={{ padding: 24, color: "var(--textora-fg-muted)" }}>
        无法预览该图片。
      </div>
    );
  }
  const sizeStr = fmtSize(active.size);
  const meta = [active.name, sizeStr, active.imageMime].filter(Boolean).join(" · ");
  return (
    <div className="textora-image-view">
      <img src={active.imageData} alt={active.name} />
      <div
        style={{
          position: "absolute",
          bottom: 12,
          left: "50%",
          transform: "translateX(-50%)",
          fontSize: 11,
          color: "var(--textora-fg-muted)",
          background: "var(--textora-bg-elev)",
          border: "1px solid var(--textora-border)",
          borderRadius: 4,
          padding: "3px 10px",
        }}
      >
        {meta}
      </div>
    </div>
  );
}

export function HexView() {
  // 订阅 tabs / activeTabId
  const activeTabId = useAppStore((s) => s.activeTabId);
  const tabsVersion = useAppStore((s) => s.tabs);
  const active = getActiveTab({ activeTabId, tabs: tabsVersion } as any);
  const preview = active?.hexPreview ?? "";
  const sizeStr = fmtSize(active?.size);
  const meta = [active?.name, sizeStr].filter(Boolean).join(" · ");
  return (
    <div className="textora-hex-view">
      <div
        style={{
          fontSize: 12,
          color: "var(--textora-fg-muted)",
          marginBottom: 10,
        }}
      >
        {meta} · 二进制文件（只读预览，显示前 1024 字节）
      </div>
      <pre>{preview || "（空文件）"}</pre>
    </div>
  );
}
