import { createRoot } from "react-dom/client";
import { StrictMode, useCallback, useEffect, useRef, useState } from "react";
import { useLocale, tFor } from "../i18n";

/**
 * 命令式 prompt 对话框。
 *
 * Electron 渲染进程不支持 window.prompt()，调用会抛出
 * "prompt() is not supported" 错误。本工具在需要文本输入的场景中替代它，
 * 返回 Promise<string | null>：用户确认返回输入值，取消返回 null。
 */
export function showPrompt(
  title: string,
  defaultValue = "",
  placeholder = ""
): Promise<string | null> {
  return new Promise((resolve) => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    const cleanup = () => {
      // 延迟卸载以允许退出动画完成
      root.unmount();
      container.remove();
    };

    const handleResolve = (value: string | null) => {
      resolve(value);
      cleanup();
    };

    root.render(
      <StrictMode>
        <PromptDialog
          title={title}
          defaultValue={defaultValue}
          placeholder={placeholder}
          onResolve={handleResolve}
        />
      </StrictMode>
    );
  });
}

function PromptDialog({
  title,
  defaultValue,
  placeholder,
  onResolve,
}: {
  title: string;
  defaultValue: string;
  placeholder: string;
  onResolve: (value: string | null) => void;
}) {
  const [value, setValue] = useState(defaultValue);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  // Esc 取消、Enter 确认
  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        onResolve(value);
      } else if (e.key === "Escape") {
        e.preventDefault();
        onResolve(null);
      }
    },
    [value, onResolve]
  );

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center pt-[25vh] backdrop-blur-sm"
      style={{ background: "rgba(0,0,0,0.3)" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onResolve(null);
      }}
    >
      <div
        className="textora-card textora-glass animate-pop-in w-[400px] max-w-[90vw] rounded-xl overflow-hidden"
      >
        <div
          className="px-3 py-2 text-xs border-b"
          style={{ borderColor: "var(--textora-border)", color: "var(--textora-fg)" }}
        >
          {title}
        </div>
        <input
          ref={inputRef}
          className="w-full px-3 py-2 bg-transparent outline-none text-xs"
          style={{ color: "var(--textora-fg)" }}
          placeholder={placeholder}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={onKeyDown}
          spellCheck={false}
        />
        <div
          className="flex justify-end gap-2 px-3 py-2 border-t"
          style={{ borderColor: "var(--textora-border)" }}
        >
          <button
            className="px-3 py-1 text-xs rounded"
            style={{
              color: "var(--textora-fg-muted)",
              background: "var(--textora-bg-muted)",
            }}
            onClick={() => onResolve(null)}
          >
            {tFor(useLocale.getState().locale)("prompt.cancel")}
          </button>
          <button
            className="px-3 py-1 text-xs rounded text-white"
            style={{ background: "var(--textora-accent)" }}
            onClick={() => onResolve(value)}
          >
            {tFor(useLocale.getState().locale)("prompt.ok")}
          </button>
        </div>
      </div>
    </div>
  );
}
