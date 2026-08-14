/**
 * 验证右键菜单子菜单定位修复：hover「插入」后子菜单应紧贴菜单项右侧弹出，
 * 而不是被推到屏幕边缘。产物：docs/screenshots/menu-check.png
 */
import { _electron } from "@playwright/test";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const outDir = path.join(root, "docs", "screenshots");
const demoWs = path.join(process.env.TEMP || ".", "textora-demo-ws");
const e2eProfile = path.join(process.env.TEMP || ".", "textora-e2e-profile");
fs.rmSync(e2eProfile, { recursive: true, force: true });
fs.mkdirSync(demoWs, { recursive: true });

const app = await _electron.launch({
  executablePath: path.join(root, "release", "win-unpacked", "Textora.exe"),
  args: [],
  env: { ...process.env, TEXTORA_E2E: "1", TEXTORA_E2E_DIR: demoWs },
});

try {
  const win = await app.firstWindow();
  await win.waitForLoadState("domcontentloaded");
  await win.waitForTimeout(1200);

  // 打开文件夹 + demo.md（与 screenshot.mjs 相同流程）
  await win.getByText("文件", { exact: true }).first().click({ force: true });
  await win.waitForTimeout(400);
  await win.getByText("打开文件夹", { exact: true }).first().click({ force: true });
  await win.waitForTimeout(1500);
  // demo.md 可能不存在（空目录）：先创建内容再打开
  const demoFile = path.join(demoWs, "demo.md");
  if (!fs.existsSync(demoFile)) {
    fs.writeFileSync(demoFile, "# 演示\n\n正文内容。\n");
    await win.getByText("文件", { exact: true }).first().click({ force: true });
    await win.waitForTimeout(300);
    await win.getByText("打开文件夹", { exact: true }).first().click({ force: true });
    await win.waitForTimeout(1200);
  }
  await win.getByText("demo.md", { exact: true }).first().click({ force: true });
  await win.waitForTimeout(1500);

  // 在编辑区右键打开菜单
  await win.mouse.click(700, 350, { button: "right" });
  await win.waitForTimeout(600);
  const rowCount = await win.locator(".ctx-menu-row").count();
  console.log("menu rows:", rowCount);

  // hover「插入」菜单项 → 子菜单应在该项右侧弹出
  await win.getByText("插入", { exact: true }).first().hover();
  await win.waitForTimeout(600);
  await win.screenshot({ path: path.join(outDir, "menu-check.png") });
  console.log("saved: menu-check.png");

  // 客观断言：基于容器级坐标（文本元素带 padding，不能直接比较）
  const dims = await win.evaluate(() => ({
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
    menus: Array.from(document.querySelectorAll(".fixed.z-\\[9999\\]")).map((el) => {
      const r = el.getBoundingClientRect();
      return {
        styleLeft: el.style.left,
        styleTop: el.style.top,
        rectLeft: r.left,
        rectTop: r.top,
        w: r.width,
        h: r.height,
        parent: el.parentElement ? el.parentElement.className.slice(0, 60) : null,
      };
    }),
    insertRowRect: (() => {
      const rows = Array.from(document.querySelectorAll(".ctx-menu-row"));
      const row = rows.find((r) => r.textContent?.trim().startsWith("插入"));
      if (!row) return null;
      const r = row.getBoundingClientRect();
      return { left: r.left, top: r.top, right: r.right, w: r.width };
    })(),
    submenuText: (() => {
      // 第二个 fixed 菜单（子菜单）的文本内容
      const menus = Array.from(document.querySelectorAll(".fixed.z-\\[9999\\]"));
      const sub = menus[1];
      return sub ? sub.textContent : null;
    })(),
  }));
  console.log("window:", JSON.stringify(dims, null, 1));

  const m = dims.menus;
  const row = dims.insertRowRect;
  if (m.length >= 2 && row) {
    const dx = m[1].rectLeft - row.right;
    console.log(`submenu container dx from insert row right edge: ${dx.toFixed(1)}px (expect ~4px)`);
    console.log(dx >= 0 && dx <= 10 ? "PASS: submenu hugs the menu item" : "FAIL: submenu is detached");
    console.log("submenu inside viewport:", m[1].rectLeft + m[1].w <= dims.innerWidth - 4);
  } else {
    console.log("FAIL: submenu not visible");
  }
  const hrInSub = dims.submenuText ? dims.submenuText.includes("分割线") : false;
  const leakInSub = dims.submenuText ? dims.submenuText.includes("ctx.insert") : false;
  console.log("submenu shows '分割线':", hrInSub, "| contains ctx.* leak:", leakInSub);
} catch (err) {
  console.error("menu check failed:", err);
  process.exitCode = 1;
} finally {
  await app.close().catch(() => {});
}
