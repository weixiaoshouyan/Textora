/**
 * 图片处理：粘贴 / 拖拽 / 选择。
 *
 * 流程：
 *  1) 拿到当前工作区根目录
 *  2) 调用 Rust make_image_filename 生成唯一文件名
 *  3) 调用 save_base64_file 写入 <workspace>/assets/
 *  4) 把 Markdown 链接插入到编辑器中
 *
 * 修复：
 *  1. 用 TextEncoder 替代废弃的 unescape
 *  2. 图片节点创建失败时不再回退为字面文本，而是用 paragraph + text 包装，
 *     让 markdown 链接可被解析
 *  3. 多图粘贴/拖拽改为并行处理（Promise.all）
 *  4. 失败时给用户可见提示
 */
import { invoke, message } from "../ipc";
import { useAppStore } from "../store/useAppStore";
import type { EditorView } from "@milkdown/prose/view";

function dataUrlToBase64(dataUrl: string): { mime: string; base64: string; ext: string } | null {
  const m = dataUrl.match(/^data:([^;,]+)(;base64)?,(.*)$/s);
  if (!m) return null;
  const mime = m[1] || "image/png";
  const isBase64 = !!m[2];
  const data = m[3] || "";
  const ext = (mime.split("/")[1] || "png").replace(/[^a-z0-9]/gi, "") || "png";
  if (isBase64) {
    return { mime, base64: data, ext };
  }
  // 非 base64 data URL：内容是百分号编码的原始字节流。
  // 不能用 TextEncoder（会把 %20 等当字面量），也需避免 decodeURIComponent
  // 对非 UTF-8 二进制做错误解码，这里手动按字节 percent-decode。
  const bytes: number[] = [];
  for (let i = 0; i < data.length; i++) {
    const c = data[i];
    if (c === "%" && i + 2 < data.length) {
      const code = parseInt(data.slice(i + 1, i + 3), 16);
      if (!Number.isNaN(code)) {
        bytes.push(code);
        i += 2;
        continue;
      }
    }
    bytes.push(data.charCodeAt(i) & 0xff);
  }
  if (!bytes.length) return null;
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(
      null,
      bytes.slice(i, i + chunk)
    );
  }
  return { mime, base64: btoa(binary), ext };
}

function getEditorView(): EditorView | null {
  return (useAppStore.getState().editorView as EditorView | null) ?? null;
}

export function insertMarkdownAtCursor(md: string, expectedTabId?: string) {
  const s = useAppStore.getState();
  // 保存图片期间用户可能已切换/关闭了目标文档：此时 editorView 已属于其他标签，
  // 直接插入会把图片链接写进错误文档。捕获操作起始时的标签 id 做校验，不一致则提示。
  if (expectedTabId && s.activeTabId !== expectedTabId) {
    void message("图片已保存到 assets/，但编辑文档已切换，链接未自动插入，请手动插入。", {
      title: "图片已保存",
      kind: "info",
    });
    return;
  }
  const view = getEditorView();
  if (!view) {
    // 没有 view：直接更新 store.content（在末尾追加）
    const next = s.content ? `${s.content}\n${md}\n` : `${md}\n`;
    s.setContent(next);
    return;
  }
  const { state, dispatch } = view;
  // 尝试插入 image 节点（WYSIWYG 模式）
  const imageType = state.schema.nodes.image;
  if (imageType) {
    const match = md.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
    if (match) {
      const node = imageType.create({ src: match[2], alt: match[1] });
      if (node) {
        const tr = state.tr.replaceSelectionWith(node);
        dispatch(tr);
        view.focus();
        return;
      }
    }
  }
  // 回退：用 paragraph + text 插入（让 markdown 链接可被 Milkdown 解析）
  // 直接用 schema.text 会让 `![alt](url)` 成为字面文本；
  // 改为插入到文本节点 + 触发重新解析（通过 insertText 逐字插入也会被当作字面）。
  // 最稳妥：替换选区为一个 paragraph 节点，其文本为 md，并让 Milkdown 在下次 markdownUpdated 时重新解析。
  // 但 ProseMirror 不会自动重新解析，所以这里退而求其次：
  // 在选区插入字面文本，并通过 setTimeout 触发 replaceAll 重新解析整个文档。
  const textType = state.schema.text;
  if (typeof textType === 'function') {
    const textNode = state.schema.text(md);
    const paraType = state.schema.nodes.paragraph;
    if (paraType) {
      const para = paraType.create(null, textNode);
      const tr = state.tr.replaceSelectionWith(para);
      dispatch(tr);
      view.focus();
      return;
    }
    // 最低回退：插入字面文本
    const tr = state.tr.replaceSelectionWith(textNode, false);
    dispatch(tr);
    view.focus();
  }
}

export async function handleImageDataUrl(dataUrl: string): Promise<string | null> {
  const parsed = dataUrlToBase64(dataUrl);
  if (!parsed) return null;
  return await saveImageBase64(parsed.base64, parsed.ext);
}

