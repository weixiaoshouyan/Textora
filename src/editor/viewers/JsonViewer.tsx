/**
 * JSON 树形查看器（只读）。
 * 纯 JSX 渲染（无 dangerouslySetInnerHTML），节点展开/折叠、类型着色、
 * 大文件节点数上限保护、解析失败提示。
 */
import { useMemo, useState } from "react";

export interface JsonNode {
  key: string;
  path: string;
  type: "object" | "array" | "string" | "number" | "boolean" | "null";
  value: string;
  childCount: number;
  depth: number;
}

/** 遍历 JSON 为扁平节点列表（深度优先，超上限截断并置 truncated） */
export function buildJsonNodes(
  root: unknown,
  limit = 3000,
): { nodes: JsonNode[]; truncated: boolean } {
  const nodes: JsonNode[] = [];
  let count = 0;
  let truncated = false;

  const push = (node: JsonNode) => {
    if (count >= limit) {
      truncated = true;
      return;
    }
    count++;
    nodes.push(node);
  };

  const typeOf = (v: unknown): JsonNode["type"] => {
    if (v === null) return "null";
    if (Array.isArray(v)) return "array";
    if (typeof v === "object") return "object";
    if (typeof v === "number") return "number";
    if (typeof v === "boolean") return "boolean";
    return "string";
  };

  const fmt = (v: unknown, t: JsonNode["type"]): string => {
    if (t === "string") return JSON.stringify(v);
    return String(v);
  };

  const walk = (v: unknown, key: string, path: string, depth: number) => {
    const t = typeOf(v);
    if (t === "object" || t === "array") {
      const entries = t === "array"
        ? (v as unknown[]).map((item, i) => [String(i), item] as const)
        : Object.entries(v as Record<string, unknown>);
      push({
        key: key || (t === "array" ? "[]" : "{}"),
        path,
        type: t,
        value: t === "array" ? `Array(${entries.length})` : `{${entries.length} 项}`,
        childCount: entries.length,
        depth,
      });
      for (const [k, item] of entries) {
        walk(item, k, `${path}.${k}`, depth + 1);
      }
    } else {
      push({ key, path, type: t, value: fmt(v, t), childCount: 0, depth });
    }
  };

  walk(root, "", "root", 0);
  return { nodes, truncated };
}

function typeColor(type: JsonNode["type"]): string {
  switch (type) {
    case "string": return "#ce9178";
    case "number": return "#b5cea8";
    case "boolean": return "#569cd6";
    case "null": return "#808080";
    default: return "var(--textora-fg)";
  }
}

export function JsonViewer({ text, name }: { text: string; name: string }) {
  const { nodes, truncated, error } = useMemo(() => {
    try {
      const parsed = JSON.parse(text);
      const { nodes: list, truncated: t } = buildJsonNodes(parsed);
      return { nodes: list, truncated: t, error: null as string | null };
    } catch (e) {
      return { nodes: [], truncated: false, error: (e as Error).message };
    }
  }, [text]);

  // 折叠状态：key = 节点 path；默认只展开前两层（depth < 2 的容器节点）
  const [collapsed, setCollapsed] = useState<Set<string>>(() => {
    const set = new Set<string>();
    for (const n of nodes) {
      if (n.childCount > 0 && n.depth >= 2) set.add(n.path);
    }
    return set;
  });

  const toggle = (path: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const expandAll = () => setCollapsed(new Set());
  const collapseAll = () => {
    const set = new Set<string>();
    for (const n of nodes) {
      if (n.childCount > 0 && n.depth >= 1) set.add(n.path);
    }
    setCollapsed(set);
  };

  if (error) {
    return (
      <div style={{ padding: 24, fontSize: 13, color: "#d4380d" }}>
        <div style={{ fontWeight: 600, marginBottom: 6 }}>JSON 解析失败</div>
        <pre style={{ whiteSpace: "pre-wrap", color: "var(--textora-fg-muted)" }}>{error}</pre>
      </div>
    );
  }

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
        <span>{nodes.length} 节点</span>
        <button className="textora-btn" style={{ fontSize: 11, padding: "1px 8px" }} onClick={expandAll}>
          全部展开
        </button>
        <button className="textora-btn" style={{ fontSize: 11, padding: "1px 8px" }} onClick={collapseAll}>
          全部折叠
        </button>
        {truncated && <span style={{ color: "var(--textora-accent)" }}>节点数过多，仅显示前 3000 个</span>}
      </div>
      <div style={{ flex: 1, overflow: "auto", padding: "8px 0" }}>
        {nodes.map((n) => {
          const isCollapsed = collapsed.has(n.path);
          return (
            <div
              key={n.path}
              style={{
                paddingLeft: 12 + n.depth * 18,
                paddingRight: 12,
                lineHeight: 1.7,
                fontSize: 13,
                whiteSpace: "nowrap",
                display: n.depth > 0 && collapsed.has(parentPath(n.path)) ? "none" : undefined,
              }}
            >
              {n.childCount > 0 && (
                <button
                  className="textora-btn"
                  style={{
                    fontSize: 10,
                    padding: "0 4px",
                    marginRight: 4,
                    lineHeight: 1.4,
                    border: "none",
                    background: "transparent",
                    color: "var(--textora-fg-muted)",
                    cursor: "pointer",
                  }}
                  onClick={() => toggle(n.path)}
                  title={isCollapsed ? "展开" : "折叠"}
                >
                  {isCollapsed ? "▶" : "▼"}
                </button>
              )}
              {n.key !== "" && (
                <span style={{ color: "#9cdcfe", marginRight: 6 }}>{JSON.stringify(n.key)}:</span>
              )}
              <span style={{ color: typeColor(n.type) }}>{n.value}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function parentPath(path: string): string {
  const idx = path.lastIndexOf(".");
  return idx > 0 ? path.slice(0, idx) : "";
}
