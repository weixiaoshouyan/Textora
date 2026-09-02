/**
 * 多格式查看器路由：根据文件扩展名选择查看器。
 */
export * from "./CsvViewer";
export * from "./JsonViewer";
export * from "./PdfViewer";

/** 从路径取小写扩展名（不含点） */
export function extOf(path: string | null | undefined): string {
  if (!path) return "";
  const name = path.split(/[\\/]/).pop() || "";
  const dot = name.lastIndexOf(".");
  if (dot <= 0 || dot === name.length - 1) return "";
  return name.slice(dot + 1).toLowerCase();
}

/** 该扩展名是否使用专用查看器（CSV/JSON/PDF） */
export function hasSpecialViewer(path: string | null | undefined): boolean {
  const ext = extOf(path);
  return (
    ext === "csv" ||
    ext === "tsv" ||
    ext === "json" ||
    ext === "jsonc" ||
    ext === "json5" ||
    ext === "pdf"
  );
}
