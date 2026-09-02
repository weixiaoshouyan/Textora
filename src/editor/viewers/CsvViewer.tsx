/**
 * CSV / TSV 表格查看器。
 * 只读预览：自动探测分隔符、处理带引号字段与字段内换行、首行表头、大文件截断。
 */
import { useMemo } from "react";

// ---- 纯解析逻辑（可单测） ----

export function detectDelimiter(text: string): string {
  const firstLine = (text.split(/\r?\n/, 1)[0] ?? "").trim();
  if (!firstLine) return ",";
  const candidates = [",", "\t", ";", "|"];
  let best = ",";
  let bestCount = -1;
  for (const d of candidates) {
    const count = firstLine.split(d).length - 1;
    if (count > bestCount) {
      bestCount = count;
      best = d;
    }
  }
  return bestCount > 0 ? best : ",";
}

/**
 * 解析 CSV/TSV：支持引号包裹字段、字段内换行、"" 转义、CRLF。
 * 末尾无换行符时也返回最后一行。
 */
export function parseCsv(text: string, delimiter?: string): string[][] {
  const d = delimiter ?? detectDelimiter(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  const n = text.length;
  for (let i = 0; i < n; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < n && text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
    } else if (ch === d) {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (ch === "\r") {
      // CR 由后续 \n 结束；单独出现的 \r 也按换行处理
      if (i + 1 < n && text[i + 1] === "\n") continue;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += ch;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

// ---- React 组件 ----

const MAX_RENDER_ROWS = 500;

export function CsvViewer({ text, name }: { text: string; name: string }) {
  const parsed = useMemo(() => {
    const rows = parseCsv(text);
    // 过滤空行（全空字段），避免空白行撑乱表格
    return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
  }, [text]);

  if (parsed.length === 0) {
    return (
      <div style={{ padding: 24, color: "var(--textora-fg-muted)", fontSize: 13 }}>
        空文件
      </div>
    );
  }

  const header = parsed[0];
  const body = parsed.slice(1, MAX_RENDER_ROWS + 1);
  const truncated = parsed.length - 1 > MAX_RENDER_ROWS;
  const colCount = Math.max(...parsed.map((r) => r.length));

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <div
        style={{
          padding: "8px 16px",
          borderBottom: "1px solid var(--textora-border)",
          color: "var(--textora-fg-muted)",
          fontSize: 12,
          display: "flex",
          gap: 12,
          alignItems: "center",
        }}
      >
        <span style={{ fontWeight: 600, color: "var(--textora-fg)" }}>{name}</span>
        <span>{parsed.length - 1} 行 × {colCount} 列</span>
        {truncated && (
          <span style={{ color: "var(--textora-accent)" }}>
            仅显示前 {MAX_RENDER_ROWS} 行
          </span>
        )}
      </div>
      <div style={{ flex: 1, overflow: "auto" }}>
        <table
          style={{
            borderCollapse: "collapse",
            fontSize: 13,
            fontFamily: "ui-monospace, Menlo, Consolas, monospace",
            width: "max-content",
            minWidth: "100%",
          }}
        >
          <thead>
            <tr>
              {header.map((h, i) => (
                <th
                  key={i}
                  style={{
                    position: "sticky",
                    top: 0,
                    background: "var(--textora-bg-elev)",
                    borderBottom: "1px solid var(--textora-border)",
                    borderRight: "1px solid var(--textora-border)",
                    padding: "6px 12px",
                    textAlign: "left",
                    fontWeight: 600,
                    color: "var(--textora-fg)",
                    whiteSpace: "nowrap",
                    zIndex: 1,
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {body.map((row, ri) => (
              <tr key={ri} style={{ background: ri % 2 === 1 ? "var(--textora-bg-muted)" : "transparent" }}>
                {Array.from({ length: colCount }, (_, ci) => (
                  <td
                    key={ci}
                    style={{
                      borderBottom: "1px solid var(--textora-border)",
                      borderRight: "1px solid var(--textora-border)",
                      padding: "4px 12px",
                      color: "var(--textora-fg)",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {row[ci] ?? ""}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
