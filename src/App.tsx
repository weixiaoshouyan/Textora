import { Component, useEffect } from "react";
import type { ErrorInfo, ReactNode } from "react";
import { useAppStore, getActiveTab } from "./store/useAppStore";
import { useLocale, tFor, initSystemLocale } from "./i18n";
import { TopBar } from "./ui/TopBar";
import { StatusBar } from "./ui/StatusBar";
import { Sidebar } from "./ui/Sidebar";
import { Welcome } from "./ui/Welcome";
import { MilkdownEditor } from "./editor/MilkdownEditor";
import { CodeEditor } from "./editor/CodeEditor";
import { ImageView, HexView } from "./editor/FileViewers";
import { FindReplace } from "./ui/FindReplace";
import { QuickOpen } from "./ui/QuickOpen";
import { SettingsPanel } from "./ui/SettingsPanel";
import { TabBar } from "./ui/TabBar";
import { CommandPalette } from "./ui/CommandPalette";
import { SearchInFiles } from "./ui/SearchInFiles";
import { SaveConfirm } from "./ui/SaveConfirm";
import { DiffView } from "./ui/DiffView";
import { AiAssistant } from "./ui/AiAssistant";
import { useShortcuts } from "./hooks/useShortcuts";
import { useTauriMenu } from "./hooks/useTauriMenu";
import { useDragOpen } from "./hooks/useDragOpen";
import { useWindowClose } from "./hooks/useWindowClose";
import { useAutoSave } from "./hooks/useAutoSave";
import { SplitView } from "./ui/SplitView";
import { disposeShiki } from "./plugins/shikiClient";

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
    // 上报到主进程日志文件
    try {
      window.textora.emit("log", { level: "error", message: error.message, stack: info.componentStack });
    } catch { /* ignore */ }
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

export default function App() {
  useShortcuts();
  useTauriMenu();
  useDragOpen();
  useWindowClose();
  useAutoSave();
  const editing = useAppStore((s) => s.editing);
  const init = useAppStore((s) => s.init);
  const settings = useAppStore((s) => s.settings);
  const settingsPanelOpen = useAppStore((s) => s.settingsPanelOpen);
  const sourceMode = settings.sourceMode;
  const focusMode = settings.focusMode;
  const content = useAppStore((s) => s.content);
  const setContent = useAppStore((s) => s.setContent);

  // 编辑器渲染：按活动标签类型选择
  const renderEditor = () => {
    const tab = getActiveTab(useAppStore.getState());
    if (!tab) return <Welcome />;
    if (tab.kind === "image") return <ImageView />;
    if (tab.kind === "binary") return <HexView />;
    if (tab.kind === "markdown" && !sourceMode)
      return <MilkdownEditor content={content} onChange={setContent} />;
    return <CodeEditor content={content} language={tab.language} onChange={setContent} />;
  };

  useEffect(() => {
    let cancelled = false;
    let cleanup: (() => void) | null = null;
    void init().then((fn) => {
      if (cancelled) {
        // 已卸载（如 StrictMode 双调用），立即清理
        fn();
      } else {
        cleanup = fn;
      }
    });
    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [init]);

  // 应用退出时销毁 Shiki 高亮器，释放内存
  useEffect(() => {
    const handler = () => {
      void disposeShiki();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);

  // 启动时检测系统语言并应用
  useEffect(() => {
    void initSystemLocale();
  }, []);

  // 字体设置已在 MilkdownEditor 内通过 applyFont 应用

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
                <div key={useAppStore.getState().activeTabId ?? "none"} style={{ height: "100%" }}>
                  {renderEditor()}
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
        {settingsPanelOpen && <SettingsPanel />}
        <AiAssistant />
      </div>
    </ErrorBoundary>
  );
}
