import { useAppStore } from "../store/useAppStore";
import { tFor, useLocale } from "../i18n";

/** 需要用户确认的危险工具（写文件/执行命令）；只读工具自动放行 */
const DANGEROUS_TOOLS = new Set(["write_file", "run_command"]);

/**
 * AI 工具调用确认门。
 * - 只读工具（read_file/list_dir/fetch_url）：自动放行（主进程已有 SSRF 与路径校验）
 * - 写文件/执行命令：弹全局确认框，用户允许才执行
 * 返回 false 时 aiService 会把「用户拒绝」作为工具结果告知模型。
 */
export function confirmAiToolCall(
  toolName: string,
  args: Record<string, unknown>
): Promise<boolean> {
  if (!DANGEROUS_TOOLS.has(toolName)) return Promise.resolve(true);

  const s = useAppStore.getState();
  // 已有其他确认框（关窗/关标签）时拒绝本次请求，避免覆盖
  if (s.pendingConfirm) return Promise.resolve(false);

  const t = tFor(useLocale.getState().locale);
  const isWrite = toolName === "write_file";
  const detail = isWrite
    ? String((args as { path?: unknown }).path || "")
    : String((args as { command?: unknown }).command || "");

  return new Promise<boolean>((resolve) => {
    const finish = (allowed: boolean) => {
      useAppStore.getState().clearPendingConfirm();
      resolve(allowed);
    };
    useAppStore.setState({
      pendingConfirm: {
        title: t(isWrite ? "ai.toolConfirm.writeTitle" : "ai.toolConfirm.runTitle"),
        message: t(
          isWrite ? "ai.toolConfirm.writeMessage" : "ai.toolConfirm.runMessage"
        ).replace(isWrite ? "{path}" : "{command}", detail.slice(0, 500)),
        saveLabel: t("ai.toolConfirm.allow"),
        discardLabel: t("ai.toolConfirm.deny"),
        cancelLabel: t("ai.toolConfirm.deny"),
        onSave: () => finish(true),
        onDiscard: () => finish(false),
        onCancel: () => finish(false),
      },
    });
  });
}
