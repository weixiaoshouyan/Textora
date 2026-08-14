import { describe, expect, it } from "vitest";
import { sanitizeHtml } from "../editor/htmlSanitizer";
import { inlineImageSource } from "../editor/exporter";

describe("export HTML sanitizer", () => {
  it("removes executable elements and event handlers", () => {
    const result = sanitizeHtml('<p onclick="alert(1)">ok</p><SCRIPT>alert(2)</SCRIPT><svg onload="x"></svg>');
    expect(result).toContain("<p>ok</p>");
    expect(result.toLowerCase()).not.toContain("script");
    expect(result.toLowerCase()).not.toContain("onclick");
    expect(result.toLowerCase()).not.toContain("onload");
  });

  it("preserves SVG and inline styles needed by mermaid/katex", () => {
    const result = sanitizeHtml(
      '<div class="textora-mermaid"><svg><style>.x{fill:red}</style><path d="M0" style="fill:#fff"></path></svg></div>'
    );
    expect(result).toContain("<svg");
    expect(result).toContain("style=\"fill:#fff\"");
    expect(result.toLowerCase()).toContain("<style>");
    expect(sanitizeHtml('<span class="katex" style="margin-right:0.1667em">x</span>')).toContain(
      "style=\"margin-right:0.1667em\""
    );
  });

  it("strips dangerous CSS expressions from style attributes and style tags", () => {
    expect(sanitizeHtml('<p style="background:url(javascript:alert(1))">x</p>')).not.toContain("javascript");
    expect(sanitizeHtml('<p style="width:expression(alert(1))">x</p>')).not.toContain("expression");
    expect(sanitizeHtml('<style>@import url("https://evil.example/x.css");</style><p>x</p>')).not.toContain("@import");
  });

  it("blocks CSS-escaped payloads that would bypass the style checks", () => {
    // @\69 mport → @import、url(\6a avascript:) → url(javascript:)
    expect(sanitizeHtml('<style>@\\69 mport url("https://evil.example/x.css");</style><p>x</p>')).not.toContain("@import");
    expect(sanitizeHtml('<p style="background:url(\\6a avascript:alert(1))">x</p>')).not.toContain("javascript");
    // 合法数值样式不受影响（KaTeX 依赖）
    expect(sanitizeHtml('<span style="margin-right:0.1667em">x</span>')).toContain("style=\"margin-right:0.1667em\"");
  });

  it("blocks data:image/svg+xml URLs while keeping raster image data URLs", () => {
    // svg+xml 可内嵌脚本且可被 <img>/<use>/<a> 引用：一律拦截
    expect(sanitizeHtml('<a href="data:image/svg+xml,<svg onload=alert(1)>">x</a>')).toContain('href="#"');
    expect(sanitizeHtml('<img src="data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=">')).toContain('src="#"');
    // 位图 data URL 仍放行
    expect(sanitizeHtml('<img src="data:image/png;base64,abc">')).toContain('src="data:image/png;base64,abc"');
  });

  it("neutralizes dangerous URL protocols while preserving image data URLs", () => {
    const result = sanitizeHtml('<a href="javascript:alert(1)">x</a><img src="data:image/png;base64,abc"><img src="data:text/html,<script>x</script>">');
    expect(result).toContain('href="#"');
    expect(result).toContain('src="data:image/png;base64,abc"');
    expect(result).toContain('src="#"');
  });

  it("neutralizes javascript in SVG xlink:href while keeping safe links", () => {
    const result = sanitizeHtml('<svg><a xlink:href="javascript:alert(1)">bad</a><a xlink:href="#frag">ok</a></svg>');
    expect(result).toContain('xlink:href="#"');
    expect(result).toContain('xlink:href="#frag"');
    expect(result.toLowerCase()).not.toContain("javascript");
  });

  it("converts the main-process base64 response into an image data URL", () => {
    expect(inlineImageSource("images/readme.png", "aGVsbG8=")).toBe("data:image/png;base64,aGVsbG8=");
    expect(inlineImageSource("images/photo.jpg?cache=1", "AQI=")).toBe("data:image/jpeg;base64,AQI=");
  });
});
