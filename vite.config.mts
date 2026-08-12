import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "./",
  publicDir: "resources",
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      // 关键修复：把 React 全家桶强制收敛到一个 chunk，
      // 否则 vite 默认分块会让多个动态导入的 chunk 各自带一份 react 副本，
      // 运行时存在多个 React 实例 → hooks 报 "Invalid hook call" (#300)
      output: {
        manualChunks: (id) => {
          if (id.includes("node_modules")) {
            if (
              id.includes("/react/") ||
              id.includes("/react-dom/") ||
              id.includes("/scheduler/") ||
              id.includes("/react-jsx-runtime/")
            ) {
              return "react-vendor";
            }
            // Heavy editor / visualization libs → separate chunks
            if (
              id.includes("/mermaid/") ||
              id.includes("/dagre-d3-es/") ||
              id.includes("/d3") ||
              id.includes("/milkdown/") ||
              id.includes("/prosemirror/")
            ) {
              return "editor-vendor";
            }
            // Syntax highlighting (shiki + textmate) is large but needed early
            if (
              id.includes("/shiki/") ||
              id.includes("/@shikijs/") ||
              id.includes("/vscode-textmate/")
            ) {
              return "shiki-vendor";
            }
            // KaTeX math rendering
            if (id.includes("/katex/")) {
              return "katex-vendor";
            }
            // Smaller utilities grouped together
            if (
              id.includes("/remark") ||
              id.includes("/unified") ||
              id.includes("/unist-") ||
              id.includes("/vfile") ||
              id.includes("/mdast") ||
              id.includes("/micromark")
            ) {
              return "md-vendor";
            }
          }
          return undefined;
        },
      },
    },
  },
  // 强制依赖去重，防止 npm 树里出现多份 react/react-dom
  resolve: {
    dedupe: ["react", "react-dom"],
  },
  server: {
    port: 1420,
    strictPort: true,
  },
});
