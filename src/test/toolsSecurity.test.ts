import { describe, expect, it, vi } from "vitest";
import { setWorkspaceRoot } from "../main/shared";
import {
  isSafeUrl,
  isSafeUrlResolved,
  resolveToolCwd,
  validateToolServerSide,
  expandToolArgs,
} from "../main/ipc/tools";

const { lookupMock } = vi.hoisted(() => ({
  lookupMock: vi.fn(),
}));

vi.mock("node:dns/promises", () => ({
  default: { lookup: lookupMock },
  lookup: lookupMock,
}));

describe("tool execution security", () => {
  it("rejects shell metacharacters and destructive commands server-side", () => {
    expect(validateToolServerSide({ command: "echo", args: ["hello"] })).toEqual({ valid: true });
    expect(validateToolServerSide({ command: "rm", args: ["-rf", "."] }).valid).toBe(false);
    expect(validateToolServerSide({ command: "git", args: ["status", "&&", "whoami"] }).valid).toBe(false);
  });

  it("rejects package managers and code-execution carriers (npx/git/awk/find/make)", () => {
    expect(validateToolServerSide({ command: "npm", args: ["test"] }).valid).toBe(false);
    expect(validateToolServerSide({ command: "npx", args: ["--yes", "evil-pkg"] }).valid).toBe(false);
    expect(validateToolServerSide({ command: "git", args: ["status"] }).valid).toBe(false);
    expect(validateToolServerSide({ command: "find", args: [".", "-exec", "rm", "{}", ";"] }).valid).toBe(false);
    expect(validateToolServerSide({ command: "awk", args: ["BEGIN{system(\"id\")}"] }).valid).toBe(false);
    expect(validateToolServerSide({ command: "make", args: ["install"] }).valid).toBe(false);
    expect(validateToolServerSide({ command: "wsl", args: ["bash", "-c", "id"] }).valid).toBe(false);
  });

  it("rejects shell exec flags as standalone arguments", () => {
    expect(validateToolServerSide({ command: "echo", args: ["-c", "whoami"] }).valid).toBe(false);
    expect(validateToolServerSide({ command: "echo", args: ["/c", "whoami"] }).valid).toBe(false);
    expect(validateToolServerSide({ command: "echo", args: ["--eval", "1+1"] }).valid).toBe(false);
    expect(validateToolServerSide({ command: "echo", args: ["-Command", "Get-Process"] }).valid).toBe(false);
  });

  it("blocks vars injection after expansion (expand-then-validate)", () => {
    const tool = { command: "echo", args: ["$FILE", "$DIR"] };
    // 合法展开
    expect(expandToolArgs(tool, { FILE: "a.md", DIR: "C:/ws" })).toEqual(["a.md", "C:/ws"]);
    // 注入命令链接符：展开后的参数必须被校验拒绝
    const injected = expandToolArgs(tool, { FILE: "a.md; powershell -c whoami", DIR: "." });
    expect(validateToolServerSide({ ...tool, args: injected }).valid).toBe(false);
    // 注入解释器执行标志
    const flagInjected = expandToolArgs({ command: "echo", args: ["$X"] }, { X: "-c" });
    expect(validateToolServerSide({ command: "echo", args: flagInjected }).valid).toBe(false);
    // 注入命令替换 $(...)：展开后命中危险子串黑名单
    const subInjected = expandToolArgs({ command: "echo", args: ["$X"] }, { X: "$(id)" });
    expect(validateToolServerSide({ command: "echo", args: subInjected }).valid).toBe(false);
  });

  it("handles malformed vars input defensively", () => {
    expect(expandToolArgs({ command: "echo", args: ["$A"] }, null as unknown as Record<string, string>)).toEqual(["$A"]);
    // key 含正则元字符（点号）时按字面匹配
    expect(expandToolArgs({ command: "echo", args: ["$A.B"] }, { "A.B": "x" })).toEqual(["x"]);
  });

  it("rejects oversized commands and argument lists", () => {
    expect(validateToolServerSide({ command: "echo", args: Array.from({ length: 100 }, () => "x") }).valid).toBe(false);
    expect(validateToolServerSide({ command: "echo", args: ["y".repeat(9000)] }).valid).toBe(false);
    expect(validateToolServerSide({ command: "z".repeat(2000) }).valid).toBe(false);
  });

  it("accepts only http(s) URLs and blocks local/private destinations", () => {
    expect(isSafeUrl("https://example.com").ok).toBe(true);
    expect(isSafeUrl("file:///etc/passwd").ok).toBe(false);
    expect(isSafeUrl("http://127.0.0.1:3000").ok).toBe(false);
    expect(isSafeUrl("http://192.168.1.10").ok).toBe(false);
    expect(isSafeUrl("http://[::ffff:127.0.0.1]").ok).toBe(false);
    expect(isSafeUrl("http://999.1.1.1").ok).toBe(false);
  });

  it("blocks IPv6-mapped and unspecified addresses (SSRF bypass variants)", () => {
    // IPv4-mapped 十六进制形式：::ffff:7f00:1 == 127.0.0.1
    expect(isSafeUrl("http://[::ffff:7f00:1]/").ok).toBe(false);
    // IPv4-mapped 点分形式映射到私有网段
    expect(isSafeUrl("http://[::ffff:10.0.0.1]/").ok).toBe(false);
    // 未指定地址（等效 0.0.0.0）
    expect(isSafeUrl("http://[::]/").ok).toBe(false);
    expect(isSafeUrl("http://[0:0:0:0:0:0:0:0]/").ok).toBe(false);
    expect(isSafeUrl("http://[0::]/").ok).toBe(false);
    // 回环地址（各种写法）
    expect(isSafeUrl("http://[::1]/").ok).toBe(false);
    expect(isSafeUrl("http://[0:0:0:0:0:0:0:1]/").ok).toBe(false);
    expect(isSafeUrl("http://[0::1]/").ok).toBe(false);
    // IPv4-compatible 与全展开 IPv4-mapped 变体
    expect(isSafeUrl("http://[::127.0.0.1]/").ok).toBe(false);
    expect(isSafeUrl("http://[::7f00:1]/").ok).toBe(false);
    expect(isSafeUrl("http://[0:0:0:0:0:ffff:127.0.0.1]/").ok).toBe(false);
    expect(isSafeUrl("http://[::ffff:0:127.0.0.1]/").ok).toBe(false);
    // 合法公网 IPv6 放行
    expect(isSafeUrl("http://[2606:4700:4700::1111]/").ok).toBe(true);
    // 公网 IPv4-mapped 放行（fail-closed 回归修复；私网/回环仍被 mapped 检查拒绝）
    expect(isSafeUrl("http://[::ffff:93.184.216.34]/").ok).toBe(true);
    // 非法 octet 的嵌入形式拒绝
    expect(isSafeUrl("http://[::ffff:999.1.1.1]/").ok).toBe(false);
  });

  it("blocks numeric and hex IPv4 forms that bypass dotted-quad checks", () => {
    // 2130706433 == 127.0.0.1，0x7f000001 同理
    expect(isSafeUrl("http://2130706433/").ok).toBe(false);
    expect(isSafeUrl("http://0x7f000001/").ok).toBe(false);
    // 2852039166 == 169.254.169.254（云元数据服务）
    expect(isSafeUrl("http://0xA9FEA9FE/").ok).toBe(false);
  });

  it("rejects hostnames that resolve to private or loopback addresses", async () => {
    lookupMock.mockReset();
    // 域名被解析到内网/环回（DNS rebinding 场景）
    lookupMock.mockResolvedValueOnce([{ address: "127.0.0.1", family: 4 }]);
    expect((await isSafeUrlResolved("http://internal.evil.example/")).ok).toBe(false);
    lookupMock.mockResolvedValueOnce([{ address: "10.0.0.5", family: 4 }]);
    expect((await isSafeUrlResolved("http://cloud.internal/")).ok).toBe(false);
  });

  it("accepts hostnames that resolve to public addresses", async () => {
    lookupMock.mockReset();
    lookupMock.mockResolvedValueOnce([{ address: "93.184.216.34", family: 4 }]);
    expect((await isSafeUrlResolved("https://example.com/")).ok).toBe(true);
  });

  it("always resolves tool cwd to the configured workspace root", () => {
    setWorkspaceRoot("C:\\workspace");
    expect(resolveToolCwd("C:\\outside", { DIR: "C:\\other" })).toBe("C:\\workspace");
    setWorkspaceRoot(null);
  });
});
