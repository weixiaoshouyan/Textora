import { useAppStore } from "../store/useAppStore";
import { useLocale, tFor } from "../i18n";

export function SaveConfirm() {
  const pending = useAppStore((s) => s.pendingConfirm);
  const locale = useLocale((s) => s.locale);
  const t = tFor(locale);
  if (!pending) return null;

  return (
    <div
      className="textora-overlay-backdrop"
      style={{ paddingTop: "30vh" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) pending.onCancel();
      }}
    >
      <div className="textora-card textora-confirm">
        <div style={{ fontWeight: 600, fontSize: 14, color: "var(--textora-fg)" }}>
          {pending.title}
        </div>
        <div className="msg">{pending.message}</div>
        <div className="actions">
          <button className="textora-btn" onClick={pending.onCancel}>
            {t("unsaved.cancel")}
          </button>
          <button className="textora-btn" onClick={pending.onDiscard}>
            {t("unsaved.discard")}
          </button>
          <button className="textora-btn textora-btn-primary" onClick={pending.onSave}>
            {t("unsaved.save")}
          </button>
        </div>
      </div>
    </div>
  );
}
