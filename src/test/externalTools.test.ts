/**
 * externalTools.ts 单元测试
 */
import { describe, it, expect } from "vitest";
import { validateTool, expandArgs, getCwd, type ExternalTool } from "../editor/externalTools";

describe("externalTools", () => {
  describe("validateTool", () => {
    it("应接受合法工具", () => {
      const tool: ExternalTool = {
        id: "test",
        name: "Test",
        command: "echo",
        args: ["--write", "$FILE"],
        cwd: "$DIR",
      };
      expect(validateTool(tool)).toEqual({ valid: true });
    });

    it("应拒绝空命令", () => {
      const tool: ExternalTool = {
        id: "test",
        name: "Test",
        command: "",
        args: [],
        cwd: "",
      };
      const result = validateTool(tool);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("empty");
    });

    it("应拒绝含危险 shell 字符的命令", () => {
      const tool: ExternalTool = {
        id: "test",
        name: "Test",
        command: "rm -rf /; echo hacked",
        args: [],
        cwd: "",
      };
      const result = validateTool(tool);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("dangerous");
    });

    it("应拒绝 Windows 保留命令", () => {
      const tool: ExternalTool = {
        id: "test",
        name: "Test",
        command: "format",
        args: ["C:"],
        cwd: "",
      };
      const result = validateTool(tool);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("not allowed");
    });

    it("应拒绝含命令链的操作符的参数", () => {
      const tool: ExternalTool = {
        id: "test",
        name: "Test",
        command: "echo",
        args: ["status", "&&", "rm", "-rf", "/"],
        cwd: "",
      };
      const result = validateTool(tool);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("危险字符");
    });

    it("应接受带路径的命令", () => {
      const tool: ExternalTool = {
        id: "test",
        name: "Test",
        command: "/usr/bin/echo",
        args: ["status"],
        cwd: "$DIR",
      };
      expect(validateTool(tool)).toEqual({ valid: true });
    });
  });

  describe("expandArgs", () => {
    it("应展开变量", () => {
      const args = ["$FILE", "--format"];
      const vars = { FILE: "/path/to/file.ts", DIR: "/path/to" };
      expect(expandArgs(args, vars)).toEqual(["/path/to/file.ts", "--format"]);
    });

    it("应保留未知变量", () => {
      const args = ["$UNKNOWN", "--flag"];
      const vars = { FILE: "/path/to/file.ts" };
      expect(expandArgs(args, vars)).toEqual(["$UNKNOWN", "--flag"]);
    });

    it("应处理空 args", () => {
      expect(expandArgs([], {})).toEqual([]);
    });
  });

  describe("getCwd", () => {
    it("应展开 $DIR 变量", () => {
      const vars = { DIR: "/project/root" };
      expect(getCwd("$DIR", vars)).toBe("/project/root");
    });

    it("应返回绝对路径", () => {
      const vars = { DIR: "/project/root" };
      expect(getCwd("/absolute/path", vars)).toBe("/absolute/path");
    });

    it("空模板应回退到 DIR", () => {
      const vars = { DIR: "/project/root" };
      expect(getCwd("", vars)).toBe("/project/root");
    });

    it("未知变量应回退到 process.cwd", () => {
      const vars = { DIR: "/project/root" };
      expect(getCwd("$UNKNOWN", vars)).toBe(process.cwd());
    });
  });
});
