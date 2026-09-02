import { Component, useEffect, lazy, Suspense, useState } from "react";
import type { ErrorInfo, ReactNode } from "react";
import { useAppStore, getActiveTab } from "./store/useAppStore";
import { useLocale, tFor, initSystemLocale } from "./i18n";
import { TopBar } from "./ui/topbar";
import { StatusBar } from "./ui/StatusBar";
import { Sidebar } from "./ui/Sidebar";
import { Welcome } from "./ui/Welcome";
// 编辑器组件体积大（Milkdown/mermaid/shiki ~12MB），懒加载避免首屏全量解析
const MilkdownEditor = lazy(() => import("./editor/MilkdownEditor").then((m) => ({ default: m.MilkdownEditor })));
const CodeEditor = lazy(() => import("./editor/codeEditor").then((m) => ({ default: m.CodeEditor })));
const SplitView = lazy(() => import("./ui/SplitView").then((m) => ({ default: m.SplitView })));
import { ImageView, HexView } from "./editor/FileViewers";
import { CsvViewer, JsonViewer, PdfViewer, extOf } from "./editor/viewers";
import { FindReplace } from "./ui/FindReplace";
import { QuickOpen } from "./ui/QuickOpen";
const SettingsPanel = lazy(() => import("./ui/settings").then(m => ({ default: m.SettingsPanel })));
import { TabBar } from "./ui/TabBar";
import { CommandPalette } from "./ui/CommandPalette";
import { SearchInFiles } from "./ui/SearchInFiles";
import { SaveConfirm } from "./ui/SaveConfirm";
import { DiffView } from "./ui/DiffView";
import { GraphView } from "./ui/GraphView";
import { AiAssistant } from "./ui/AiAssistant";
import { FileInfoDialog } from "./ui/FileInfo";
import { useShortcuts } from "./hooks/useShortcuts";
import { useAppMenu } from "./hooks/useAppMenu";
import { useDragOpen } from "./hooks/useDragOpen";
import { useWindowClose } from "./hooks/useWindowClose";
import { useAutoSave } from "./hooks/useAutoSave";
import { disposeShiki } from "./plugins/shikiClient";
import { rlog, installGlobalErrorHandlers } from "./rendererLogger";

class ErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean; error: Error | null }
> {
  state = { hasError: false, error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("ErrorBoundary caught:", error, info);
    rlog.error("ErrorBoundary caught: " + error.message, {
      stack: error.stack,
      componentStack: info.componentStack,
    });
  }
  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            height: "100vh",
            padding: 32,
            background: "var(--textora-bg)",
            color: "var(--textora-fg)",
          }}
        >
          <h2 style={{ marginBottom: 8 }}>{tFor(useLocale.getState().locale)("app.errorTitle")}</h2>
          <pre
            style={{
              fontSize: 13,
              color: "var(--textora-fg-muted)",
              maxWidth: 600,
              overflow: "auto",
              whiteSpace: "pre-wrap",
            }}
          >
            {this.state.error?.message}
          </pre>
          <button
            className="textora-btn textora-btn-primary"
            style={{ marginTop: 16 }}
            onClick={() => {
              this.setState({ hasError: false, error: null });
              window.location.reload();
            }}
          >
            {tFor(useLocale.getState().locale)("app.reload")}
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

/**
 * 局部错误边界：包裹懒加载组件（如 SettingsPanel）。
 * chunk 加载失败（磁盘错误/缓存损坏）时静默降级，
 * 而不是把错误冒泡到顶层 ErrorBoundary 导致整个界面白屏。
 */
class LazyBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: Error) {
    console.error("LazyBoundary caught:", error);
    rlog.error("LazyBoundary caught: " + error.message);
  }
  render() {
    if (this.state.failed) return null;
    return this.props.children;
  }
}

