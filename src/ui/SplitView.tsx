/**
 * SplitView - 分屏/克隆视图
 * 
 * 同一文件的双视图显示，支持同步滚动。
 * 左视图为可编辑主视图，右视图为只读克隆视图。
 * 滚动时两者保持同步，内容变更自动同步到右视图。
 */
import { useEffect, useRef, useState, useCallback } from "react";
import { useAppStore, getActiveTab } from "../store/useAppStore";
import { MilkdownEditor } from "../editor/MilkdownEditor";
import { CodeEditor } from "../editor/CodeEditor";

export function SplitView() {
  const content = useAppStore((s) => s.content);
  const setContent = useAppStore((s) => s.setContent);
  const sourceMode = useAppStore((s) => s.settings.sourceMode);
  const tab = useAppStore((s) => getActiveTab(s));

  const leftRef = useRef<HTMLDivElement>(null);
  const rightRef = useRef<HTMLDivElement>(null);
  const syncingRef = useRef(false);

  // Synced content for right pane
  const [syncedContent, setSyncedContent] = useState(content);

  // Update synced content when left pane changes
  const handleLeftChange = useCallback((newContent: string) => {
    setContent(newContent);
    setSyncedContent(newContent);
  }, [setContent]);

  // Sync scroll between panes
  const syncScroll = useCallback((source: "left" | "right") => {
    if (syncingRef.current) return;
    syncingRef.current = true;

    const srcRef = source === "left" ? leftRef : rightRef;
    const dstRef = source === "left" ? rightRef : leftRef;
    const srcEl = srcRef.current;
    const dstEl = dstRef.current;

    if (srcEl && dstEl && srcEl.scrollHeight > srcEl.clientHeight) {
      const ratio = srcEl.scrollTop / (srcEl.scrollHeight - srcEl.clientHeight);
      dstEl.scrollTop = ratio * (dstEl.scrollHeight - dstEl.clientHeight);
    }

    requestAnimationFrame(() => { syncingRef.current = false; });
  }, []);

  if (!tab) return null;

  const isMarkdown = tab.kind === "markdown" && !sourceMode;

  return (
    <div className="flex h-full" style={{ height: "100%" }}>
      {/* Left pane (editable) */}
      <div
        ref={leftRef}
        className="flex-1 min-w-0 overflow-auto"
        onScroll={() => syncScroll("left")}
        style={{ borderRight: "1px solid var(--textora-border)" }}
      >
        {isMarkdown ? (
          <MilkdownEditor content={content} onChange={handleLeftChange} />
        ) : (
          <CodeEditor content={content} language={tab.language} onChange={handleLeftChange} />
        )}
      </div>

      {/* Right pane (read-only clone) */}
      <div
        ref={rightRef}
        className="flex-1 min-w-0 overflow-auto"
        onScroll={() => syncScroll("right")}
      >
        {isMarkdown ? (
          <MilkdownEditor content={syncedContent} onChange={() => {}} />
        ) : (
          <CodeEditor content={syncedContent} language={tab.language} onChange={() => {}} />
        )}
      </div>
    </div>
  );
}
