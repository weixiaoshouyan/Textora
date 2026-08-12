import { beforeEach, describe, expect, it } from "vitest";
import { useAppStore } from "../store/useAppStore";
import { confirmAiToolCall } from "../ai/confirmToolCall";
import { useLocale } from "../i18n";

describe("confirmAiToolCall", () => {
  beforeEach(() => {
    useAppStore.setState({ pendingConfirm: null });
    useLocale.setState({ locale: "zh" });
  });

  it("auto-allows read-only tools without showing a dialog", async () => {
    await expect(confirmAiToolCall("read_file", { path: "a.md" })).resolves.toBe(true);
    await expect(confirmAiToolCall("list_dir", {})).resolves.toBe(true);
    await expect(confirmAiToolCall("fetch_url", { url: "https://example.com" })).resolves.toBe(true);
    expect(useAppStore.getState().pendingConfirm).toBeNull();
  });

  it("shows a confirm dialog for write_file and resolves true on allow", async () => {
    const p = confirmAiToolCall("write_file", { path: "C:/ws/out.md" });
    const dialog = useAppStore.getState().pendingConfirm;
    expect(dialog).not.toBeNull();
    expect(dialog!.title).toContain("写入");
    expect(dialog!.message).toContain("C:/ws/out.md");
    dialog!.onSave();
    await expect(p).resolves.toBe(true);
    expect(useAppStore.getState().pendingConfirm).toBeNull();
  });

  it("resolves false when the user denies or cancels", async () => {
    const p1 = confirmAiToolCall("run_command", { command: "echo hi" });
    useAppStore.getState().pendingConfirm!.onDiscard();
    await expect(p1).resolves.toBe(false);

    const p2 = confirmAiToolCall("write_file", { path: "x.md" });
    useAppStore.getState().pendingConfirm!.onCancel();
    await expect(p2).resolves.toBe(false);
  });

  it("rejects immediately when another confirm dialog is already open", async () => {
    useAppStore.setState({
      pendingConfirm: {
        title: "existing",
        message: "busy",
        onSave: () => {},
        onDiscard: () => {},
        onCancel: () => {},
      },
    });
    await expect(confirmAiToolCall("write_file", { path: "x.md" })).resolves.toBe(false);
    // 不覆盖已有确认框
    expect(useAppStore.getState().pendingConfirm!.title).toBe("existing");
  });
});
