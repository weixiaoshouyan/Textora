import { useEffect } from "react";
import { listen, message, openDialog, getAppVersion } from "../ipc";
import { useAppStore } from "../store/useAppStore";
import { exportAsPDF, exportAsHTML, exportAsDOCX } from "../editor/exporter";
import { useLocale, tFor } from "../i18n";

/**
 * 监听 Electron 原生菜单事件，复用前端 store 中的动作。
 *
 * 事件通道说明：主进程通过
 *   mainWindow.webContents.send('textora:menu', <id>)
 * 派发菜单命令；preload 的 window.textora.on 会自动加 'textora:' 前缀，
 * 因此这里监听的频道名是 "menu"（→ 'textora:menu'），无需改动。
 * 主进程下发的 id 为 file:* / edit:* / help:*，下方 switch 与之对齐。
 */
export function useTauriMenu() {
  useEffect(() => {
    const un = listen("menu", async (e) => {
      const id = e.payload as string;
      const s = useAppStore.getState();
      switch (id) {
        case "file:new":
          s.newFile();
          break;
        case "file:open":
          await s.openFile();
          break;
        case "file:open-folder":
          // 打开文件夹对话框 → 设为工作区
          {
            const dir = await openDialog({ directory: true, multiple: false });
            if (typeof dir === "string") await s.openWorkspace(dir);
          }
          break;
        case "file:save":
          await s.saveFile();
          break;
        case "file:save-as":
          await s.saveFileAs();
          break;
        case "edit:find":
        case "edit:replace":
          // 查找与替换共用同一面板
          s.setFindReplaceOpen(true);
          break;
        case "help:about":
          {
            const v = await getAppVersion().catch(() => "0.2.0");
            await message(`Textora ${v}\nA clean WYSIWYG Markdown editor.`, {
              title: "About Textora",
            });
          }
          break;
        // 导出入口：顶栏下拉已可触发，这里一并保留以便原生菜单未来扩展
        case "menu.export_pdf":
          await runExport(exportAsPDF);
          break;
        case "menu.export_html":
          await runExport(exportAsHTML);
          break;
        case "menu.export_docx":
          await runExport(exportAsDOCX);
          break;
        default:
          break;
      }
    });
    return () => {
      void un.then((fn) => fn());
    };
  }, []);
}

/**
 * 运行导出动作，失败时弹出原生错误对话框（而非静默吞掉异常）。
 */
async function runExport(fn: () => Promise<void>) {
  try {
    await fn();
  } catch (err) {
    const t = tFor(useLocale.getState().locale);
    const msg = err instanceof Error ? err.message : String(err);
    await message(`${t("export.failed")}: ${msg}`, { title: t("export.failed") });
  }
}
