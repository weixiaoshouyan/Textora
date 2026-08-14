/**
 * 图片尺寸持久化（`=WxH` title 语法）纯函数测试
 */
import { describe, expect, it } from "vitest";
import {
  parseSizeFromTitle,
  buildSizeTitle,
  isSizeTitle,
  applySizeToHtml,
} from "../editor/imageSize";

describe("parseSizeFromTitle", () => {
  it("parses =WxH sizes", () => {
    expect(parseSizeFromTitle("=200x150")).toEqual({ width: 200, height: 150 });
    expect(parseSizeFromTitle("=200X150")).toEqual({ width: 200, height: 150 });
    expect(parseSizeFromTitle("  =800x600  ")).toEqual({ width: 800, height: 600 });
  });

  it("rejects non-size titles", () => {
    expect(parseSizeFromTitle("")).toBeNull();
    expect(parseSizeFromTitle("a screenshot")).toBeNull();
    expect(parseSizeFromTitle("=200")).toBeNull();
    expect(parseSizeFromTitle("200x150")).toBeNull();
    expect(parseSizeFromTitle("=0x150")).toBeNull();
    expect(parseSizeFromTitle("=-5x10")).toBeNull();
  });
});

describe("buildSizeTitle", () => {
  it("builds =WxH and rounds values", () => {
    expect(buildSizeTitle(200, 150)).toBe("=200x150");
    expect(buildSizeTitle(200.6, 150.4)).toBe("=201x150");
  });

  it("rejects invalid dimensions", () => {
    expect(buildSizeTitle(0, 150)).toBe("");
    expect(buildSizeTitle(Number.NaN, 150)).toBe("");
    expect(buildSizeTitle(-10, 150)).toBe("");
  });
});

describe("isSizeTitle", () => {
  it("detects size titles only", () => {
    expect(isSizeTitle("=200x150")).toBe(true);
    expect(isSizeTitle("screenshot")).toBe(false);
    expect(isSizeTitle("")).toBe(false);
  });
});

describe("applySizeToHtml", () => {
  it("injects width/height style into size-titled images", () => {
    const html = '<img src="a.png" title="=200x150" alt="x">';
    expect(applySizeToHtml(html)).toBe(
      '<img src="a.png" title="=200x150" style="width:200px;height:150px" alt="x">'
    );
  });

  it("leaves non-size titles and already-styled images untouched", () => {
    expect(applySizeToHtml('<img src="a.png" title="note" alt="x">')).toBe(
      '<img src="a.png" title="note" alt="x">'
    );
    expect(applySizeToHtml('<img src="a.png" title="=100x50" style="width:1px">')).toContain(
      'style="width:1px"'
    );
  });
});