export default function App() {
  useShortcuts();
  useAppMenu();
  useDragOpen();
  useWindowClose();
  useAutoSave();

  useEffect(() => {
    installGlobalErrorHandlers();
    rlog.info("Renderer App mounted.");
  }, []);

  const editing = useAppStore((s) => s.editing);
  const init = useAppStore((s) => s.init);
  const settings = useAppStore((s) => s.settings);
  const settingsPanelOpen = useAppStore((s) => s.settingsPanelOpen);
  const sourceMode = settings.sourceMode;
  const focusMode = settings.focusMode;
  const content = useAppStore((s) => s.content);
  const setContent = useAppStore((s) => s.setContent);
  const splitViewOpen = useAppStore((s) => s.splitViewOpen);
  const currentPath = useAppStore((s) => s.currentPath);
  const activeTabId = useAppStore((s) => s.activeTabId);
  const activeTab = useAppStore((s) => getActiveTab(s));
  const restoredDirtyTabs = useAppStore((s) => s.restoredDirtyTabs);
  const dismissRestoredDirty = useAppStore((s) => s.dismissRestoredDirty);
  const discardRestoredDirty = useAppStore((s) => s.discardRestoredDirty);

  const [fileInfoPath, setFileInfoPath] = useState<string | null>(null);

  useEffect(() => {
    const handler = () => {
      if (currentPath) {
        setFileInfoPath(currentPath);
      }
    };
    window.addEventListener("textora:show-file-info", handler);
    return () => window.removeEventListener("textora:show-file-info", handler);
  }, [currentPath]);

  const renderEditor = () => {
    if (!activeTab) return <Welcome />;
    if (splitViewOpen && (activeTab.kind === "markdown" || activeTab.kind === "code")) return <SplitView />;
    if (activeTab.kind === "image") return <ImageView />;
    if (activeTab.kind === "binary") return <HexView />;
    // 专用查看器（CSV / JSON / PDF）：按扩展名路由，先于通用编辑器
    const ext = extOf(activeTab.path);
    if (ext === "pdf" && activeTab.path) return <PdfViewer path={activeTab.path} />;
    if (ext === "csv" || ext === "tsv") return <CsvViewer text={content} name={activeTab.name} />;
    if (ext === "json" || ext === "jsonc" || ext === "json5") return <JsonViewer text={content} name={activeTab.name} />;
    if (activeTab.kind === "markdown" && !sourceMode)
      return <MilkdownEditor content={content} onChange={setContent} />;
    return <CodeEditor content={content} language={activeTab.language} onChange={setContent} />;
  };

  useEffect(() => {
    let cancelled = false;
    let cleanup: (() => void) | null = null;
    void init()
      .then((fn) => {
        if (cancelled) {
          fn();
        } else {
          cleanup = fn;
        }
      })
      .catch((err) => {
        // init 失败（如 watch-event 监听注册失败）：记录日志避免 unhandledrejection，
        // 应用其余功能（打开文件/编辑）仍可用。
        console.error("[App] init failed:", err);
        rlog.error("[App] init failed: " + (err instanceof Error ? err.message : String(err)));
      });
    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [init]);

  useEffect(() => {
    const handler = () => {
      void disposeShiki();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);

  useEffect(() => {
    void initSystemLocale();
  }, []);

  return (
    <ErrorBoundary>
      <div className="flex flex-col h-full relative">
        {!focusMode && <TopBar />}
        <div className="flex flex-1 min-h-0">
          <Sidebar />
          <main className="flex-1 min-w-0 flex flex-col relative">
            <TabBar />
            <div className="flex-1 min-h-0 relative overflow-auto">
              {editing ? (
                <div key={activeTabId ?? "none"} style={{ height: "100%" }}>
                  <Suspense fallback={null}>
                    <LazyBoundary>
                      {renderEditor()}
                    </LazyBoundary>
                  </Suspense>
                </div>
              ) : (
                <Welcome />
              )}
              <FindReplace />
            </div>
          </main>
        </div>
        {!focusMode && <StatusBar />}
        <QuickOpen />
        <SearchInFiles />
        <CommandPalette />
        <SaveConfirm />
        <DiffView />
        <GraphView />
        {settingsPanelOpen && (
          <Suspense fallback={null}>
            <LazyBoundary>
              <SettingsPanel />
            </LazyBoundary>
          </Suspense>
        )}
        <AiAssistant />
        {fileInfoPath && (
          <FileInfoDialog
            filePath={fileInfoPath}
            onClose={() => setFileInfoPath(null)}
          />
        )}
        {/* 崩溃恢复提示条：上次会话的未保存修改已恢复，可保留或丢弃（不静默覆盖磁盘） */}
        {restoredDirtyTabs.length > 0 && (
          <div
            role="status"
            className="fixed bottom-10 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-4 py-2.5 rounded-lg shadow-lg"
            style={{
              background: "var(--textora-bg-elev)",
              border: "1px solid var(--textora-border)",
              color: "var(--textora-fg)",
              maxWidth: "min(640px, calc(100vw - 32px))",
            }}
          >
            <span style={{ fontSize: 13, lineHeight: 1.5 }}>
              {tFor(useLocale.getState().locale)("restore.dirtyTitle").replace("{count}", String(restoredDirtyTabs.length))}
              <span style={{ display: "block", color: "var(--textora-fg-muted)", fontSize: 12 }}>
                {tFor(useLocale.getState().locale)("restore.dirtyMessage")}
              </span>
            </span>
            <button
              className="textora-btn"
              onClick={() => { void discardRestoredDirty(); }}
              style={{ whiteSpace: "nowrap" }}
            >
              {tFor(useLocale.getState().locale)("restore.discard")}
            </button>
            <button
              className="textora-btn textora-btn-primary"
              onClick={() => dismissRestoredDirty()}
              style={{ whiteSpace: "nowrap" }}
            >
              {tFor(useLocale.getState().locale)("restore.keep")}
            </button>
          </div>
        )}
      </div>
    </ErrorBoundary>
  );
}
