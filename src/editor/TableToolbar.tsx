import { useState, useEffect, useRef } from "react";
import type { EditorView } from "@milkdown/prose/view";
import { addRowBefore, addRowAfter, deleteRow, addColumnBefore, addColumnAfter, deleteColumn, deleteTable } from "@milkdown/prose/tables";
import { useLocale } from "../i18n";

interface Props {
  view: EditorView | null;
}

export function TableToolbar({ view }: Props) {
  const [visible, setVisible] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const locale = useLocale((s) => s.locale);
  const isZh = locale === "zh";
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!view) return;

    const updateToolbar = () => {
      const { state } = view;
      const { selection } = state;
      const { $from } = selection;

      // 检查当前选区是否在 table 内
      let tableNodePos = -1;
      let tableDom: HTMLElement | null = null;

      for (let d = $from.depth; d > 0; d--) {
        const node = $from.node(d);
        if (node.type.name === "table") {
          tableNodePos = $from.before(d);
          tableDom = view.nodeDOM(tableNodePos) as HTMLElement;
          break;
        }
      }

      if (tableDom && tableNodePos !== -1) {
        const rect = tableDom.getBoundingClientRect();
        const editorRect = view.dom.getBoundingClientRect();

        // 将工具条定位在表格顶部居中
        setPos({
          top: Math.max(10, rect.top - editorRect.top - 36),
          left: Math.max(10, rect.left - editorRect.left + (rect.width / 2) - 150),
        });
        setVisible(true);
      } else {
        setVisible(false);
      }
    };

    // 每次选区或文档更新时检查
    updateToolbar();
    const handleSelectionChange = () => updateToolbar();
    view.dom.addEventListener("keyup", handleSelectionChange);
    view.dom.addEventListener("mouseup", handleSelectionChange);

    return () => {
      view.dom.removeEventListener("keyup", handleSelectionChange);
      view.dom.removeEventListener("mouseup", handleSelectionChange);
    };
  }, [view]);

  if (!visible || !view) return null;

  const runCmd = (cmd: (state: any, dispatch?: any) => boolean) => {
    cmd(view.state, view.dispatch);
    view.focus();
  };

  return (
    <div
      ref={ref}
      className="absolute z-40 flex items-center gap-1 p-1 textora-card textora-glass animate-pop-in rounded-lg shadow-xl border text-[11px] select-none"
      style={{
        top: pos.top,
        left: pos.left,
        borderColor: "var(--textora-border-glass)",
      }}
    >
      <div className="px-1 text-[10px] font-semibold text-blue-500 border-r pr-1.5" style={{ borderColor: "var(--textora-border)" }}>
        📊 {isZh ? "表格" : "Table"}
      </div>

      {/* Row Operations */}
      <button
        onClick={() => runCmd(addRowBefore)}
        title={isZh ? "在上方插入行" : "Insert row above"}
        className="px-1.5 py-0.5 rounded hover:bg-black/10 dark:hover:bg-white/10"
        style={{ color: "var(--textora-fg)" }}
      >
        ⬆️ {isZh ? "+行" : "+Row"}
      </button>
      <button
        onClick={() => runCmd(addRowAfter)}
        title={isZh ? "在下方插入行" : "Insert row below"}
        className="px-1.5 py-0.5 rounded hover:bg-black/10 dark:hover:bg-white/10"
        style={{ color: "var(--textora-fg)" }}
      >
        ⬇️ {isZh ? "+行" : "+Row"}
      </button>
      <button
        onClick={() => runCmd(deleteRow)}
        title={isZh ? "删除整行" : "Delete row"}
        className="px-1.5 py-0.5 rounded hover:bg-red-500/20 text-red-500"
      >
        ❌ {isZh ? "删行" : "-Row"}
      </button>

      <span className="w-[1px] h-3 bg-gray-400/30 mx-0.5" />

      {/* Column Operations */}
      <button
        onClick={() => runCmd(addColumnBefore)}
        title={isZh ? "在左侧插入列" : "Insert column left"}
        className="px-1.5 py-0.5 rounded hover:bg-black/10 dark:hover:bg-white/10"
        style={{ color: "var(--textora-fg)" }}
      >
        ⬅️ {isZh ? "+列" : "+Col"}
      </button>
      <button
        onClick={() => runCmd(addColumnAfter)}
        title={isZh ? "在右侧插入列" : "Insert column right"}
        className="px-1.5 py-0.5 rounded hover:bg-black/10 dark:hover:bg-white/10"
        style={{ color: "var(--textora-fg)" }}
      >
        ➡️ {isZh ? "+列" : "+Col"}
      </button>
      <button
        onClick={() => runCmd(deleteColumn)}
        title={isZh ? "删除整列" : "Delete column"}
        className="px-1.5 py-0.5 rounded hover:bg-red-500/20 text-red-500"
      >
        ❌ {isZh ? "删列" : "-Col"}
      </button>

      <span className="w-[1px] h-3 bg-gray-400/30 mx-0.5" />

      {/* Delete Table */}
      <button
        onClick={() => runCmd(deleteTable)}
        title={isZh ? "删除整个表格" : "Delete entire table"}
        className="px-1.5 py-0.5 rounded hover:bg-red-600 text-white bg-red-500/80 font-medium"
      >
        🗑️ {isZh ? "删表" : "Table"}
      </button>
    </div>
  );
}
