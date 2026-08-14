import { useEffect, useMemo, useRef, useState, useCallback, forwardRef } from "react";
import { invoke, openDialog, readTextFile } from "../ipc";
import { useAppStore, getActiveTab } from "../store/useAppStore";
import { useLocale, tFor } from "../i18n";
import { diffTexts, diffStats, type DiffLine } from "../editor/diff";

/**
 * 文件比较视图（双栏 diff）。
 * 通过文件菜单"比较文件..."触发；也可由外部变更提示直接带入对比
 * （pendingExternalDiff：磁盘版本 vs 当前编辑版本）。
 *
 * 功能：
 *  - 选择左右两个文件进行行级 diff
 *  - 左栏显示原始文件（删除行红色背景）
 *  - 右栏显示修改文件（新增行绿色背景）
 *  - 两栏同步滚动
 *  - 支持交换左右文件
 *  - 显示统计信息（+N -M）
 */
export function DiffView() {
  const open = useAppStore((s) => s.diffViewOpen);
  const setOpen = useAppStore((s) => s.setDiffViewOpen);
  const locale = useLocale((s) => s.locale);
  const t = tFor(locale);

  const [pathA, setPathA] = useState<string | null>(null);
  const [pathB, setPathB] = useState<string | null>(null);
  const [textA, setTextA] = useState("");
  const [textB, setTextB] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const leftRef = useRef<HTMLDivElement | null>(null);
  const rightRef = useRef<HTMLDivElement | null>(null);
  // 防止同步滚动时互相触发
  const syncing = useRef(false);

  // 打开时重置状态；若有外部变更对比请求（磁盘 vs 当前编辑），直接带入
  useEffect(() => {
    if (open) {
      const pending = useAppStore.getState().pendingExternalDiff;
      if (pending) {
        useAppStore.getState().setPendingExternalDiff(null);
        const active = getActiveTab(useAppStore.getState());
        setPathA(pending.path);
        setTextA(pending.diskText);
        setPathB(active?.path ?? pending.path);
        setTextB(active?.content ?? "");
        setError(null);
      } else {
        setPathA(null);
        setPathB(null);
        setTextA("");
        setTextB("");
        setError(null);
      }
    }
  }, [open]);

  const pickFile = useCallback(async (side: "a" | "b") => {
    const selected = await openDialog({
      multiple: false,
      directory: false,
      title: side === "a" ? t("diff.pickLeft") : t("diff.pickRight"),
      filters: [{ name: "All Files", extensions: ["*"] }],
    });
    if (typeof selected !== "string") return;
    try {
      setError(null);
      setLoading(true);
      // 使用 Rust 后端读取（自动处理编码检测）
      // open_file 有工作区边界校验，但 DiffView 需要比较任意文件
      // 因此传 force_encoding 让后端走文本路径，同时路径在工作区外时回退到前端读取
      let text: string;
      let actualPath: string = selected;
      try {
        const res = await invoke("open_file", { path: selected });
        text = (res.text ?? "") as string;
        actualPath = res.path ?? selected;
      } catch {
        // 工作区外或大文件：回退到前端直接读取
        text = await readTextFile(selected);
      }
      if (side === "a") {
        setPathA(actualPath);
        setTextA(text);
      } else {
        setPathB(actualPath);
        setTextB(text);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [t]);

  const swap = useCallback(() => {
    setPathA(pathB);
    setPathB(pathA);
    setTextA(textB);
    setTextB(textA);
  }, [pathA, pathB, textA, textB]);

  // 计算差异
  const diff: DiffLine[] = useMemo(() => {
    if (!pathA || !pathB) return [];
    return diffTexts(textA, textB);
  }, [pathA, pathB, textA, textB]);

  const stats = useMemo(() => diffStats(diff), [diff]);

  // 双栏同步滚动
  const onScroll = useCallback((side: "left" | "right") => {
    if (syncing.current) return;
    syncing.current = true;
    const src = side === "left" ? leftRef.current : rightRef.current;
    const dst = side === "left" ? rightRef.current : leftRef.current;
    if (src && dst) {
      dst.scrollTop = src.scrollTop;
    }
    requestAnimationFrame(() => {
      syncing.current = false;
    });
  }, []);

  if (!open) return null;

  const basename = (p: string | null) => {
    if (!p) return t("diff.notSelected");
    return p.split(/[\\/]/).filter(Boolean).pop() || p;
  };

  return (
    <div
      className="fixed inset-0 z-40 flex flex-col"
      style={{ background: "var(--textora-bg)" }}
    >
      {/* 顶部工具栏 */}
      <div
        className="flex items-center gap-2 px-3 shrink-0"
        style={{
          height: 40,
          borderBottom: "1px solid var(--textora-border)",
          background: "var(--textora-bg-elev)",
        }}
      >
        <span className="text-sm font-semibold">{t("diff.title")}</span>
        <div className="flex-1" />
        {pathA && pathB && (
          <div className="flex items-center gap-3 text-xs" style={{ color: "var(--textora-fg-muted)" }}>
            <span style={{ color: "#1a7f37" }}>+{stats.additions}</span>
            <span style={{ color: "#cf222e" }}>-{stats.deletions}</span>
          </div>
        )}
        <button
          className="textora-btn"
          onClick={swap}
          disabled={!pathA || !pathB}
          style={{ fontSize: 12 }}
        >
          ⇄ {t("diff.swap")}
        </button>
        <button
          className="textora-btn"
          onClick={() => setOpen(false)}
          style={{ fontSize: 12 }}
        >
          ✕ {t("settings.close")}
        </button>
      </div>

      {/* 文件选择栏 */}
      <div
        className="flex items-stretch shrink-0"
        style={{ borderBottom: "1px solid var(--textora-border)" }}
      >
        <FilePicker
          label={t("diff.left")}
          path={pathA}
          basename={basename(pathA)}
          onPick={() => pickFile("a")}
          accent="left"
        />
        <div style={{ width: 1, background: "var(--textora-border)" }} />
        <FilePicker
          label={t("diff.right")}
          path={pathB}
          basename={basename(pathB)}
          onPick={() => pickFile("b")}
          accent="right"
        />
      </div>

      {/* 错误提示 */}
      {error && (
        <div
          className="px-3 py-2 text-xs shrink-0"
          style={{ background: "#ffebe9", color: "#cf222e" }}
        >
          {error}
        </div>
      )}

      {/* 加载提示 */}
      {loading && (
        <div
          className="px-3 py-2 text-xs shrink-0"
          style={{ background: "var(--textora-bg-muted)", color: "var(--textora-fg-muted)" }}
        >
          {t("diff.loading")}
        </div>
      )}

      {/* diff 主体 */}
      <div className="flex-1 min-h-0 flex overflow-hidden">
        {!pathA || !pathB ? (
          <div
            className="flex-1 flex items-center justify-center text-sm"
            style={{ color: "var(--textora-fg-muted)" }}
          >
            {t("diff.selectPrompt")}
          </div>
        ) : (
          <>
            <DiffPane
              ref={leftRef}
              side="left"
              diff={diff}
              onScroll={() => onScroll("left")}
            />
            <div style={{ width: 1, background: "var(--textora-border)" }} />
            <DiffPane
              ref={rightRef}
              side="right"
              diff={diff}
              onScroll={() => onScroll("right")}
            />
          </>
        )}
      </div>
    </div>
  );
}

/** 文件选择按钮 */
function FilePicker({
  label,
  path,
  basename,
  onPick,
  accent,
}: {
  label: string;
  path: string | null;
  basename: string;
  onPick: () => void;
  accent: "left" | "right";
}) {
  return (
    <div className="flex-1 flex items-center gap-2 px-3 py-1.5">
      <span
        className="text-xs"
        style={{ color: "var(--textora-fg-muted)" }}
      >
        {label}:
      </span>
      <button
        className="flex-1 text-left text-xs px-2 py-1 rounded border truncate"
        style={{
          borderColor: "var(--textora-border)",
          background: path ? "var(--textora-bg)" : "var(--textora-bg-muted)",
          color: accent === "left" ? "#cf222e" : "#1a7f37",
        }}
        onClick={onPick}
        title={path ?? ""}
      >
        {basename}
      </button>
    </div>
  );
}

/** diff 单栏渲染 */
const DiffPane = forwardRef<
  HTMLDivElement,
  {
    side: "left" | "right";
    diff: DiffLine[];
    onScroll: () => void;
  }
>(({ side, diff, onScroll }, ref) => {
  const locale = useLocale((s) => s.locale);
  const t = tFor(locale);
  // 该侧可见行：左侧显示 equal/del，右侧显示 equal/add
  const visible = diff.filter((l) =>
    side === "left" ? l.type !== "add" : l.type !== "del"
  );

  return (
    <div
      ref={ref}
      onScroll={onScroll}
      className="flex-1 overflow-auto"
      style={{ background: "var(--textora-bg)" }}
    >
      <div style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace", fontSize: 13, lineHeight: "1.55" }}>
        {visible.map((line, idx) => {
          const lineNum = side === "left" ? line.leftLine : line.rightLine;
          const isDel = line.type === "del";
          const isAdd = line.type === "add";
          const bg = side === "left" && isDel
            ? "rgba(207, 34, 46, 0.12)"
            : side === "right" && isAdd
              ? "rgba(26, 127, 55, 0.12)"
              : "transparent";
          const marker = side === "left" ? (isDel ? "-" : " ") : (isAdd ? "+" : " ");
          const numColor = isDel ? "#cf222e" : isAdd ? "#1a7f37" : "var(--textora-fg-muted)";
          return (
            <div
              key={idx}
              className="flex"
              style={{
                background: bg,
                minHeight: "1.55em",
              }}
            >
              <span
                className="shrink-0 text-right pr-2 select-none"
                style={{
                  width: 52,
                  color: numColor,
                  borderRight: "1px solid var(--textora-border)",
                  padding: "0 8px",
                  background: "var(--textora-bg-elev)",
                }}
              >
                {lineNum ?? ""}
              </span>
              <span
                className="shrink-0 select-none"
                style={{ width: 18, textAlign: "center", color: numColor }}
              >
                {marker}
              </span>
              <span
                className="flex-1 whitespace-pre-wrap break-all"
                style={{
                  color: isDel ? "#cf222e" : isAdd ? "#1a7f37" : "var(--textora-fg)",
                  padding: "0 8px",
                }}
              >
                {line.text || "\u00a0"}
              </span>
            </div>
          );
        })}
        {visible.length === 0 && (
          <div
            className="p-4 text-xs"
            style={{ color: "var(--textora-fg-muted)" }}
          >
            {t("diff.empty")}
          </div>
        )}
      </div>
    </div>
  );
});

DiffPane.displayName = "DiffPane";
