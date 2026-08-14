/**
 * 生成 README 用的产品截图（Playwright _electron 启动打包版应用）。
 * 用法：node e2e/screenshot.mjs
 * 产物：docs/screenshots/*.png
 */
import { _electron } from "@playwright/test";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const outDir = path.join(root, "docs", "screenshots");
fs.mkdirSync(outDir, { recursive: true });

// 示例工作区：把 demo.md 复制到临时目录
const demoWs = path.join(process.env.TEMP || ".", "textora-demo-ws");
fs.mkdirSync(demoWs, { recursive: true });
fs.copyFileSync(path.join(outDir, "demo.md"), path.join(demoWs, "demo.md"));

// 清空 E2E profile，保证每次从干净状态启动（否则上次的 workspace/session 会恢复）
const e2eProfile = path.join(process.env.TEMP || ".", "textora-e2e-profile");
fs.rmSync(e2eProfile, { recursive: true, force: true });

const exe = path.join(root, "release", "win-unpacked", "Textora.exe");

const app = await _electron.launch({
  executablePath: exe,
  args: [],
  env: {
    ...process.env,
    TEXTORA_E2E: "1",
    TEXTORA_E2E_DIR: demoWs,
  },
});

try {
  const win = await app.firstWindow();
  await win.waitForLoadState("domcontentloaded");
  // 等欢迎页渲染
  await win.waitForTimeout(1500);
  await win.screenshot({ path: path.join(outDir, "welcome.png") });
  console.log("saved: welcome.png");

  // 打开文件夹：点击顶栏「文件」菜单 → 「打开文件夹」（E2E_DIR 让对话框直接返回示例目录）。
  // force: true —— 下拉菜单项可能被 header 元素遮挡，直接派发点击
  const fileMenu = win.getByText("文件", { exact: true }).first();
  await fileMenu.click({ force: true });
  await win.waitForTimeout(400);
  await win.getByText("打开文件夹", { exact: true }).first().click({ force: true });
  // 等文件树加载
  await win.waitForTimeout(2000);
  const treeItems = await win.locator(".textora-file-tree-item").count();
  console.log("tree items:", treeItems);

  // 打开 demo.md
  const treeItem = win.locator(".textora-file-tree-item").filter({ hasText: "demo.md" }).first();
  if (await treeItem.count()) {
    await treeItem.click();
  } else {
    await win.getByText("demo.md", { exact: true }).first().click();
  }
  // 等 Milkdown 编辑器 + mermaid/katex 渲染完成
  await win.waitForTimeout(3500);
  await win.screenshot({ path: path.join(outDir, "editor.png") });
  console.log("saved: editor.png");

  // 滚动到公式/Mermaid/代码区域（文档前半）：鼠标滚轮更接近真实行为
  await win.mouse.move(700, 400);
  await win.mouse.wheel(0, 1200);
  await win.waitForTimeout(1200);
  await win.mouse.wheel(0, 900);
  // 等滚动后的重绘与懒加载完成
  await win.waitForTimeout(2500);
  await win.screenshot({ path: path.join(outDir, "features.png") });
  console.log("saved: features.png");

  // 设置面板：文件菜单 → 设置（Ctrl+, 的 key 是 "," 而非 "comma"，绑定匹配不上）
  await win.getByText("文件", { exact: true }).first().click({ force: true });
  await win.waitForTimeout(400);
  await win.getByText("设置…", { exact: true }).first().click({ force: true });
  await win.waitForTimeout(900);
  await win.screenshot({ path: path.join(outDir, "settings.png") });
  console.log("saved: settings.png");
  // 关闭设置面板（右上角关闭按钮）
  await win.keyboard.press("Escape");
  await win.waitForTimeout(300);

  // 查找替换（Ctrl+F）：焦点需在非输入区域（编辑器中 allowInInput=false 不触发）
  await win.mouse.click(150, 500); // 点击侧边栏空白（文件树区域）
  await win.waitForTimeout(300);
  await win.keyboard.press("Control+f");
  await win.waitForTimeout(700);
  await win.screenshot({ path: path.join(outDir, "find.png") });
  console.log("saved: find.png");
} catch (err) {
  console.error("screenshot failed:", err);
  process.exitCode = 1;
} finally {
  await app.close().catch(() => {});
}
