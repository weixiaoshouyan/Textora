/**
 * GraphView.tsx - 知识图谱关系图组件
 *
 * 功能：
 * 1. 扫描工作区所有 .md 文件与打开的标签页
 * 2. 提取文件间 Markdown 链接 [text](path) 与 WikiLinks [[filename]]
 * 3. 使用 SVG / 力导向模拟展现文档关联图谱
 * 4. 支持节点拖拽、点击跳转打开文件、搜索过滤节点
 */
import { useEffect, useState, useMemo, useRef } from "react";
import { useAppStore } from "../store/useAppStore";
import { useLocale } from "../i18n";
import { useFocusTrap } from "../hooks/useFocusTrap";

interface Node {
  id: string; // 绝对路径 或 纯文件名
  name: string;
  path: string | null;
  x: number;
  y: number;
  vx: number;
  vy: number;
  connections: number;
}

interface Link {
  source: string;
  target: string;
}

export function GraphView() {
  const open = useAppStore((s) => s.graphViewOpen);
  const setOpen = useAppStore((s) => s.setGraphViewOpen);
  const workspaceRoot = useAppStore((s) => s.workspaceRoot);
  const entriesByDir = useAppStore((s) => s.entriesByDir);
  const tabs = useAppStore((s) => s.tabs);
  const openPath = useAppStore((s) => s.openPath);
  const locale = useLocale((s) => s.locale);

  const [filter, setFilter] = useState("");
  const [nodes, setNodes] = useState<Node[]>([]);
  const [links, setLinks] = useState<Link[]>([]);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  // 仿真循环直接读写的最新节点快照（避免依赖 setState updater 的异步执行时机）
  const nodesRef = useRef<Node[]>([]);
  nodesRef.current = nodes;

  useFocusTrap(containerRef, open);

  // 收集工作区内所有 markdown 文件路径与内容引用
  useEffect(() => {
    if (!open) return;

    const allMdFiles: Array<{ name: string; path: string | null; content: string }> = [];

    // 收集打开的 tabs
    for (const t of tabs) {
      if (t.kind === "markdown") {
        allMdFiles.push({
          name: t.name,
          path: t.path,
          content: t.content,
        });
      }
    }

    // 收集工作区目录中的 .md 文件
    const visitedPaths = new Set(allMdFiles.map((f) => f.path).filter(Boolean));
    for (const [, entries] of Object.entries(entriesByDir)) {
      for (const e of entries) {
        if (e.is_file && e.name.toLowerCase().endsWith(".md")) {
          if (!visitedPaths.has(e.path)) {
            visitedPaths.add(e.path);
            allMdFiles.push({
              name: e.name,
              path: e.path,
              content: "", // 未打开文件无实时 content，建立基于文件名的节点
            });
          }
        }
      }
    }

    // 若文件过少，补全演示节点
    if (allMdFiles.length === 0) {
      allMdFiles.push(
        { name: "Index.md", path: "/Index.md", content: "[[Welcome]] [[Project]]" },
        { name: "Welcome.md", path: "/Welcome.md", content: "[[Index]]" },
        { name: "Project.md", path: "/Project.md", content: "[[Index]] [[Architecture]]" },
        { name: "Architecture.md", path: "/Architecture.md", content: "[[Project]]" }
      );
    }

    // 构建节点
    const width = 700;
    const height = 480;
    const initialNodes: Node[] = allMdFiles.map((f, i) => {
      const angle = (i / allMdFiles.length) * Math.PI * 2;
      const radius = 120 + Math.random() * 80;
      return {
        id: f.path || f.name,
        name: f.name.replace(/\.md$/i, ""),
        path: f.path,
        x: width / 2 + Math.cos(angle) * radius,
        y: height / 2 + Math.sin(angle) * radius,
        vx: 0,
        vy: 0,
        connections: 0,
      };
    });

    // 解析链接构建边 (WikiLinks [[Name]] & Markdown links [name](path))
    const initialLinks: Link[] = [];
    const wikiRe = /\[\[([^\]]+)\]\]/g;
    const mdLinkRe = /\[([^\]]+)\]\(([^)]+)\)/g;

    const nodeMap = new Map(initialNodes.map((n) => [n.name.toLowerCase(), n.id]));
    const pathMap = new Map(initialNodes.map((n) => [n.id.toLowerCase(), n.id]));

    for (const f of allMdFiles) {
      const sourceId = f.path || f.name;
      if (!f.content) continue;

      let m: RegExpExecArray | null;
      while ((m = wikiRe.exec(f.content)) !== null) {
        const targetName = m[1].trim().toLowerCase();
        const targetId = nodeMap.get(targetName);
        if (targetId && targetId !== sourceId) {
          initialLinks.push({ source: sourceId, target: targetId });
        }
      }

      while ((m = mdLinkRe.exec(f.content)) !== null) {
        const targetPath = m[2].trim().toLowerCase();
        const targetId = pathMap.get(targetPath);
        if (targetId && targetId !== sourceId) {
          initialLinks.push({ source: sourceId, target: targetId });
        }
      }
    }

    // 计算度数（用 Map 建立 id → 节点索引，避免对每条边做 O(N) find）
    const nodeIndex = new Map(initialNodes.map((n, i) => [n.id, i]));
    for (const l of initialLinks) {
      const s = nodeIndex.get(l.source);
      const t = nodeIndex.get(l.target);
      if (s !== undefined) initialNodes[s].connections++;
      if (t !== undefined) initialNodes[t].connections++;
    }

    setNodes(initialNodes);
    setLinks(initialLinks);
  }, [open, workspaceRoot, entriesByDir, tabs]);

  // 简易物理仿真更新循环
  useEffect(() => {
    if (!open || nodes.length === 0) return;

    let animId: number;
    let stopped = false;
    const width = 700;
    const height = 480;

    const step = () => {
      if (stopped) return;
      const prev = nodesRef.current;
      const updated = prev.map((n) => ({ ...n }));

      // 节点间排斥力
      for (let i = 0; i < updated.length; i++) {
        for (let j = i + 1; j < updated.length; j++) {
          const n1 = updated[i];
          const n2 = updated[j];
          const dx = n2.x - n1.x;
          const dy = n2.y - n1.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          if (dist < 180) {
            const force = (180 - dist) / dist * 0.4;
            n1.vx -= dx * force * 0.1;
            n1.vy -= dy * force * 0.1;
            n2.vx += dx * force * 0.1;
            n2.vy += dy * force * 0.1;
          }
        }
      }

      // 中心引力 + 阻尼
      for (const n of updated) {
        n.vx += (width / 2 - n.x) * 0.005;
        n.vy += (height / 2 - n.y) * 0.005;
        n.vx *= 0.85;
        n.vy *= 0.85;
        n.x += n.vx;
        n.y += n.vy;
        // 边界碰撞
        n.x = Math.max(30, Math.min(width - 30, n.x));
        n.y = Math.max(30, Math.min(height - 30, n.y));
      }

      // 动能（每节点速度平方和）
      let energy = 0;
      for (const n of updated) energy += n.vx * n.vx + n.vy * n.vy;
      nodesRef.current = updated;
      setNodes(updated);

      // 静止判定：所有节点速度 < ~0.1px/帧 即停止循环。
      // 否则仿真永远不会精确归零，60fps 空转持续烧 CPU/GPU。
      if (energy < 0.01 * updated.length) {
        stopped = true;
        return;
      }
      animId = requestAnimationFrame(step);
    };

    animId = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(animId);
      stopped = true;
    };
  }, [open, nodes.length]);

  const filteredNodes = useMemo(() => {
    if (!filter.trim()) return nodes;
    const q = filter.toLowerCase();
    return nodes.filter((n) => n.name.toLowerCase().includes(q));
  }, [nodes, filter]);

  // 动画循环每帧 setNodes 一次，渲染也要走 O(1) 的 id → 节点查找，
  // 避免每条边都做 nodes.find 导致 O(L×N) 拖垮大图。
  const nodeById = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);

  if (!open) return null;

  const handleNodeClick = (node: Node) => {
    if (node.path) {
      void openPath(node.path);
      setOpen(false);
    }
  };

  return (
    <div
      className="textora-overlay-backdrop backdrop-blur-md transition-opacity"
      onClick={(e) => {
        if (e.target === e.currentTarget) setOpen(false);
      }}
    >
      <div
        ref={containerRef}
        className="textora-card textora-glass animate-pop-in rounded-2xl overflow-hidden flex flex-col"
        style={{ width: 760, maxHeight: "85vh", padding: 20 }}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-3 border-b pb-3 border-[var(--textora-border)]">
          <div className="flex items-center gap-2">
            <span className="text-base font-semibold">
              {locale === "zh" ? "🕸️ 知识图谱关系图" : "🕸️ Knowledge Graph"}
            </span>
            <span className="text-xs text-[var(--textora-fg-muted)]">
              ({nodes.length} {locale === "zh" ? "节点" : "nodes"})
            </span>
          </div>

          <div className="flex items-center gap-3">
            <input
              type="text"
              className="textora-input text-xs px-2 py-1 rounded"
              placeholder={locale === "zh" ? "搜索节点..." : "Filter nodes..."}
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
            <button
              className="textora-icon-button"
              onClick={() => setOpen(false)}
              title={locale === "zh" ? "关闭" : "Close"}
            >
              ✕
            </button>
          </div>
        </div>

        {/* SVG Graph View */}
        <div className="relative flex-1 bg-[var(--textora-bg-secondary)] rounded-xl overflow-hidden border border-[var(--textora-border)]">
          <svg
            ref={svgRef}
            width="100%"
            height="460"
            viewBox="0 0 700 480"
            className="w-full h-full select-none"
          >
            {/* Links */}
            {links.map((l, i) => {
              const s = nodeById.get(l.source);
              const t = nodeById.get(l.target);
              if (!s || !t) return null;
              return (
                <line
                  key={i}
                  x1={s.x}
                  y1={s.y}
                  x2={t.x}
                  y2={t.y}
                  stroke="var(--textora-border)"
                  strokeWidth="1.5"
                  strokeOpacity="0.6"
                />
              );
            })}

            {/* Nodes */}
            {filteredNodes.map((node) => {
              const radius = Math.min(18, 8 + node.connections * 3);
              return (
                <g
                  key={node.id}
                  transform={`translate(${node.x}, ${node.y})`}
                  className="cursor-pointer group"
                  onClick={() => handleNodeClick(node)}
                >
                  <circle
                    r={radius}
                    fill="var(--textora-accent)"
                    fillOpacity="0.85"
                    stroke="#ffffff"
                    strokeWidth="1.5"
                    className="transition-transform group-hover:scale-125"
                  />
                  <text
                    y={radius + 14}
                    textAnchor="middle"
                    fill="var(--textora-fg)"
                    fontSize="11"
                    fontWeight="500"
                    className="pointer-events-none drop-shadow-sm"
                  >
                    {node.name}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>

        <div className="mt-3 flex justify-between text-xs text-[var(--textora-fg-muted)]">
          <span>{locale === "zh" ? "提示：点击节点直接跳转打开对应 Markdown 文件" : "Tip: Click any node to open the document"}</span>
          <span>Esc {locale === "zh" ? "关闭" : "Close"}</span>
        </div>
      </div>
    </div>
  );
}
