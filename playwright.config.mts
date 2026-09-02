import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright E2E 测试配置
 *
 * 用于测试 Textora 的核心用户流程，包括文件操作、编辑、保存等。
 */
export default defineConfig({
  testDir: "./e2e",
  // 渲染层冒烟测试不含 Electron 全链路（后者由 playwright.electron.config.mts 单独跑）
  testIgnore: /electron\.spec\.ts/,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: "html",
  use: {
    baseURL: "http://localhost:1420",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      // channel: "chromium" 让 headless 模式使用完整 Chromium 包
      // （而非 headless-shell，后者需单独下载；离线环境用本地完整包）
      use: { ...devices["Desktop Chrome"], channel: "chromium" },
    },
  ],
  webServer: {
    // 仅启动 vite 渲染层（Electron 主进程由 dev:main 单独启动，e2e 只操作渲染层页面）
    command: "npm run dev:renderer",
    url: "http://localhost:1420",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
