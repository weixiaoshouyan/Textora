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

  // 当外部 content 变化（AI 插入、文件重载、撤销/重做等）时同步到右视图
  useEffect(() => {
    setSyncedContent(content);
  }, [content]);

  // Update synced content when left pane changes
  const handleLeftChange = useCallback((newContent: string) => {
    setContent(newContent);
    setSyncedContent(newContent);
  }, [setContent]);

  // Sync scroll between panes。
  // 注意：Milkdown（.ProseMirror）与 CodeEditor（textarea）的滚动发生在各自内部元素上，
  // 且 scroll 事件不冒泡——必须用捕获阶段监听容器，并定位 pane 内实际滚动元素。
  const findScrollable = useCallback((pane: HTMLElement): HTMLElement => {
    const ta = pane.querySelector<HTMLElement>(".textora-code-textarea");
    if (ta) return ta;
    const pm = pane.querySelector<HTMLElement>(".ProseMirror");
    if (pm) return pm;
    return pane;
  }, []);

  const syncScrollFrom = useCallback((srcEl: HTMLElement, dstPane: HTMLElement) => {
    if (syncingRef.current) return;
    syncingRef.current = true;
    const dstEl = findScrollable(dstPane);
    if (srcEl.scrollHeight > srcEl.clientHeight) {
      const ratio = srcEl.scrollTop / (srcEl.scrollHeight - srcEl.clientHeight);
      dstEl.scrollTop = ratio * (dstEl.scrollHeight - dstEl.clientHeight);
    }
    requestAnimationFrame(() => { syncingRef.current = false; });
  }, [findScrollable]);

  // 捕获阶段监听：scroll 不冒泡，捕获能收到任意子元素（textarea/ProseMirror）的滚动
  useEffect(() => {
    const left = leftRef.current;
    const right = rightRef.current;
    if (!left || !right) return;
    const onLeft = () => syncScrollFrom(findScrollable(left), right);
    const onRight = () => syncScrollFrom(findScrollable(right), left);
    left.addEventListener("scroll", onLeft, true);
    right.addEventListener("scroll", onRight, true);
    return () => {
      left.removeEventListener("scroll", onLeft, true);
      right.removeEventListener("scroll", onRight, true);
    };
  }, [findScrollable, syncScrollFrom]);

  if (!tab) return null;

  const isMarkdown = tab.kind === "markdown" && !sourceMode;

  return (
    <div className="flex h-full" style={{ height: "100%" }}>
      {/* Left pane (editable) */}
      <div
        ref={leftRef}
        className="flex-1 min-w-0 overflow-auto"
        style={{ borderRight: "1px solid var(--textora-border)" }}
      >
        {isMarkdown ? (
          <MilkdownEditor key={tab.id + "-left"} content={content} onChange={handleLeftChange} />
        ) : (
          <CodeEditor key={tab.id + "-left"} content={content} language={tab.language} onChange={handleLeftChange} />
        )}
      </div>

      {/* Right pane (read-only clone) */}
      <div
        ref={rightRef}
        className="flex-1 min-w-0 overflow-auto"
      >
        {isMarkdown ? (
          <MilkdownEditor key={tab.id + "-right"} content={syncedContent} onChange={() => {}} readOnly />
        ) : (
          <CodeEditor key={tab.id + "-right"} content={syncedContent} language={tab.language} onChange={() => {}} readOnly />
        )}
      </div>
    </div>
  );
}
