/**
 * 导出 DOM 净化测试：cleanDomForExport
 * 覆盖：折叠展开、编辑器 UI 剔除、代码块渲染层保留、原 DOM 不被修改、正文/公式/图表保留。
 */
import { describe, expect, it } from "vitest";
import { cleanDomForExport } from "../editor/exporter";

function makeDoc(inner: string): HTMLElement {
  const root = document.createElement("div");
  root.innerHTML = inner;
  return root;
}

describe("cleanDomForExport", () => {
  it("expands folded headings and restores hidden siblings", () => {
    const root = makeDoc(`
      <h2 data-textora-folded="true"><span class="textora-fold-btn">▶</span>Title</h2>
      <p style="display: none">hidden content</p>
      <p style="display: none">more hidden</p>
      <h2>Next</h2>
    `);
    const html = cleanDomForExport(root);
    expect(html).not.toContain("data-textora-folded");
    expect(html).not.toContain("display: none");
    expect(html).toContain("hidden content");
    expect(html).toContain("more hidden");
    expect(html).not.toContain("textora-fold-btn");
  });

  it("expands folded code blocks (restores max-height)", () => {
    const root = makeDoc(
      `<pre data-textora-folded="true"><code style="max-height: 0px; overflow: hidden;">code body</code></pre>`
    );
    const html = cleanDomForExport(root);
    expect(html).not.toContain("max-height: 0px");
    expect(html).toContain("code body");
  });

  it("keeps only the shiki render inside codeblock wraps", () => {
    const root = makeDoc(`
      <div class="textora-codeblock-wrap" data-lang="ts">
        <div class="textora-code-render"><pre class="textora-shiki-pre"><code>highlighted</code></pre></div>
        <pre><code class="language-ts">original source</code></pre>
        <div class="textora-code-footer">
          <div class="textora-code-lang-selector"><button class="textora-code-lang-btn">ts</button></div>
          <button class="textora-code-copy-btn">copy</button>
        </div>
      </div>
    `);
    const html = cleanDomForExport(root);
    expect(html).toContain("highlighted");
    expect(html).not.toContain("original source");
    expect(html).not.toContain("textora-codeblock-wrap");
    expect(html).not.toContain("textora-code-footer");
    expect(html).not.toContain("textora-code-copy-btn");
    expect(html).not.toContain("textora-code-lang-selector");
  });

  it("falls back to the original pre when no shiki render exists", () => {
    const root = makeDoc(`
      <div class="textora-codeblock-wrap">
        <pre><code class="language-ts">original source</code></pre>
        <div class="textora-code-footer"></div>
      </div>
    `);
    const html = cleanDomForExport(root);
    expect(html).toContain("original source");
    expect(html).not.toContain("textora-codeblock-wrap");
    expect(html).not.toContain("textora-code-footer");
  });

  it("preserves normal content, math and mermaid nodes", () => {
    const root = makeDoc(`
      <p>hello <strong>world</strong></p>
      <table><tr><td>cell</td></tr></table>
      <div class="textora-math-block">E=mc2</div>
      <div class="textora-mermaid"><svg><path d="M0 0"></path></svg></div>
    `);
    const html = cleanDomForExport(root);
    expect(html).toContain("hello");
    expect(html).toContain("<strong>world</strong>");
    expect(html).toContain("cell");
    expect(html).toContain("textora-math-block");
    expect(html).toContain("textora-mermaid");
  });

  it("does not mutate the original DOM (operates on a clone)", () => {
    const root = makeDoc(`<h2 data-textora-folded="true">T</h2><p style="display: none">x</p>`);
    cleanDomForExport(root);
    expect(root.querySelector("[data-textora-folded]")).toBeTruthy();
    expect((root.querySelector("p") as HTMLElement).style.display).toBe("none");
  });
});
