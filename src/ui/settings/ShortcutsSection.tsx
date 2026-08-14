/**
 * 设置面板：快捷键分类（录制绑定 / 冲突检测 / 重置）。
 */
import React, { useCallback, useEffect, useState } from "react";
import {
  SHORTCUTS,
  getBinding,
  formatBinding,
  findConflict,
  saveCustomBindings,
  loadCustomBindings,
  resetBinding,
  eventToBinding,
} from "../../hooks/shortcutSchema";
import { refreshShortcutBindings } from "../../hooks/useShortcuts";

export function ShortcutsSection({ t }: { t: (key: string) => string }) {
  const [custom, setCustom] = useState<Record<string, string>>(() => loadCustomBindings());
  const [recordingId, setRecordingId] = useState<string | null>(null);
  const [conflict, setConflict] = useState<string | null>(null);

  useEffect(() => {
    if (!recordingId) return;
    const handler = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape") {
        setRecordingId(null);
        setConflict(null);
        return;
      }
      const binding = eventToBinding(e);
      if (!binding) return;
      const conflictId = findConflict(binding, recordingId, custom);
      if (conflictId) {
        setConflict(conflictId);
        return;
      }
      const next = { ...custom, [recordingId]: binding };
      setCustom(next);
      saveCustomBindings(next);
      refreshShortcutBindings();
      setRecordingId(null);
      setConflict(null);
    };
    window.addEventListener("keydown", handler, { capture: true });
    return () => window.removeEventListener("keydown", handler, { capture: true });
  }, [recordingId, custom]);

  const handleReset = useCallback((id: string) => {
    const next = resetBinding(SHORTCUTS.find((s) => s.id === id)!, custom);
    setCustom(next);
    saveCustomBindings(next);
    refreshShortcutBindings();
    setRecordingId(null);
    setConflict(null);
  }, [custom]);

  const handleResetAll = useCallback(() => {
    setCustom({});
    saveCustomBindings({});
    refreshShortcutBindings();
    setRecordingId(null);
    setConflict(null);
  }, []);

  const categories: Array<"file" | "edit" | "view" | "tabs" | "app"> = ["file", "edit", "view", "tabs", "app"];
  const conflictName = conflict
    ? t(SHORTCUTS.find((s) => s.id === conflict)?.descriptionKey ?? "")
    : null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-xs" style={{ color: "var(--textora-fg-muted)" }}>
          {t("settings.shortcuts.hint")}
        </span>
        <button
          className="text-xs px-2 py-0.5 rounded cursor-pointer"
          style={{ color: "var(--textora-fg-muted)" }}
          onClick={handleResetAll}
          onMouseEnter={(e) => (e.currentTarget.style.background = "var(--textora-bg-muted)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
        >
          {t("settings.shortcuts.resetAll")}
        </button>
      </div>
      {conflict && (
        <div className="text-xs px-2 py-1 rounded" style={{ background: "#ffebe9", color: "#cf222e" }}>
          {t("settings.shortcuts.conflict").replace("{name}", conflictName ?? "")}
        </div>
      )}
      {categories.map((cat) => (
        <div key={cat}>
          <div className="text-xs mb-1 font-semibold" style={{ color: "var(--textora-fg-muted)" }}>
            {t(`sc.category.${cat}`)}
          </div>
          {SHORTCUTS.filter((s) => s.category === cat).map((def) => {
            const binding = getBinding(def, custom);
            const isRecording = recordingId === def.id;
            const isConflicted = conflict && recordingId === def.id;
            return (
              <div key={def.id} className="flex items-center justify-between py-1 text-xs" style={{ borderBottom: "1px solid var(--textora-border)" }}>
                <span style={{ color: "var(--textora-fg)" }}>{t(def.descriptionKey)}</span>
                <div className="flex items-center gap-1.5">
                  <button
                    className="px-2 py-0.5 rounded border text-xs cursor-pointer"
                    style={{
                      borderColor: isRecording ? "var(--textora-accent)" : isConflicted ? "#cf222e" : "var(--textora-border)",
                      background: isRecording ? "var(--textora-accent)" : "transparent",
                      color: isRecording ? "var(--textora-accent-fg)" : "var(--textora-fg)",
                      minWidth: 72,
                      textAlign: "center",
                      fontFamily: "ui-monospace, monospace",
                    }}
                    onClick={() => { setRecordingId(def.id); setConflict(null); }}
                  >
                    {isRecording ? t("settings.shortcuts.recording") : formatBinding(binding)}
                  </button>
                  {custom[def.id] && (
                    <button
                      className="text-xs px-1 py-0.5 rounded cursor-pointer"
                      style={{ color: "var(--textora-fg-muted)" }}
                      onClick={() => handleReset(def.id)}
                      title={t("settings.shortcuts.reset")}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--textora-bg-muted)")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                    >
                      ↺
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
