import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/test/**/*.test.ts", "src/test/**/*.test.tsx"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html", "lcov"],
      include: ["src/**/*.ts", "src/**/*.tsx"],
      exclude: ["src/test/**", "src/**/*.d.ts", "src/vite-env.d.ts"],
      thresholds: {
        // 当前基线（2026-08）：核心逻辑（shared/safeRegex/files/tools/store）已有覆盖，
        // 但 UI 组件与编辑器插件缺单测导致整体覆盖率偏低；
        // 阈值设于略低于基线，防止覆盖率回退，后续补测试后逐步提高。
        statements: 10,
        branches: 8,
        functions: 8,
        lines: 10,
      },
    },
  },
});
