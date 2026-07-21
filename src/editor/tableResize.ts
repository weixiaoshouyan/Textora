/**
 * 表格列宽拖拽调整：在 Milkdown 表格中拖拽列边界调整列宽。
 *
 * 实现：
 *  - 监听编辑器 DOM 的 mousemove，检测鼠标是否在 th/td 右边沿 5px 范围内
 *  - 命中时显示 col-resize 光标
 *  - mousedown 记录起始位置、列索引和表格元素
 *  - mousemove 拖拽时实时更新该列所有单元格的 style.width
 *  - mouseup 结束拖拽
 *
 * 注意：GFM 表格节点不支持列宽属性，因此通过修改 th/td 的 style.width 实现，
 * 不修改 ProseMirror 节点。列宽仅存在于 DOM 层，不会持久化到 Markdown 源码。
 */
const EDGE_THRESHOLD = 5; // 右边沿命中阈值（px）
const MIN_COL_WIDTH = 20; // 最小列宽（px）

interface DragState {
  table: HTMLTableElement;
  colIndex: number;
  startX: number;
  startWidth: number;
}

export function attachTableResize(view: any): () => void {
  if (!view) return () => {};
  const dom = view.dom as HTMLElement;

  let dragState: DragState | null = null;
  let hoverCell: HTMLElement | null = null;

  /** 检测鼠标是否在某个 th/td 的右边沿命中范围内 */
  function findResizeTarget(e: MouseEvent): HTMLElement | null {
    const target = e.target as HTMLElement | null;
    if (!target) return null;
    // target 可能是单元格内的子元素（如段落），向上查找最近的 th/td
    const cell = target.closest("th, td") as HTMLElement | null;
    if (!cell) return null;
    const rect = cell.getBoundingClientRect();
    const delta = e.clientX - rect.right;
    if (delta >= -EDGE_THRESHOLD && delta <= EDGE_THRESHOLD) {
      return cell;
    }
    return null;
  }

  /** 设置表格中指定列所有单元格的宽度 */
  function setColumnWidth(
    table: HTMLTableElement,
    colIndex: number,
    width: number
  ) {
    const w = Math.max(MIN_COL_WIDTH, width);
    for (let i = 0; i < table.rows.length; i++) {
      const cell = table.rows[i].cells[colIndex];
      if (cell) cell.style.width = `${w}px`;
    }
  }

  function onDomMouseMove(e: MouseEvent) {
    if (dragState) return; // 拖拽中由 window 监听处理
    const hit = findResizeTarget(e);
    if (hit) {
      hoverCell = hit;
      dom.style.cursor = "col-resize";
    } else {
      hoverCell = null;
      if (dom.style.cursor === "col-resize") {
        dom.style.cursor = "";
      }
    }
  }

  function onWindowMouseMove(e: MouseEvent) {
    if (!dragState) return;
    e.preventDefault();
    const delta = e.clientX - dragState.startX;
    setColumnWidth(
      dragState.table,
      dragState.colIndex,
      dragState.startWidth + delta
    );
  }

  function onMouseDown(e: MouseEvent) {
    if (!hoverCell) return;
    const cell = hoverCell;
    const table = cell.closest("table") as HTMLTableElement | null;
    if (!table) return;
    // 标记表格为已调整，CSS 会启用 table-layout: fixed 让列宽严格生效
    table.classList.add("textora-table-resized");
    dragState = {
      table,
      colIndex: (cell as any).cellIndex,
      startX: e.clientX,
      startWidth: cell.getBoundingClientRect().width,
    };
    e.preventDefault();
    // 拖拽期间禁止文本选区
    document.body.style.userSelect = "none";
  }

  function onMouseUp() {
    if (dragState) {
      dragState = null;
      document.body.style.userSelect = "";
    }
  }

  dom.addEventListener("mousemove", onDomMouseMove);
  dom.addEventListener("mousedown", onMouseDown);
  // mousemove/mouseup 监听 window，使鼠标移出编辑器区域也能继续拖拽/结束
  window.addEventListener("mousemove", onWindowMouseMove);
  window.addEventListener("mouseup", onMouseUp);

  return () => {
    dom.removeEventListener("mousemove", onDomMouseMove);
    dom.removeEventListener("mousedown", onMouseDown);
    window.removeEventListener("mousemove", onWindowMouseMove);
    window.removeEventListener("mouseup", onMouseUp);
    if (dom.style.cursor === "col-resize") {
      dom.style.cursor = "";
    }
    document.body.style.userSelect = "";
    dragState = null;
    hoverCell = null;
  };
}
