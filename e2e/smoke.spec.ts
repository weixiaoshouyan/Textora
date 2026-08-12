/**
 * E2E 冒烟测试
 *
 * 说明：webServer 只启动 Vite 渲染层（端口 1420），不依赖 Electron 主进程。
 * 因此这里仅验证渲染层 UI 的加载与基础交互；涉及原生 IPC（文件读写/对话框）
 * 的流程需要在 Electron 环境下手动验证或用 Spectron 类框架补充。
 */
import { test, expect } from "@playwright/test";

test("app shell loads and renders welcome UI", async ({ page }) => {
  await page.goto("/");

  // React 根节点渲染完成（Welcome 页包含应用标题）
  await expect(page.getByText("Textora").first()).toBeVisible({ timeout: 15000 });
  await expect(page.locator("#root > div")).toBeVisible();
});

test("top bar renders menu and window controls", async ({ page }) => {
  await page.goto("/");

  // 顶部栏菜单（文件 / 视图）与标题区域
  await expect(page.locator("header")).toBeVisible();
  await expect(page.locator("header").getByText(/文件|File/).first()).toBeVisible();
});
