import { defineConfig } from "@playwright/test";

/**
 * Electron 全链路 E2E 配置（独立于渲染层冒烟测试）。
 *
 * 前置：npm run build（见 e2e/electron.spec.ts 的 beforeAll 检查）。
 * 运行：npm run test:e2e:electron
 *
 * 注意：Electron 应用无法并发运行，workers 固定为 1；
 * 不启动 vite webServer（生产构建加载 file:// dist/index.html）。
 */
export default defineConfig({
  testDir: "./e2e",
  testMatch: /electron\.spec\.ts/,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: "html",
  timeout: 120_000,
  expect: {
    timeout: 30_000,
  },
  use: {
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
});
