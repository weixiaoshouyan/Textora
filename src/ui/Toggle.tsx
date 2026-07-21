/**
 * 共享 Toggle 按钮组件
 * 
 * 用于查找替换、搜索面板等场景的开关按钮。
 */
export function Toggle({
  label,
  title,
  active,
  onClick,
}: {
  label: string;
  title: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      className="text-xs px-1.5 py-0.5 rounded"
      style={{
        border: "1px solid var(--textora-border)",
        color: active ? "var(--textora-accent-fg)" : "var(--textora-fg-muted)",
        background: active ? "var(--textora-accent)" : "transparent",
        fontFamily: "monospace",
      }}
    >
      {label}
    </button>
  );
}
