/**
 * 多格式查看器测试：CSV 解析器边界、JSON 树构建边界、扩展名路由。
 */
import { describe, expect, it } from "vitest";
import { parseCsv, detectDelimiter } from "../editor/viewers/CsvViewer";
import { buildJsonNodes } from "../editor/viewers/JsonViewer";
import { extOf, hasSpecialViewer } from "../editor/viewers";

describe("detectDelimiter", () => {
  it("detects comma as default", () => {
    expect(detectDelimiter("a,b,c\n1,2,3")).toBe(",");
  });
  it("detects tab for TSV", () => {
    expect(detectDelimiter("a\tb\tc\n1\t2\t3")).toBe("\t");
  });
  it("detects semicolon", () => {
    expect(detectDelimiter("a;b;c\n1;2;3")).toBe(";");
  });
  it("falls back to comma when ambiguous", () => {
    expect(detectDelimiter("single column")).toBe(",");
  });
});

describe("parseCsv", () => {
  it("parses simple rows", () => {
    expect(parseCsv("a,b,c\n1,2,3", ",")).toEqual([
      ["a", "b", "c"],
      ["1", "2", "3"],
    ]);
  });

  it("handles quoted fields containing delimiters", () => {
    const rows = parseCsv('name,note\n"Alice, A","hello, world"', ",");
    expect(rows[1]).toEqual(["Alice, A", "hello, world"]);
  });

  it("handles escaped quotes inside quoted fields", () => {
    const rows = parseCsv('text\n"say ""hi"""', ",");
    expect(rows[1]).toEqual(['say "hi"']);
  });

  it("handles embedded newlines inside quoted fields", () => {
    const rows = parseCsv('a,b\n"line1\nline2",x', ",");
    expect(rows).toEqual([
      ["a", "b"],
      ["line1\nline2", "x"],
    ]);
  });

  it("handles CRLF line endings", () => {
    const rows = parseCsv("a,b\r\n1,2\r\n3,4", ",");
    expect(rows).toEqual([
      ["a", "b"],
      ["1", "2"],
      ["3", "4"],
    ]);
  });

  it("returns the last row without trailing newline", () => {
    expect(parseCsv("a\n1", ",")).toEqual([["a"], ["1"]]);
  });

  it("keeps empty trailing fields", () => {
    expect(parseCsv("a,b,\n1,,3", ",")).toEqual([
      ["a", "b", ""],
      ["1", "", "3"],
    ]);
  });

  it("auto-detects tab delimiter by default", () => {
    expect(parseCsv("a\tb\n1\t2")[1]).toEqual(["1", "2"]);
  });
});

describe("buildJsonNodes", () => {
  it("builds a flat node list with types", () => {
    const { nodes, truncated } = buildJsonNodes({ a: 1, b: "x", c: true, d: null });
    expect(truncated).toBe(false);
    const byKey = Object.fromEntries(nodes.map((n) => [n.key, n]));
    expect(byKey.a.type).toBe("number");
    expect(byKey.b.type).toBe("string");
    expect(byKey.c.type).toBe("boolean");
    expect(byKey.d.type).toBe("null");
  });

  it("handles arrays and nested objects", () => {
    const { nodes } = buildJsonNodes({ list: [{ id: 1 }, { id: 2 }] });
    const list = nodes.find((n) => n.key === "list");
    expect(list?.type).toBe("array");
    expect(list?.childCount).toBe(2);
    // 深度优先：list（depth 1）之后是两个对象元素（depth 2）
    const itemNodes = nodes.filter((n) => n.type === "object" && n.depth === 2);
    expect(itemNodes.length).toBe(2);
  });

  it("caps node count and reports truncation", () => {
    const big = Array.from({ length: 100 }, (_, i) => ({ [`k${i}`]: i }));
    const { nodes, truncated } = buildJsonNodes(big, 50);
    expect(nodes.length).toBeLessThanOrEqual(50);
    expect(truncated).toBe(true);
  });

  it("stringifies string values with quotes", () => {
    const { nodes } = buildJsonNodes("hello");
    const root = nodes[0];
    expect(root.key).toBe("");
    expect(root.value).toBe('"hello"');
  });
});

describe("viewer routing helpers", () => {
  it("extracts lowercased extension", () => {
    expect(extOf("C:/docs/data.CSV")).toBe("csv");
    expect(extOf("C:/docs/readme")).toBe("");
    expect(extOf("C:/docs/archive.tar.gz")).toBe("gz");
    expect(extOf(null)).toBe("");
  });

  it("flags files with dedicated viewers", () => {
    expect(hasSpecialViewer("a.csv")).toBe(true);
    expect(hasSpecialViewer("a.tsv")).toBe(true);
    expect(hasSpecialViewer("a.json")).toBe(true);
    expect(hasSpecialViewer("a.jsonc")).toBe(true);
    expect(hasSpecialViewer("a.pdf")).toBe(true);
    expect(hasSpecialViewer("a.md")).toBe(false);
    expect(hasSpecialViewer("a.ts")).toBe(false);
  });
});
