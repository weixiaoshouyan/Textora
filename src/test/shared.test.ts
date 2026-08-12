/**
 * 主进程 shared.ts 纯函数单元测试
 *
 * 注：shared.ts 顶部 import { app } from 'electron'，需要 mock。
 * 但本测试只覆盖不依赖 app 的纯工具函数。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mkdtemp, mkdir, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Mock electron 的 app 模块（shared.ts 在模块加载时不会调用，但 import 需要解析）
vi.mock("electron", () => ({
  app: {
    getPath: vi.fn(() => "C:/Users/test/AppData/Roaming/Textora"),
  },
}));

import {
  validateEncoding,
  detectLineEnding,
  kindForExt,
  langForExt,
  mimeForExt,
  looksLikeBinary,
  hexDump,
  sanitizeFilename,
  isHidden,
  isSkipDir,
  MARKDOWN_EXTS,
  IMAGE_EXTS,
  CODE_EXTS,
  setWorkspaceRoot,
  validateWorkspacePath,
  assertWorkspaceSize,
  assertDirStillWithinWorkspace,
} from "../main/shared";
import { ALLOWED_ENCODINGS } from "../main/constants";

const setWorkspaceRootForTest = (root: string | null) => setWorkspaceRoot(root);

describe("shared.ts 纯函数", () => {
  describe("workspace security boundary", () => {
    beforeEach(() => {
      setWorkspaceRootForTest(null);
    });

    it("allows the workspace root itself", async () => {
      const root = await mkdtemp(join(tmpdir(), "textora-root-"));
      setWorkspaceRootForTest(root);

      await expect(validateWorkspacePath(root)).resolves.toMatchObject({ ok: true, resolved: root });
    });

    it("resolves relative paths from the workspace root", async () => {
      const root = await mkdtemp(join(tmpdir(), "textora-root-"));
      await mkdir(join(root, "relative"));
      await writeFile(join(root, "relative", "note.md"), "ok");
      setWorkspaceRootForTest(root);

      await expect(validateWorkspacePath("relative/note.md")).resolves.toMatchObject({
        ok: true,
        resolved: join(root, "relative", "note.md"),
      });
    });

    it("treats Windows path casing as equivalent", async () => {
      if (process.platform !== "win32") return;
      const root = await mkdtemp(join(tmpdir(), "textora-root-"));
      setWorkspaceRootForTest(root);

      await expect(validateWorkspacePath(root.toUpperCase())).resolves.toMatchObject({ ok: true });
    });

    it("rejects paths outside the workspace", async () => {
      const root = await mkdtemp(join(tmpdir(), "textora-root-"));
      const outside = await mkdtemp(join(tmpdir(), "textora-outside-"));
      setWorkspaceRootForTest(root);

      await expect(validateWorkspacePath(outside)).resolves.toMatchObject({ ok: false, code: "WORKSPACE_ESCAPE" });
    });

    it("allows a missing leaf when its parent is inside the workspace", async () => {
      const root = await mkdtemp(join(tmpdir(), "textora-root-"));
      await mkdir(join(root, "notes"));
      setWorkspaceRootForTest(root);

      await expect(validateWorkspacePath(join(root, "notes", "new.md"), { allowMissingLeaf: true }))
        .resolves.toMatchObject({ ok: true, resolved: join(root, "notes", "new.md") });
    });

    it("rejects an existing symlink that points outside the workspace", async () => {
      const root = await mkdtemp(join(tmpdir(), "textora-root-"));
      const outside = await mkdtemp(join(tmpdir(), "textora-outside-"));
      await writeFile(join(outside, "secret.md"), "secret");
      await symlink(outside, join(root, "linked"), "junction");
      setWorkspaceRootForTest(root);

      await expect(validateWorkspacePath(join(root, "linked", "secret.md")))
        .resolves.toMatchObject({ ok: false, code: "WORKSPACE_ESCAPE" });
    });

    it("rejects traversal segments even when they resolve inside the workspace", async () => {
      const root = await mkdtemp(join(tmpdir(), "textora-root-"));
      setWorkspaceRootForTest(root);

      await expect(validateWorkspacePath(`${root}\\notes\\..\\safe.md`, { allowMissingLeaf: true }))
        .resolves.toMatchObject({ ok: false, code: "INVALID_PATH" });
    });

    it("assertDirStillWithinWorkspace accepts a real workspace subdirectory", async () => {
      const root = await mkdtemp(join(tmpdir(), "textora-root-"));
      await mkdir(join(root, "docs"));
      setWorkspaceRootForTest(root);

      await expect(assertDirStillWithinWorkspace(join(root, "docs", "note.md"))).resolves.toBeUndefined();
    });

    it("assertDirStillWithinWorkspace rejects a parent swapped to an outside junction", async () => {
      const root = await mkdtemp(join(tmpdir(), "textora-root-"));
      const outside = await mkdtemp(join(tmpdir(), "textora-outside-"));
      // 攻击者在校验后把工作区内目录替换为指向外部的 junction
      await symlink(outside, join(root, "docs"), "junction");
      setWorkspaceRootForTest(root);

      await expect(assertDirStillWithinWorkspace(join(root, "docs", "note.md")))
        .rejects.toMatchObject({ code: "WORKSPACE_ESCAPE" });
    });

    it("assertDirStillWithinWorkspace is a no-op without a workspace root", async () => {
      const root = await mkdtemp(join(tmpdir(), "textora-root-"));
      await expect(assertDirStillWithinWorkspace(join(root, "note.md"))).resolves.toBeUndefined();
    });

    it("returns WORKSPACE_NOT_SET before checking a path", async () => {
      await expect(validateWorkspacePath(join(tmpdir(), "textora-no-root.md")))
        .resolves.toMatchObject({ ok: false, code: "WORKSPACE_NOT_SET" });
    });

    it("throws a structured SIZE_LIMIT error when a byte limit is exceeded", () => {
      expect(() => assertWorkspaceSize(11, 10, "text")).toThrowError(expect.objectContaining({ code: "SIZE_LIMIT" }));
      expect(() => assertWorkspaceSize(10, 10, "text")).not.toThrow();
    });
  });

  describe("validateEncoding", () => {
    it("合法编码应原样返回（小写）", () => {
      expect(validateEncoding("utf-8")).toBe("utf-8");
      expect(validateEncoding("UTF-8")).toBe("utf-8");
      expect(validateEncoding("latin1")).toBe("latin1");
      expect(validateEncoding("gbk")).toBe("gbk");
    });

    it("非法编码应回退到 utf-8", () => {
      expect(validateEncoding("utf-32")).toBe("utf-8");
      expect(validateEncoding("")).toBe("utf-8");
      expect(validateEncoding("evil-encoding")).toBe("utf-8");
    });

    it("null/undefined 应回退到 utf-8（默认值）", () => {
      // @ts-expect-error 测试容错
      expect(validateEncoding(null)).toBe("utf-8");
      // @ts-expect-error 测试容错
      expect(validateEncoding(undefined)).toBe("utf-8");
    });
  });

  describe("detectLineEnding", () => {
    it("含 CRLF 应识别为 crlf", () => {
      expect(detectLineEnding("line1\r\nline2\r\n")).toBe("crlf");
    });

    it("仅含 CR 应识别为 cr", () => {
      expect(detectLineEnding("line1\rline2")).toBe("cr");
    });

    it("仅含 LF 应识别为 lf", () => {
      expect(detectLineEnding("line1\nline2\n")).toBe("lf");
    });

    it("空字符串应为 lf", () => {
      expect(detectLineEnding("")).toBe("lf");
    });

    it("混合 CRLF 和 LF 应优先识别为 crlf", () => {
      expect(detectLineEnding("a\r\nb\nc")).toBe("crlf");
    });
  });

  describe("kindForExt", () => {
    it("markdown 扩展名应识别为 markdown", () => {
      expect(kindForExt("md")).toBe("markdown");
      expect(kindForExt("markdown")).toBe("markdown");
      expect(kindForExt("mdx")).toBe("markdown");
    });

    it("图片扩展名应识别为 image", () => {
      expect(kindForExt("png")).toBe("image");
      expect(kindForExt("jpg")).toBe("image");
      expect(kindForExt("gif")).toBe("image");
      expect(kindForExt("svg")).toBe("image");
    });

    it("代码扩展名应识别为 code", () => {
      expect(kindForExt("ts")).toBe("code");
      expect(kindForExt("py")).toBe("code");
      expect(kindForExt("json")).toBe("code");
    });

    it("未知扩展名应识别为 unknown", () => {
      expect(kindForExt("xyz")).toBe("unknown");
      expect(kindForExt("")).toBe("unknown");
    });

    it("应大小写不敏感", () => {
      expect(kindForExt("MD")).toBe("markdown");
      expect(kindForExt("PNG")).toBe("image");
      expect(kindForExt("TS")).toBe("code");
    });
  });

  describe("langForExt", () => {
    it("已知扩展名应返回对应语言", () => {
      expect(langForExt("ts")).toBe("typescript");
      expect(langForExt("py")).toBe("python");
      expect(langForExt("rs")).toBe("rust");
      expect(langForExt("cpp")).toBe("cpp");
    });

    it("未知扩展名应回退到 plaintext", () => {
      expect(langForExt("unknown")).toBe("plaintext");
      expect(langForExt("")).toBe("plaintext");
    });
  });

  describe("mimeForExt", () => {
    it("已知图片扩展名应返回对应 MIME", () => {
      expect(mimeForExt("png")).toBe("image/png");
      expect(mimeForExt("jpg")).toBe("image/jpeg");
      expect(mimeForExt("svg")).toBe("image/svg+xml");
    });

    it("未知扩展名应回退到 application/octet-stream", () => {
      expect(mimeForExt("unknown")).toBe("application/octet-stream");
    });
  });

  describe("looksLikeBinary", () => {
    it("纯文本应识别为非二进制", () => {
      expect(looksLikeBinary(Buffer.from("hello world"))).toBe(false);
      expect(looksLikeBinary(Buffer.from(""))).toBe(false);
    });

    it("含 0 字节应识别为二进制", () => {
      expect(looksLikeBinary(Buffer.from([0x68, 0x00, 0x65]))).toBe(true);
    });

    it("UTF-8 中文应识别为非二进制", () => {
      expect(looksLikeBinary(Buffer.from("你好世界", "utf-8"))).toBe(false);
    });

    it("应只检查前 8000 字节", () => {
      // 8000 字节非二进制 + 1 字节 0
      const buf = Buffer.alloc(8001, 0x41);
      buf[8000] = 0;
      expect(looksLikeBinary(buf)).toBe(false);
    });
  });

  describe("hexDump", () => {
    it("空输入应返回空字符串", () => {
      expect(hexDump(Buffer.from(""))).toBe("");
    });

    it("应正确格式化字节为十六进制", () => {
      const buf = Buffer.from([0x00, 0xff, 0x0a, 0x41]);
      const result = hexDump(buf);
      expect(result).toBe("00 ff 0a 41");
    });

    it("每行最多 16 字节", () => {
      const buf = Buffer.alloc(20, 0x42);
      const result = hexDump(buf);
      const lines = result.split("\n");
      expect(lines).toHaveLength(2);
      // 第一行 16 字节 = 16 * 3 - 1 = 47 字符
      expect(lines[0].split(" ")).toHaveLength(16);
      // 第二行 4 字节
      expect(lines[1].split(" ")).toHaveLength(4);
    });

    it("超过 512 字节应截断", () => {
      const buf = Buffer.alloc(600, 0x42);
      const result = hexDump(buf);
      const lines = result.split("\n");
      // 512 / 16 = 32 行
      expect(lines).toHaveLength(32);
    });
  });

  describe("sanitizeFilename", () => {
    it("应替换 Windows 非法字符", () => {
      expect(sanitizeFilename('file<name>:"/\\|?*')).toBe("file_name________");
    });

    it("应替换控制字符", () => {
      expect(sanitizeFilename("file\x00\x01name")).toBe("file__name");
    });

    it("应折叠多个连续点", () => {
      expect(sanitizeFilename("file..name")).toBe("file.name");
      expect(sanitizeFilename("file....name")).toBe("file.name");
    });

    it("空字符串或全非法字符应回退到 untitled", () => {
      expect(sanitizeFilename("")).toBe("untitled");
      expect(sanitizeFilename("   ")).toBe("untitled");
    });

    it("正常文件名应保持不变", () => {
      expect(sanitizeFilename("hello-world.md")).toBe("hello-world.md");
    });

    it("应处理 Windows 保留名", () => {
      expect(sanitizeFilename("CON")).toBe("_CON");
      expect(sanitizeFilename("PRN")).toBe("_PRN");
      expect(sanitizeFilename("AUX")).toBe("_AUX");
      expect(sanitizeFilename("NUL")).toBe("_NUL");
      expect(sanitizeFilename("COM1")).toBe("_COM1");
      expect(sanitizeFilename("LPT1")).toBe("_LPT1");
      expect(sanitizeFilename("con.txt")).toBe("_con.txt");
      expect(sanitizeFilename("CONSOLE")).toBe("CONSOLE");
    });
  });

  describe("isHidden", () => {
    it("以 . 开头应识别为隐藏", () => {
      expect(isHidden(".git")).toBe(true);
      expect(isHidden(".env")).toBe(true);
      expect(isHidden(".vscode")).toBe(true);
    });

    it("不以 . 开头应识别为非隐藏", () => {
      expect(isHidden("src")).toBe(false);
      expect(isHidden("README.md")).toBe(false);
    });
  });

  describe("isSkipDir", () => {
    it("node_modules / target / .git 应识别为需跳过", () => {
      expect(isSkipDir("node_modules")).toBe(true);
      expect(isSkipDir("target")).toBe(true);
      expect(isSkipDir(".git")).toBe(true);
    });

    it("应大小写不敏感", () => {
      expect(isSkipDir("Node_Modules")).toBe(true);
      expect(isSkipDir("TARGET")).toBe(true);
      expect(isSkipDir(".GIT")).toBe(true);
    });

    it("应跳过常见构建产物目录", () => {
      expect(isSkipDir("dist")).toBe(true);
      expect(isSkipDir("build")).toBe(true);
      expect(isSkipDir("coverage")).toBe(true);
      expect(isSkipDir(".cache")).toBe(true);
      expect(isSkipDir(".next")).toBe(true);
      expect(isSkipDir(".nuxt")).toBe(true);
    });

    it("其他目录名不应跳过", () => {
      expect(isSkipDir("src")).toBe(false);
      expect(isSkipDir("components")).toBe(false);
      expect(isSkipDir(".vscode")).toBe(false);
    });
  });

  describe("常量集合", () => {
    it("MARKDOWN_EXTS 应包含 md/markdown/mdx", () => {
      expect(MARKDOWN_EXTS.has("md")).toBe(true);
      expect(MARKDOWN_EXTS.has("markdown")).toBe(true);
      expect(MARKDOWN_EXTS.has("mdx")).toBe(true);
      expect(MARKDOWN_EXTS.has("txt")).toBe(false);
    });

    it("IMAGE_EXTS 应包含常见图片格式", () => {
      expect(IMAGE_EXTS.has("png")).toBe(true);
      expect(IMAGE_EXTS.has("jpg")).toBe(true);
      expect(IMAGE_EXTS.has("webp")).toBe(true);
      expect(IMAGE_EXTS.has("avif")).toBe(true);
    });

    it("CODE_EXTS 应包含常见代码扩展名", () => {
      expect(CODE_EXTS.has("ts")).toBe(true);
      expect(CODE_EXTS.has("py")).toBe(true);
      expect(CODE_EXTS.has("json")).toBe(true);
      expect(CODE_EXTS.has("cpp")).toBe(true);
    });

    it("ALLOWED_ENCODINGS 应包含白名单编码", () => {
      expect(ALLOWED_ENCODINGS.has("utf-8")).toBe(true);
      expect(ALLOWED_ENCODINGS.has("gbk")).toBe(true);
      expect(ALLOWED_ENCODINGS.has("latin1")).toBe(true);
      expect(ALLOWED_ENCODINGS.has("utf-32")).toBe(false);
    });
  });
});