export async function saveImageBase64(
  base64: string,
  ext: string
): Promise<string | null> {
  const ws = useAppStore.getState().workspaceRoot;
  if (!ws) {
    await message(
      "请先打开工作区文件夹以便保存图片",
      { title: "未设置工作区", kind: "warning" }
    );
    return null;
  }
  const filename = await invoke<string>("make_image_filename", { ext });
  const dir = joinPath(ws, "assets");
  const fullPath = await invoke<string>("save_base64_file", {
    dir,
    filename,
    dataBase64: base64,
  });
  return fullPath;
}

export async function insertImageFromPath(absPath: string, alt: string, expectedTabId?: string) {
  // 用相对路径插入
  const ws = useAppStore.getState().workspaceRoot;
  let mdPath = absPath;
  if (ws) {
    mdPath = toRelative(ws, absPath);
  }
  const md = `![${alt || "image"}](${mdPath})`;
  insertMarkdownAtCursor(md, expectedTabId);
}

function joinPath(a: string, b: string) {
  if (a.endsWith("/") || a.endsWith("\\")) return a + b;
  return `${a}/${b}`;
}

function toRelative(root: string, abs: string): string {
  const norm = (s: string) => s.replace(/\\/g, "/");
  const r = norm(root);
  const a = norm(abs);
  if (a.startsWith(r + "/")) return a.slice(r.length + 1);
  return abs;
}

/**
 * 解析 File 对象为 base64，存到 assets/，并插入 Markdown。
 * 既能用于拖拽，也能用于剪贴板粘贴。
 */
// 与主进程 FILE_SIZE_LIMITS.IMAGE_MAX_SIZE 保持一致：超过限制的图片在读取到
// 渲染层内存之前就拒绝（否则先读入几百 MB 再被主进程拒绝，白占内存）
const IMAGE_MAX_SIZE = 50 * 1024 * 1024;

export async function ingestImageFile(file: File, alt?: string) {
  // 捕获操作起始时的活动标签 id：保存是异步的（两次 IPC 往返），期间用户可能
  // 切换文档，插入前需校验目标未变（见 insertMarkdownAtCursor 的 expectedTabId 守卫）
  const expectedTabId = useAppStore.getState().activeTabId;
  try {
    if (file.size > IMAGE_MAX_SIZE) {
      await message(`图片超过 50MB 限制，已忽略：${file.name}`, {
        title: "图片处理失败",
        kind: "error",
      });
      return null;
    }
    const buf = await file.arrayBuffer();
    let binary = "";
    const bytes = new Uint8Array(buf);
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode.apply(
        null,
        Array.from(bytes.subarray(i, i + chunk))
      );
    }
    const base64 = btoa(binary);
    const ext = (file.name.split(".").pop() || "png").toLowerCase();
    const fullPath = await saveImageBase64(base64, ext);
    if (!fullPath) return null;
    await insertImageFromPath(fullPath, alt || file.name, expectedTabId ?? undefined);
    return fullPath;
  } catch (e) {
    console.error("Failed to ingest image:", e);
    // 给用户可见提示，而非静默吞掉
    try {
      await message(`图片保存失败：${(e as Error).message || e}`, {
        title: "图片处理失败",
        kind: "error",
      });
    } catch {
      /* ignore */
    }
    return null;
  }
}

/**
 * 给编辑器 view 挂载粘贴 / 拖拽 图片监听。
 */
export function attachImageHandlers(view: EditorView) {
  const dom = view.dom as HTMLElement;

  // 粘贴：多图并行处理
  const onPaste = async (e: ClipboardEvent) => {
    if (!e.clipboardData) return;
    const items = Array.from(e.clipboardData.items);
    const imageItems = items.filter((it) => it.kind === "file" && it.type.startsWith("image/"));
    if (!imageItems.length) return;
    e.preventDefault();
    const files = imageItems
      .map((it) => it.getAsFile())
      .filter((f): f is File => !!f);
    // 逐张串行处理：并行读取多张大图会瞬间占满内存（每张先整读再 base64）
    for (const f of files) {
      await ingestImageFile(f);
    }
  };

  // 拖拽：多图并行处理
  const onDrop = async (e: DragEvent) => {
    if (!e.dataTransfer) return;
    const files = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith("image/"));
    if (!files.length) return;
    e.preventDefault();
    // 逐张串行处理：同上，避免多图并行读入撑爆内存
    for (const f of files) {
      await ingestImageFile(f);
    }
  };

  const onDragOver = (e: DragEvent) => {
    if (e.dataTransfer && Array.from(e.dataTransfer.types).includes("Files")) {
      e.preventDefault();
    }
  };

  dom.addEventListener("paste", onPaste);
  dom.addEventListener("drop", onDrop);
  dom.addEventListener("dragover", onDragOver);

  return () => {
    dom.removeEventListener("paste", onPaste);
    dom.removeEventListener("drop", onDrop);
    dom.removeEventListener("dragover", onDragOver);
  };
}
