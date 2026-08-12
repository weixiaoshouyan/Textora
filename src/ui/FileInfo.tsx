import { useEffect, useState } from "react";
import { getFileInfo, FileInfo as FileInfoType } from "../ipc";
import { useLocale } from "../i18n";

interface FileInfoDialogProps {
  filePath: string;
  onClose: () => void;
}

export function FileInfoDialog({ filePath, onClose }: FileInfoDialogProps) {
  const [info, setInfo] = useState<FileInfoType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const locale = useLocale((s) => s.locale);
  const isZh = locale === "zh";

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getFileInfo(filePath)
      .then((data) => {
        if (!cancelled) {
          // 对主进程返回的字段做空值兜底，避免渲染期 .toLocaleString()/.toUpperCase() 抛错白屏
          setInfo({
            ...data,
            name: data.name ?? "",
            dir: data.dir ?? "",
            ext: data.ext ?? "",
            size: data.size ?? 0,
            sizeFormatted: data.sizeFormatted ?? "0 B",
            encoding: data.encoding ?? "",
            created: data.created ?? "",
            modified: data.modified ?? "",
            lineCount: data.lineCount ?? 0,
            wordCount: data.wordCount ?? 0,
            charCount: data.charCount ?? 0,
          });
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(String(err));
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [filePath]);

  const formatDate = (iso: string): string => {
    try {
      const d = new Date(iso);
      return d.toLocaleString(isZh ? "zh-CN" : "en-US", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
    } catch {
      return iso;
    }
  };

  const readingTime = (words: number): string => {
    const minutes = Math.ceil(words / 300);
    if (minutes < 1) return isZh ? "少于 1 分钟" : "< 1 min";
    return isZh ? `约 ${minutes} 分钟` : `~${minutes} min`;
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm"
      style={{ background: "rgba(0,0,0,0.4)" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="textora-card textora-glass w-[420px] max-w-[90vw] overflow-hidden rounded-xl shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 标题栏 */}
        <div
          className="flex items-center justify-between px-4 py-3 border-b"
          style={{ borderColor: "var(--textora-border)" }}
        >
          <h2 className="text-sm font-medium" style={{ color: "var(--textora-fg)" }}>
            {isZh ? "文件属性" : "File Properties"}
          </h2>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-black/10 transition-colors"
            style={{ color: "var(--textora-fg-muted)" }}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path
                d="M12 4L4 12M4 4l8 8"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        {/* 内容 */}
        <div className="p-4 space-y-3 max-h-[60vh] overflow-auto">
          {loading && (
            <div className="text-center py-8 text-sm" style={{ color: "var(--textora-fg-muted)" }}>
              {isZh ? "加载中..." : "Loading..."}
            </div>
          )}

          {error && (
            <div className="text-center py-8 text-sm text-red-500">
              {error}
            </div>
          )}

          {info && !loading && (
            <>
              {/* 文件名 */}
              <div className="flex flex-col gap-1">
                <span className="text-xs" style={{ color: "var(--textora-fg-muted)" }}>
                  {isZh ? "文件名" : "Name"}
                </span>
                <span className="text-sm font-medium break-all" style={{ color: "var(--textora-fg)" }}>
                  {info.name}
                </span>
              </div>

              {/* 路径 */}
              <div className="flex flex-col gap-1">
                <span className="text-xs" style={{ color: "var(--textora-fg-muted)" }}>
                  {isZh ? "位置" : "Location"}
                </span>
                <span className="text-xs break-all" style={{ color: "var(--textora-fg)" }}>
                  {info.dir}
                </span>
              </div>

              {/* 类型 */}
              <div className="flex flex-col gap-1">
                <span className="text-xs" style={{ color: "var(--textora-fg-muted)" }}>
                  {isZh ? "类型" : "Type"}
                </span>
                <span className="text-sm" style={{ color: "var(--textora-fg)" }}>
                {info.isDirectory
                  ? isZh ? "文件夹" : "Folder"
                  : (info.ext.toUpperCase().slice(1) || (isZh ? "文件" : "File")) + ` (${info.ext})`}
                </span>
              </div>

              {/* 大小 */}
              <div className="flex flex-col gap-1">
                <span className="text-xs" style={{ color: "var(--textora-fg-muted)" }}>
                  {isZh ? "大小" : "Size"}
                </span>
                <span className="text-sm" style={{ color: "var(--textora-fg)" }}>
                  {info.sizeFormatted} ({info.size.toLocaleString()} {isZh ? "字节" : "bytes"})
                </span>
              </div>

              {/* 编码 */}
              {info.encoding && (
                <div className="flex flex-col gap-1">
                  <span className="text-xs" style={{ color: "var(--textora-fg-muted)" }}>
                    {isZh ? "编码" : "Encoding"}
                  </span>
                  <span className="text-sm uppercase" style={{ color: "var(--textora-fg)" }}>
                    {info.encoding}
                  </span>
                </div>
              )}

              {/* 统计信息 */}
              {info.wordCount !== undefined && (
                <div
                  className="grid grid-cols-3 gap-2 p-3 rounded-lg"
                  style={{ background: "var(--textora-bg-muted)" }}
                >
                  <div className="text-center">
                    <div className="text-lg font-medium" style={{ color: "var(--textora-fg)" }}>
                      {info.lineCount}
                    </div>
                    <div className="text-xs" style={{ color: "var(--textora-fg-muted)" }}>
                      {isZh ? "行" : "Lines"}
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="text-lg font-medium" style={{ color: "var(--textora-fg)" }}>
                      {info.wordCount}
                    </div>
                    <div className="text-xs" style={{ color: "var(--textora-fg-muted)" }}>
                      {isZh ? "字" : "Words"}
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="text-lg font-medium" style={{ color: "var(--textora-fg)" }}>
                      {info.charCount}
                    </div>
                    <div className="text-xs" style={{ color: "var(--textora-fg-muted)" }}>
                      {isZh ? "字符" : "Chars"}
                    </div>
                  </div>
                </div>
              )}

              {/* 阅读时间 */}
              {info.wordCount !== undefined && (
                <div className="flex items-center gap-2 text-xs" style={{ color: "var(--textora-fg-muted)" }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" />
                    <path d="M12 6v6l4 2" />
                  </svg>
                  {isZh ? "预计阅读时间" : "Reading time"}: {readingTime(info.wordCount)}
                </div>
              )}

              {/* 时间信息 */}
              <div
                className="grid grid-cols-2 gap-3 p-3 rounded-lg"
                style={{ background: "var(--textora-bg-muted)" }}
              >
                <div>
                  <div className="text-xs mb-1" style={{ color: "var(--textora-fg-muted)" }}>
                    {isZh ? "创建时间" : "Created"}
                  </div>
                  <div className="text-xs" style={{ color: "var(--textora-fg)" }}>
                    {formatDate(info.created)}
                  </div>
                </div>
                <div>
                  <div className="text-xs mb-1" style={{ color: "var(--textora-fg-muted)" }}>
                    {isZh ? "修改时间" : "Modified"}
                  </div>
                  <div className="text-xs" style={{ color: "var(--textora-fg)" }}>
                    {formatDate(info.modified)}
                  </div>
                </div>
              </div>

              {/* 属性标志 */}
              <div className="flex gap-2 flex-wrap">
                {info.isSymbolicLink && (
                  <span
                    className="px-2 py-0.5 text-xs rounded"
                    style={{ background: "var(--textora-bg-muted)", color: "var(--textora-fg-muted)" }}
                  >
                    {isZh ? "符号链接" : "Symbolic Link"}
                  </span>
                )}
              </div>
            </>
          )}
        </div>

        {/* 底部按钮 */}
        <div
          className="flex justify-end px-4 py-3 border-t"
          style={{ borderColor: "var(--textora-border)" }}
        >
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-sm rounded-lg transition-colors"
            style={{
              background: "var(--textora-accent, #3b82f6)",
              color: "#fff",
            }}
          >
            {isZh ? "确定" : "OK"}
          </button>
        </div>
      </div>
    </div>
  );
}
