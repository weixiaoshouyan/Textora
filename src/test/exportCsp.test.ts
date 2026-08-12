/**
 * export.ts 导出页 CSP 注入测试
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
  BrowserWindow: class {},
  ipcMain: { handle: vi.fn() },
  app: { getPath: vi.fn(() => "C:/tmp") },
}));

import { injectExportCsp } from "../main/ipc/export";

describe("injectExportCsp", () => {
  it("prepends the CSP meta when the document has no head", () => {
    const result = injectExportCsp("<html><body>hi</body></html>");
    expect(result).toMatch(/^<meta http-equiv="Content-Security-Policy"/);
    expect(result).toContain("script-src 'none'");
  });

  it("injects the CSP meta into an existing head", () => {
    const result = injectExportCsp("<html><head><title>t</title></head><body>x</body></html>");
    const headEnd = result.indexOf("</head>");
    const metaAt = result.indexOf('http-equiv="Content-Security-Policy"');
    expect(metaAt).toBeGreaterThan(0);
    expect(metaAt).toBeLessThan(headEnd);
    expect(result).toContain("<title>t</title>");
  });

  it("does not inject a second CSP when the document already has one", () => {
    const html = '<html><head><meta http-equiv="Content-Security-Policy" content="default-src \'self\'"></head><body>x</body></html>';
    const result = injectExportCsp(html);
    expect(result).toBe(html);
    expect(result.match(/content-security-policy/gi)).toHaveLength(1);
  });

  it("keeps script/connect fully disabled while allowing images/styles/fonts", () => {
    const result = injectExportCsp("<p>x</p>");
    expect(result).toContain("script-src 'none'");
    expect(result).toContain("connect-src 'none'");
    expect(result).toContain("img-src 'self' data: blob:");
    expect(result).toContain("style-src 'self' 'unsafe-inline'");
    expect(result).toContain("font-src 'self' data:");
  });
});
