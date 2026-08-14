/**
 * 右键菜单交互回归验证（修复：子菜单 hover 断链 + 空选区点击卡死）：
 * 1. hover「标题」行 → 子菜单弹出
 * 2. 分步移入子菜单 → 子菜单保持（0 间隙 + inSubRef）
 * 3. 点击「标题 1」→ 页面保持响应（codeFold 不再造成 PM DOM 无限循环）
 * 4. 折叠按钮点击 → 兄弟节点隐藏/恢复
 * 注意：菜单文案 i18n 为繁体（标题），匹配用繁体。
 */
import { _electron } from "@playwright/test";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
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
  win.on("console", (msg) => {
    if (msg.type() === "error" || msg.type() === "warning") {
      console.log("[renderer]", msg.type(), ":", msg.text().slice(0, 400));
    }
  });
  await win.waitForTimeout(1200);

  // 新建文件并等待 Milkdown 编辑器挂载
  await win.keyboard.press("Control+n");
  await win.waitForSelector(".milkdown .ProseMirror", { timeout: 15000 }).catch(() => {
    console.log("WARN: editor did not mount");
  });
  await win.waitForTimeout(600);
  // 点击编辑器内部获得焦点后再输入（type 需要焦点）
  await win.mouse.click(400, 200);
  await win.waitForTimeout(200);
  await win.keyboard.type("waanquan liaojie kehu baofali");
  await win.waitForTimeout(400);

  // 在编辑区右键打开菜单
  await win.mouse.click(500, 300, { button: "right" });
  await win.waitForTimeout(700);
  const rowsAfterRc = await win.locator(".ctx-menu-row").count();
  console.log("menu rows after right-click:", rowsAfterRc);
  if (rowsAfterRc === 0) {
    console.log("FAIL: context menu did not open");
    process.exitCode = 1;
  } else {
    const headingRow = await win.evaluate(() => {
      const rows = Array.from(document.querySelectorAll(".ctx-menu-row"));
      const row = rows.find((r) => r.textContent && r.textContent.trim().startsWith("标题"));
      if (!row) return null;
      const r = row.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2, right: r.right, top: r.top };
    });
    if (!headingRow) {
      console.log("FAIL: heading row not found (i18n text mismatch?)");
      process.exitCode = 1;
    } else {
      // 分步 hover「标题」行
      await win.mouse.move(500, 300, { steps: 3 });
      await win.mouse.move(headingRow.x, headingRow.y, { steps: 8 });
      await win.waitForTimeout(300);
      const subVisible1 = await win.getByText("标题 1", { exact: true }).count();
      console.log("after hovering heading row, submenu visible:", subVisible1 > 0);

      // 分步移入子菜单「标题 1」（0 间隙：行右缘即子菜单左缘）
      const sub1 = await win.getByText("标题 1", { exact: true }).first().boundingBox().catch(() => null);
      if (!sub1) {
        console.log("FAIL: submenu boundingBox unavailable");
        process.exitCode = 1;
      } else {
        await win.mouse.move(headingRow.right, headingRow.top + 10, { steps: 5 });
        await win.waitForTimeout(200);
        const still1 = await win.getByText("标题 1", { exact: true }).count();
        console.log("after moving into submenu (step 1), submenu still visible:", still1 > 0);
        await win.mouse.move(sub1.x + 10, sub1.y + 8, { steps: 5 });
        await win.waitForTimeout(200);
        const still2 = await win.getByText("标题 1", { exact: true }).count();
        console.log("after moving onto item, submenu still visible:", still2 > 0);

        if (still2 > 0) {
          // CDP：点击后抓死循环堆栈（修复后主线程空闲，栈只有一帧）
          const cdp = await win.context().newCDPSession(win).catch(() => null);
          if (cdp) await cdp.send("Debugger.enable").catch(() => {});
          cdp?.on("Debugger.paused", (e) => {
            const frames = (e.callFrames || []).slice(0, 14).map((f) => {
              const fn = f.functionName || "(anonymous)";
              const url = (f.url || "native").split("/").pop() || f.url;
              return `${fn} @ ${url}:${f.location.lineNumber + 1}`;
            });
            console.log("=== PAUSED STACK (freeze location) ===");
            console.log(frames.join("\n"));
            void cdp.send("Debugger.resume").catch(() => {});
          });

          await win.getByText("标题 1", { exact: true }).first().click({ timeout: 6000 }).catch((e) => {
            console.log("click failed (expected if frozen):", e.message.slice(0, 80));
          });
          await win.waitForTimeout(1500);
          if (cdp) await cdp.send("Debugger.pause").catch(() => {});
          await win.waitForTimeout(1200);

          const responsive = await win
            .evaluate(() => "alive")
            .then(() => true)
            .catch(() => false);
          console.log("page responsive after click:", responsive);
          if (responsive) {
            const menuGone = await win.locator(".ctx-menu-row").count();
            const h1Count = await win.locator(".milkdown h1, .ProseMirror h1").count();
            console.log("menu closed after click:", menuGone === 0, "| h1 applied:", h1Count > 0);

            // 折叠按钮验证：点击 → 后续兄弟隐藏；再点 → 恢复
            const foldBtn = win.locator(".textora-fold-btn").first();
            const btnCount = await foldBtn.count();
            console.log("fold button present:", btnCount > 0);
            if (btnCount > 0) {
              await foldBtn.click();
              await win.waitForTimeout(300);
              const hiddenAfter = await win.evaluate(() => {
                const h1 = document.querySelector(".milkdown h1");
                if (!h1) return -1;
                let hidden = 0;
                let sib = h1.nextElementSibling;
                while (sib) {
                  if (sib.style.display === "none") hidden++;
                  sib = sib.nextElementSibling;
                }
                return hidden;
              });
              console.log("siblings hidden after fold:", hiddenAfter > 0);
              await foldBtn.click();
              await win.waitForTimeout(300);
              const hiddenNow = await win.evaluate(() => {
                const h1 = document.querySelector(".milkdown h1");
                if (!h1) return -1;
                let hidden = 0;
                let sib = h1.nextElementSibling;
                while (sib) {
                  if (sib.style.display === "none") hidden++;
                  sib = sib.nextElementSibling;
                }
                return hidden;
              });
              console.log("siblings hidden after unfold:", hiddenNow, "(expect 0)");
            }
            console.log(still2 > 0 && menuGone === 0 && h1Count > 0 ? "PASS: menu fully interactive" : "FAIL: menu interaction broken");
          }
        } else {
          console.log("FAIL: submenu disappeared while moving into it (hover flicker)");
        }
      }
    }
  }
} catch (err) {
  console.error("repro failed:", err);
  process.exitCode = 1;
} finally {
  await app.close().catch(() => {});
}
