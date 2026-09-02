/**
 * PDF 只读预览查看器。
 * 渲染层 sandbox 无法直读本地文件：通过主进程 IPC（read_pdf_file）读取，
 * 以 data URL 喂给 Chromium 内置 PDF 查看器（iframe）。
 */
import { useEffect, useState } from "react";
import { invoke } from "../../ipc";

export function PdfViewer({ path }: { path: string }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    setDataUrl(null);
    setError("");
    invoke<string>("read_pdf_file", { path })
      .then((data) => {
        if (!cancelled) setDataUrl(data);
      })
      .catch((e) => {
        if (!cancelled) setError(e?.message ? String(e.message) : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [path]);

  if (error) {
    return (
      <div style={{ padding: 24, fontSize: 13, color: "#d4380d" }}>
        <div style={{ fontWeight: 600, marginBottom: 6 }}>PDF 无法预览</div>
        <div style={{ color: "var(--textora-fg-muted)" }}>{error}</div>
      </div>
    );
  }

  if (!dataUrl) {
    return (
      <div style={{ padding: 24, fontSize: 13, color: "var(--textora-fg-muted)" }}>
        正在加载 PDF…
      </div>
    );
  }

  return (
    <iframe
      src={dataUrl}
      title="PDF 预览"
      style={{ width: "100%", height: "100%", border: "none" }}
    />
  );
}
