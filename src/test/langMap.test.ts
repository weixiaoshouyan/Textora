/**
 * 语言/文件类型映射测试（src/main/shared.ts 的 CODE_EXTS / LANG_MAP / kindForExt / langForExt）
 */
import { describe, expect, it } from "vitest";
import { CODE_EXTS, LANG_MAP, kindForExt, langForExt } from "../main/shared";

describe("langForExt covers the expanded language set", () => {
  const cases: Array<[string, string]> = [
    ["php", "php"],
    ["rb", "ruby"],
    ["lua", "lua"],
    ["kt", "kotlin"],
    ["swift", "swift"],
    ["cs", "csharp"],
    ["vue", "vue"],
    ["svelte", "svelte"],
    ["scala", "scala"],
    ["dart", "dart"],
    ["bat", "bat"],
    ["ps1", "ps1"],
    ["ini", "ini"],
    ["cfg", "ini"],
    ["conf", "ini"],
    ["tex", "tex"],
    ["r", "r"],
    ["csv", "csv"],
    ["tsv", "tsv"],
    ["diff", "diff"],
    ["mjs", "javascript"],
    ["cjs", "javascript"],
    ["mts", "typescript"],
    ["cts", "typescript"],
    ["dockerfile", "dockerfile"],
    ["env", "dotenv"],
    ["properties", "properties"],
    ["gql", "graphql"],
    ["log", "plaintext"],
    ["pl", "perl"],
    ["hs", "haskell"],
    ["zig", "zig"],
  ];
  for (const [ext, lang] of cases) {
    it(`${ext} -> ${lang}`, () => {
      expect(langForExt(ext)).toBe(lang);
      // 该语言必须在 Shiki 白名单可用的映射集合里
      expect(LANG_MAP[ext]).toBeDefined();
    });
  }

  it("existing mappings are unchanged", () => {
    expect(langForExt("ts")).toBe("typescript");
    expect(langForExt("py")).toBe("python");
    expect(langForExt("rs")).toBe("rust");
    expect(langForExt("md")).toBe("markdown");
    expect(langForExt("txt")).toBe("plaintext");
  });
});

describe("kindForExt classifies expanded extensions as code", () => {
  const codeExts = ["php", "rb", "lua", "kt", "swift", "cs", "vue", "svelte", "scala", "dart", "bat", "ps1", "ini", "tex", "r", "csv", "tsv", "diff", "mjs", "log"];
  for (const ext of codeExts) {
    it(`${ext} is code`, () => {
      expect(CODE_EXTS.has(ext)).toBe(true);
      expect(kindForExt(ext)).toBe("code");
    });
  }

  it("unknown extensions stay unknown", () => {
    expect(kindForExt("xyzabc")).toBe("unknown");
  });
});
