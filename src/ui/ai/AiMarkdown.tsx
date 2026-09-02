/**
 * AI 助手消息的轻量 Markdown 渲染。
 * 纯 JSX 实现（绝不使用 dangerouslySetInnerHTML），避免模型输出注入 HTML。
 * 支持：围栏代码块、行内代码、加粗、斜体、无序列表、标题、链接（文本化）。
 * 其余内容按纯文本展示。
 */
import { Fragment, type ReactNode } from "react";

/** 行内解析：`code`、**bold**、*italic*、[text](url) */
function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const out: ReactNode[] = [];
  const tokenRe = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*\s][^*]*\*)|(\[[^\]]+\]\([^)]+\))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  const nextKey = (suffix: string) => `${keyPrefix}-${suffix}-${k++}`;
  while ((m = tokenRe.exec(text)) !== null) {
    if (m.index > last) {
      out.push(<Fragment key={nextKey("t")}>{text.slice(last, m.index)}</Fragment>);
    }
    const tok = m[0];
    if (tok.startsWith("`") && tok.endsWith("`")) {
      out.push(
        <code
          key={nextKey("c")}
          style={{
            background: "var(--textora-bg-muted)",
            padding: "0 4px",
            borderRadius: 4,
            fontFamily: "ui-monospace, Menlo, Consolas, monospace",
            fontSize: "0.92em",
          }}
        >
          {tok.slice(1, -1)}
        </code>
      );
    } else if (tok.startsWith("**")) {
      out.push(<strong key={nextKey("b")}>{tok.slice(2, -2)}</strong>);
    } else if (tok.startsWith("*")) {
      out.push(<em key={nextKey("i")}>{tok.slice(1, -1)}</em>);
    } else {
      // 链接 [text](url)：仅展示文本，不渲染可点击外链（避免诱导跳转/信息泄露）
      const inner = /\[([^\]]+)\]\(([^)]+)\)/.exec(tok);
      out.push(<Fragment key={nextKey("l")}>{inner ? inner[1] : tok}</Fragment>);
    }
    last = m.index + tok.length;
  }
  if (last < text.length) {
    out.push(<Fragment key={nextKey("t")}>{text.slice(last)}</Fragment>);
  }
  return out;
}

/** 把整段消息渲染为 JSX：先按围栏拆代码块，再逐段做行内解析 */
export function AiMarkdown({ text }: { text: string }) {
  const parts: ReactNode[] = [];
  const fenceRe = /```([\w-]*)\n?([\s\S]*?)```/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let seg = 0;
  while ((m = fenceRe.exec(text)) !== null) {
    if (m.index > last) {
      const body = text.slice(last, m.index);
      parts.push(<div key={`s${seg++}`} style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{renderInline(body, `m${seg}`)}</div>);
    }
    const code = m[2].replace(/\n$/, "");
    parts.push(
      <pre
        key={`c${seg++}`}
        style={{
          background: "var(--textora-bg-muted)",
          border: "1px solid var(--textora-border)",
          borderRadius: 8,
          padding: "10px 12px",
          overflowX: "auto",
          fontSize: 12,
          lineHeight: 1.5,
          fontFamily: "ui-monospace, Menlo, Consolas, monospace",
          whiteSpace: "pre",
          margin: "4px 0",
        }}
      >
        {code}
      </pre>
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) {
    const body = text.slice(last);
    parts.push(<div key={`s${seg++}`} style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{renderInline(body, `m${seg}`)}</div>);
  }
  return <>{parts}</>;
}
