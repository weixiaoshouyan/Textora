/**
 * 文本编码自动检测测试
 */
import { describe, expect, it } from "vitest";
import iconv from "iconv-lite";
import { detectTextEncoding, isValidUtf8 } from "../main/encodingDetect";

describe("detectTextEncoding", () => {
  it("detects GBK Chinese text without BOM", () => {
    const buf = iconv.encode("你好，世界！这是一段中文测试。", "gbk");
    expect(detectTextEncoding(buf)).toBe("gbk");
  });

  it("detects GBK with ASCII mixed content", () => {
    const buf = iconv.encode("文件名: report_2024.txt 已完成", "gbk");
    expect(detectTextEncoding(buf)).toBe("gbk");
  });

  it("detects a single GBK character (short file)", () => {
    const buf = iconv.encode("中", "gbk");
    expect(detectTextEncoding(buf)).toBe("gbk");
  });

  it("detects UTF-8 Chinese text", () => {
    const buf = Buffer.from("你好，世界！", "utf-8");
    expect(detectTextEncoding(buf)).toBe("utf-8");
  });

  it("detects pure ASCII as utf-8", () => {
    const buf = Buffer.from("hello world 123\nline two", "ascii");
    expect(detectTextEncoding(buf)).toBe("utf-8");
  });

  it("detects UTF-8 BOM", () => {
    const buf = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from("内容", "utf-8")]);
    expect(detectTextEncoding(buf)).toBe("utf-8-bom");
  });

  it("detects UTF-16 LE BOM", () => {
    const buf = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from("内容", "utf16le")]);
    expect(detectTextEncoding(buf)).toBe("utf-16le");
  });

  it("detects UTF-16 BE BOM", () => {
    const buf = Buffer.concat([Buffer.from([0xfe, 0xff]), iconv.encode("内容", "utf-16be")]);
    expect(detectTextEncoding(buf)).toBe("utf-16be");
  });

  it("does not misclassify latin1 accented text as GBK", () => {
    // "café" 的 é 是单字节 0xE9，后无尾字节
    const buf = Buffer.from([0x63, 0x61, 0x66, 0xe9]);
    expect(detectTextEncoding(buf)).toBe("latin1");
    // "cafés" 的 é 后跟 ASCII 's'（0x73），不构成 GBK 汉字特征
    const buf2 = Buffer.from([0x63, 0x61, 0x66, 0xe9, 0x73]);
    expect(detectTextEncoding(buf2)).toBe("latin1");
  });

  it("falls back to latin1 for random binary bytes", () => {
    const buf = Buffer.from([0xff, 0x81, 0x20, 0x83, 0x44, 0x9a, 0x7b]);
    expect(detectTextEncoding(buf)).toBe("latin1");
  });

  it("handles empty buffer", () => {
    expect(detectTextEncoding(Buffer.alloc(0))).toBe("utf-8");
  });
});

describe("isValidUtf8", () => {
  it("rejects overlong encoding", () => {
    // 0xC0 0x80 是 overlong 的 NUL
    expect(isValidUtf8(Buffer.from([0xc0, 0x80]))).toBe(false);
  });

  it("rejects surrogate range (0xED 0xA0..0xBF)", () => {
    expect(isValidUtf8(Buffer.from([0xed, 0xa0, 0x80]))).toBe(false);
  });

  it("rejects truncated sequences", () => {
    expect(isValidUtf8(Buffer.from([0xe4, 0xb8]))).toBe(false);
  });

  it("accepts valid multi-byte text", () => {
    expect(isValidUtf8(Buffer.from("中文😀", "utf-8"))).toBe(true);
  });
});
