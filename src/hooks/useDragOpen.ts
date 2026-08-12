import { useEffect } from "react";
import { useAppStore } from "../store/useAppStore";
import { invoke } from "../ipc";

/**
 * 全局拖拽打开：
 *  - 拖拽 .md/.markdown/.mdx 文件到窗口任意位置 → 打开该文件
 *  - 拖拽文件夹 → 作为工作区打开
 *  - 图片拖拽到编辑器由 imageHandler 处理，这里只在编辑器外接管
 *
 * 修复：
 *  1. 多文件拖拽：遍历所有文件，逐个打开
 *  2. 文件/目录判断：用 Tauri 后端 list_dir/stat 判断，而非"有无扩展名"
 *     （Makefile/Dockerfile/LICENSE 等无扩展名文件不应被误判为目录）
 *  3. 编辑器内拖拽只在图片类型时放行给 imageHandler，其他文件类型由全局打开
 */
export function useDragOpen() {
  useEffect(() => {
    const onDragOver = (e: DragEvent) => {
      // 阻止默认行为才能触发 drop
      if (e.dataTransfer && Array.from(e.dataTransfer.types).includes("Files")) {
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
      }
    };

    const isDirectory = async (path: string): Promise<boolean> => {
      // 用专门的 is_directory IPC 明确判断，避免依赖 list_dir 的副作用
      // （list_dir 对文件路径返回空数组而非抛错，导致误判为目录）
      try {
        return await invoke<boolean>("is_directory", { path });
      } catch {
        return false;
      }
    };

    const onDrop = async (e: DragEvent) => {
      if (!e.dataTransfer) return;
      // 如果事件来自编辑器（ProseMirror）且拖入的是图片，让 imageHandler 处理
      const target = e.target as HTMLElement | null;
      const inEditor = !!target?.closest(".milkdown .ProseMirror");
      const files = Array.from(e.dataTransfer.files);
      if (!files.length) return;

      // 编辑器内：仅当全部为图片时放行给 imageHandler
      if (inEditor) {
        const allImages = files.every((f) => f.type.startsWith("image/"));
        if (allImages) return;
      }

      e.preventDefault();
      const s = useAppStore.getState();

      // 逐个处理拖入项
      for (const file of files) {
        // Electron 30+ 移除了 File.path，必须通过 preload 暴露的 webUtils.getPathForFile 取路径
        const path = window.textora?.getPathForFile(file);
        if (!path) continue;

        const dir = await isDirectory(path);
        if (dir) {
          // 文件夹 → 作为工作区打开（仅第一个文件夹）
          await s.openWorkspace(path);
          return;
        }
        // 文件 → 打开
        const ok = await s.checkBeforeOpen(path);
        if (ok) await s.openPath(path);
      }
    };

    window.addEventListener("dragover", onDragOver);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("drop", onDrop);
    };
  }, []);
}
