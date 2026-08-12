/**
 * Mermaid 图表装饰器：
 *  - 识别 code_block 中 language === 'mermaid' 的节点
 *  - 用 Mermaid 渲染为 SVG，替换原始代码块
 *
 * 关键修复：
 *  1. Mermaid 改为动态 import，避免 ~2-3MB 进首屏 chunk
 *  2. renderGeneration 仅在 setMermaidTheme 时自增，
 *     不再在 apply 内自增（否则持续输入时图表永远渲染不完）
 *  3. 每个 widget 用独立的取消令牌，避免相互干扰
 */
import { Plugin, PluginKey } from "@milkdown/prose/state";
import { Decoration, DecorationSet } from "@milkdown/prose/view";
import { isLargeDoc } from "./docGuard";
import { $prose } from "@milkdown/utils";

interface PluginState {
  set: DecorationSet;
  bump: number;
}

export const mermaidKey = new PluginKey<PluginState>("textora-mermaid");

type MermaidMod = typeof import("mermaid");
let mermaidModPromise: Promise<MermaidMod> | null = null;
let mermaidInited = false;
let currentTheme: "light" | "dark" = "light";
// 仅在主题切换时自增；apply 内不自增
let renderGeneration = 0;

function loadMermaid(): Promise<MermaidMod> {
  if (!mermaidModPromise) {
    mermaidModPromise = import("mermaid");
  }
  return mermaidModPromise;
}

let initPromise: Promise<void> | null = null;

async function ensureMermaid(theme: "light" | "dark") {
  const mod = await loadMermaid();
  if (!mermaidInited || theme !== currentTheme) {
    // 串行化 initialize 调用，避免并发竞态
    if (!initPromise) {
      initPromise = (async () => {
        mod.default.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          theme: theme === "dark" ? "dark" : "default",
          fontFamily: "inherit",
        });
        mermaidInited = true;
        currentTheme = theme;
      })();
    }
    await initPromise;
    initPromise = null;
    // 如果在等待期间主题又变了，重新初始化
    if (theme !== currentTheme) {
      return ensureMermaid(theme);
    }
  }
  return mod;
}

export async function setMermaidTheme(theme: "light" | "dark") {
  // 主题切换：使所有进行中的异步渲染结果失效，并清空渲染缓存
  renderGeneration++;
  mermaidRenderCache.clear();
  await ensureMermaid(theme);
}

function findMermaidBlocks(
  doc: any
): Array<{ pos: number; to: number; code: string }> {
  const out: Array<{ pos: number; to: number; code: string }> = [];
  doc.descendants((node: any, pos: number) => {
    if (node.type.name !== "code_block") return true;
    const lang = (node.attrs && node.attrs.language) || "";
    if (String(lang).toLowerCase() === "mermaid") {
      out.push({
        pos,
        to: pos + node.nodeSize,
        code: node.textContent || "",
      });
    }
    return true;
  });
  return out;
}

let idCounter = 0;

// 渲染缓存：key 为 `${generation}-${pos}`，值记录代码哈希与渲染结果。
// 文档中其他位置打字触发 docChanged 时会重建所有图表 widget；
// 内容未变的图表直接复用缓存，避免昂贵的 mermaid.render 每次都全量执行。
const mermaidRenderCache = new Map<string, { hash: string; html: string }>();
const MERMAID_CACHE_MAX = 200;

export const mermaidPlugin = $prose(() => {
  return new Plugin<PluginState>({
    key: mermaidKey,
    state: {
      init: () => ({ set: DecorationSet.empty, bump: 0 }),
      apply(tr, prev) {
        const meta = tr.getMeta(mermaidKey);
        const bump = meta && typeof meta.bump === "number" ? meta.bump : prev.bump;
        if (!tr.docChanged && bump === prev.bump) return prev;
        // 大文档降级：输入（docChanged 且非 bump）时跳过全量重建，
        // 装饰位置由 ProseMirror 自动 mapping 跟随，内容在 bump 时刷新
        if (tr.docChanged && bump === prev.bump && isLargeDoc(tr.doc)) return prev;

        const blocks = findMermaidBlocks(tr.doc);
        const decos: Decoration[] = [];
        // 捕获本次 apply 的 generation 快照，闭包内只与之比较
        const genSnapshot = renderGeneration;
        for (let i = 0; i < blocks.length; i++) {
          const b = blocks[i];
          const code = b.code.trim();
          const cacheKey = `${genSnapshot}-${b.pos}`;
          const cached = mermaidRenderCache.get(cacheKey);
          if (cached && cached.hash === code) {
            // 代码未变化：直接复用上次渲染结果，跳过昂贵的异步 mermaid.render
            const wrapper = document.createElement("div");
            wrapper.className = "textora-mermaid";
            wrapper.innerHTML = cached.html;
            decos.push((Decoration as any).replace(b.pos, b.to, { widget: wrapper }));
            continue;
          }
          const wrapper = document.createElement("div");
          wrapper.className = "textora-mermaid";
          wrapper.setAttribute("data-mermaid", "pending");
          wrapper.textContent = code;
          // 唯一 id，避免重复
          const id = `mermaid-${genSnapshot}-${idCounter++}`;
          void (async () => {
            try {
              const theme =
                document.documentElement.getAttribute("data-theme") === "dark" ||
                document.documentElement.getAttribute("data-theme") === "nord"
                  ? "dark"
                  : "light";
              const mod = await ensureMermaid(theme as "light" | "dark");
              // 主题已切换则丢弃本次结果
              if (genSnapshot !== renderGeneration) return;
              if (!wrapper.isConnected) return;
              const { svg } = await mod.default.render(id, code);
              if (genSnapshot !== renderGeneration) return;
              if (!wrapper.isConnected) return;
              wrapper.innerHTML = svg;
              wrapper.removeAttribute("data-mermaid");
              // 写入渲染缓存；超过上限时清空防止无限增长
              if (mermaidRenderCache.size >= MERMAID_CACHE_MAX) {
                mermaidRenderCache.clear();
              }
              mermaidRenderCache.set(cacheKey, { hash: code, html: svg });
            } catch (e) {
              if (genSnapshot !== renderGeneration) return;
              if (!wrapper.isConnected) return;
              // 错误消息来自 mermaid 解析器，可能包含输入内容的片段——
              // 必须转义后再注入 innerHTML，否则恶意代码块可执行任意 JS（XSS）
              const escapeHtml = (s: string) =>
                s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
              wrapper.innerHTML = `<div class="textora-mermaid-error">图表渲染失败: ${escapeHtml((e as Error).message)}</div><pre>${escapeHtml(code)}</pre>`;
              wrapper.removeAttribute("data-mermaid");
            }
          })();
          decos.push((Decoration as any).replace(b.pos, b.to, { widget: wrapper }));
        }
        return { set: DecorationSet.create(tr.doc, decos), bump };
      },
    },
    props: {
      decorations(state) {
        return this.getState(state)?.set ?? null;
      },
    },
  });
});

export function bumpMermaid(view: any) {
  if (!view) return;
  const { state, dispatch } = view;
  const tr = state.tr.setMeta(mermaidKey, { bump: Date.now() });
  dispatch(tr);
}
