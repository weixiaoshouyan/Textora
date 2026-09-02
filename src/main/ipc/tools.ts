/**
 * IPC 处理器：外部工具调用 + URL 抓取
 *
 * 安全措施：
 * 1. 调用前通过 validateTool 校验命令和参数
 * 2. 使用 shell: false 避免命令注入
 * 3. 对 cwd 做工作区边界检查
 * 4. spawn 子进程有 30s 超时 + stdout/stderr 1MB 上限，超限 kill 防止 OOM 和挂起
 * 5. fetch_url 协议白名单（仅 http/https）+ 内网/元数据地址黑名单 + 30s 超时 + 5MB 响应上限
 */
import { ipcMain } from 'electron';
import { lookup as dnsLookup } from 'node:dns/promises';
import { execFile } from 'node:child_process';
// cross-spawn：Windows 上 .cmd/.bat（npm、prettier 等）无法被 CreateProcess 直接执行，
// spawn 会 ENOENT；cross-spawn 内部处理该场景并做参数转义，保持 shell: false 语义
import spawn from 'cross-spawn';
import { workspaceRoot } from '../shared';
import { PROCESS_LIMITS, FETCH_LIMITS, DANGEROUS_SHELL_CHARS, RESERVED_COMMANDS, DANGEROUS_ARG_SUBSTRINGS, SHELL_EXEC_FLAGS } from '../constants';
import { checkRateLimit } from '../rateLimiter';
import log from 'electron-log/main';

const MAX_ARGS = 64;
const MAX_ARG_LENGTH = 8192;
const MAX_COMMAND_LENGTH = 1024;

function isPlainObject(v: unknown): v is Record<string, string> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export interface ServerToolInput {
  id?: string;
  name?: string;
  command: string;
  args?: string[];
  cwd?: string;
}

export interface ToolExecutionResult {
  toolId: string;
  toolName: string;
  stdout: string;
  stderr: string;
  exitCode: number;
  duration: number;
}



export function validateToolServerSide(tool: Partial<ServerToolInput> | null | undefined): { valid: boolean; error?: string } {
  if (!tool || typeof tool.command !== 'string' || tool.command.trim() === '') {
    return { valid: false, error: 'Command cannot be empty' };
  }
  if (tool.command.length > MAX_COMMAND_LENGTH) {
    return { valid: false, error: 'Command is too long' };
  }
  if (DANGEROUS_SHELL_CHARS.test(tool.command)) {
    return { valid: false, error: 'Command contains dangerous shell characters' };
  }
  const baseCmd = tool.command.split(/[\\/]/).pop()?.split('.')[0]?.toLowerCase() || '';
  if (RESERVED_COMMANDS.has(baseCmd)) {
    return { valid: false, error: `Command "${baseCmd}" is not allowed for safety` };
  }
  if (tool.args !== undefined && !Array.isArray(tool.args)) {
    return { valid: false, error: 'Arguments must be an array' };
  }
  if ((tool.args?.length ?? 0) > MAX_ARGS) {
    return { valid: false, error: 'Too many arguments' };
  }
  for (const arg of tool.args || []) {
    if (typeof arg !== 'string') {
      return { valid: false, error: 'Arguments must be strings' };
    }
    if (arg.length > MAX_ARG_LENGTH) {
      return { valid: false, error: 'Argument is too long' };
    }
    // 解释器执行标志（-c/-e/--command 等）作为独立参数出现时拒绝：
    // 即使命令本身在白名单内，vars 注入也能把执行标志塞进来
    if (SHELL_EXEC_FLAGS.has(arg.trim())) {
      return { valid: false, error: `Arguments cannot contain shell exec flag "${arg}"` };
    }
    // 检查所有危险子串：命令链接符、命令替换、重定向、换行
    for (const sub of DANGEROUS_ARG_SUBSTRINGS) {
      if (arg.includes(sub)) {
        return { valid: false, error: `Arguments cannot contain "${sub}"` };
      }
    }
  }
  return { valid: true };
}

/**
 * 展开参数中的 $VAR 占位符（vars 由 AI/渲染端提供，不可信任）。
 * 必须先展开再校验：校验展开前参数会绕过 vars 注入的危险内容。
 */
export function expandToolArgs(tool: Partial<ServerToolInput> | null | undefined, vars: Record<string, string>): string[] {
  const safeVars = isPlainObject(vars) ? vars : {};
  return (tool?.args || []).map((arg: string) => {
    let expanded = arg;
    for (const [key, value] of Object.entries(safeVars)) {
      // 转义 key 中的正则元字符，避免 RegExp 构造异常或意外匹配
      const safeKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      // 函数式 replacement：避免值中的 $&/$1 等被 String.replace 特殊插值
      expanded = expanded.replace(new RegExp('\\$' + safeKey, 'g'), () => String(value));
    }
    return expanded;
  });
}

/**
 * SSRF 防护：拒绝访问内网地址、loopback、链路本地、元数据服务
 */
function checkIpv4Octets(octets: number[]): string | null {
  const [a, b] = octets;
  if (octets.some((part) => part < 0 || part > 255)) {
    return 'Invalid IPv4 address';
  }
  if (a === 10) return 'Private IP not allowed';
  if (a === 172 && b >= 16 && b <= 31) return 'Private IP not allowed';
  if (a === 192 && b === 168) return 'Private IP not allowed';
  if (a === 169 && b === 254) return 'Link-local address not allowed (metadata service)';
  if (a === 127) return 'Loopback address not allowed';
  if (a === 0) return 'Reserved address not allowed';
  return null;
}

export function isSafeUrl(raw: string): { ok: boolean; error?: string } {
  let u: URL;
  try { u = new URL(raw); } catch {
    return { ok: false, error: 'Invalid URL' };
  }
  // 协议白名单
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    return { ok: false, error: `Protocol "${u.protocol}" not allowed` };
  }
  const host = u.hostname.toLowerCase();
  // 明确拒绝 localhost / loopback
  if (host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '0.0.0.0') {
    return { ok: false, error: 'Loopback address not allowed' };
  }
  // 数字形式的 IPv4（如 2130706433 或 0x7f000001）会被 DNS 解析为点分地址，
  // 但 URL.hostname 保持原样，绕过了下方点分四段的检查，必须单独拦截
  const decimalIp = host.match(/^(\d+)$/);
  if (decimalIp) {
    const n = Number(decimalIp[1]);
    if (Number.isSafeInteger(n) && n > 0 && n <= 0xffffffff) {
      const octets = [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
      const err = checkIpv4Octets(octets);
      if (err) return { ok: false, error: err };
    }
  }
  const hexIp = host.match(/^0x([0-9a-f]+)$/i);
  if (hexIp) {
    const n = Number.parseInt(hexIp[1], 16);
    if (Number.isSafeInteger(n) && n > 0 && n <= 0xffffffff) {
      const octets = [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
      const err = checkIpv4Octets(octets);
      if (err) return { ok: false, error: err };
    }
  }
  const ipv6Host = host.replace(/^\[|\]$/g, '');
  if (ipv6Host.includes(':')) {
    // IPv6 私有 (fc00::/7) 与链路本地 (fe80::/10)
    if (ipv6Host.startsWith('fc') || ipv6Host.startsWith('fd') || /^(?:fe8|fe9|fea|feb)/i.test(ipv6Host)) {
      return { ok: false, error: 'Private IPv6 not allowed' };
    }
    // 展开为规范 8 组再检查：字符串匹配挡不住 [0::1]（回环）、[0:0:0:0:0:0:0:0]
    // （未指定）、[0:0:0:0:0:ffff:127.0.0.1]（全展开 IPv4-mapped）、[::127.0.0.1] 等变体
    const expanded = expandIpv6(ipv6Host);
    if (!expanded) {
      return { ok: false, error: 'Invalid IPv6 address' };
    }
    const g = expanded.groups;
    // 未指定地址（等效 0.0.0.0）
    if (g.every((x) => x === 0)) {
      return { ok: false, error: 'Unspecified address not allowed' };
    }
    // 回环 ::1（任意写法展开后相同）
    if (g.slice(0, 7).every((x) => x === 0) && g[7] === 1) {
      return { ok: false, error: 'Loopback address not allowed' };
    }
    // IPv4-mapped（::ffff:a.b.c.d / ::ffff:xxxx:xxxx）与 IPv4-compatible（::a.b.c.d）
    // 及任意带点分嵌入的写法：展开后嵌入的 IPv4 必须过 checkIpv4Octets，
    // 否则 [::ffff:127.0.0.1] / [::127.0.0.1] / [::ffff:0:127.0.0.1] 可绕过防内网规则。
    // mapped 规范布局 [0×4, 0, 0xffff, hi, lo]，另有被 Chromium 接受的变体
    // [0×4, 0xffff, 0, hi, lo]（::ffff:0:xxxx 写法），两种都覆盖。
    const isMapped =
      g.slice(0, 4).every((x) => x === 0) &&
      ((g[4] === 0 && g[5] === 0xffff) || (g[4] === 0xffff && g[5] === 0));
    const isCompatible = g.slice(0, 6).every((x) => x === 0) && g[6] !== 0;
    if (expanded.embeddedV4 || isMapped || isCompatible) {
      // IPv4 = 后两组的 32 位拼接
      const v4 = (g[6] << 16) | g[7];
      const octets = [(v4 >>> 24) & 0xff, (v4 >>> 16) & 0xff, (v4 >>> 8) & 0xff, v4 & 0xff];
      const err = checkIpv4Octets(octets);
      if (err) return { ok: false, error: err };
    }
  }
  // 拒绝 IPv4 私有 / 链路本地 / 元数据服务
  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const err = checkIpv4Octets(ipv4.slice(1).map(Number));
    if (err) return { ok: false, error: err };
  }
  return { ok: true };
}

/**
 * 把 IPv6 地址展开为 8 组 16 位十六进制数（处理 :: 压缩与尾部 IPv4 点分嵌入），
 * 供统一检查 loopback / unspecified / IPv4-mapped / IPv4-compatible。
 * 非法输入返回 null。zone id（%eth0）会被剥离。
 */
function expandIpv6(input: string): { groups: number[]; embeddedV4: number[] | null } | null {
  let addr = input.split('%')[0];
  let embeddedV4: number[] | null = null;
  const dotMatch = addr.match(/(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (dotMatch) {
    embeddedV4 = dotMatch[1].split('.').map(Number);
    // octets 合法性校验（0-255）：非法输入视为无效 IPv6
    if (embeddedV4.length !== 4 || embeddedV4.some((o) => !Number.isInteger(o) || o < 0 || o > 255)) {
      return null;
    }
    // 去掉点分部分及可能残留的尾部冒号（"::ffff:127.0.0.1" → "::ffff"），
    // 否则 tail 会解析出空组导致整个地址被误判为 invalid（fail-closed 回归：
    // 公网 IPv4-mapped 地址如 [::ffff:93.184.216.34] 也会被拒绝）
    addr = addr.slice(0, dotMatch.index).replace(/:+$/, '');
  }
  const parts = addr.split('::');
  if (parts.length > 2) return null;
  const head = parts[0] ? parts[0].split(':') : [];
  const tail = parts.length === 2 && parts[1] ? parts[1].split(':') : [];
  const groups: number[] = [];
  for (const h of head) {
    if (!/^[0-9a-f]{1,4}$/i.test(h)) return null;
    groups.push(Number.parseInt(h, 16));
  }
  if (embeddedV4) {
    groups.push((embeddedV4[0] << 8) | embeddedV4[1], (embeddedV4[2] << 8) | embeddedV4[3]);
  }
  for (const t of tail) {
    if (!/^[0-9a-f]{1,4}$/i.test(t)) return null;
    groups.push(Number.parseInt(t, 16));
  }
  const missing = 8 - groups.length;
  if (missing < 0) return null;
  if (parts.length === 2) {
    // :: 压缩：在 head 与 tail（含嵌入 v4）之间补零
    const headLen = head.length;
    const result = groups.slice(0, headLen);
    for (let i = 0; i < missing; i++) result.push(0);
    result.push(...groups.slice(headLen));
    return { groups: result, embeddedV4 };
  }
  if (missing !== 0) return null;
  return { groups, embeddedV4 };
}

/**
 * 在静态检查基础上对域名做 DNS 反查：域名解析到内网/环回地址也拒绝，
 * 覆盖 127.0.0.1.nip.io 这类"域名解析成内网"的绕过。解析失败时放行，
 * 交给 fetch 自身处理（避免因临时 DNS 故障误伤）。
 */
export async function isSafeUrlResolved(raw: string): Promise<{ ok: boolean; error?: string }> {
  const staticCheck = isSafeUrl(raw);
  if (!staticCheck.ok) return staticCheck;
  let u: URL;
  try { u = new URL(raw); } catch {
    return { ok: false, error: 'Invalid URL' };
  }
  const host = u.hostname.replace(/^\[|\]$/g, '');
  // 字面 IP 已由静态检查覆盖（isSafeUrl 对 IPv4/IPv6 字面量做了私有/回环/映射检查）；
  // 只有域名才需要 DNS 反查。注意：IPv6 字面量必然含 ":"，而纯 hex 单标签域名
  // （如 "abc" / "deadbeef"）不含冒号——若把这类域名误判为 IPv6 跳过解析，
  // 攻击者控制 DNS 解析到 127.0.0.1 / 169.254.169.254 即可绕过内网防护
  // （nip.io 类绕过的变体）。
  const looksLikeIpv6Literal = host.includes(':') && /^[0-9a-f:]+$/i.test(host);
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host) || looksLikeIpv6Literal) {
    return { ok: true };
  }
  try {
    const addresses = await dnsLookup(host, { all: true });
    for (const { address, family } of addresses) {
      const probe = family === 6 ? `http://[${address}]/` : `http://${address}/`;
      const check = isSafeUrl(probe);
      if (!check.ok) {
        return { ok: false, error: `Resolved address ${address} is not allowed (${check.error})` };
      }
    }
    return { ok: true };
  } catch {
    return { ok: true };
  }
}

/**
 * External tools are always executed from the active workspace. The model may
 * provide cwd/vars.DIR for display or compatibility, but neither is trusted
 * as an execution boundary. 无工作区时拒绝执行（避免在 Electron 安装目录下运行）。
 */
export function resolveToolCwd(_requestedCwd?: string, _vars?: Record<string, string>): string | null {
  return workspaceRoot;
}

export function registerToolHandlers(): void {
  ipcMain.handle('textora:run_tool', async (_evt, tool: ServerToolInput, vars: Record<string, string>): Promise<ToolExecutionResult> => {
    // 先展开 vars 再校验：vars 值来自 AI/渲染端，不受信任。若先校验后展开，
    // 注入内容（如 vars.X="; powershell ..."）会绕过全部参数检查。
    const expandedTool: Partial<ServerToolInput> = tool
      ? { ...tool, args: expandToolArgs(tool, vars) }
      : tool;
    const validation = validateToolServerSide(expandedTool);
    if (!validation.valid) {
      return {
        toolId: tool?.id || '',
        toolName: tool?.name || '',
        stdout: '',
        stderr: `Blocked: ${validation.error}`,
        exitCode: 1,
        duration: 0,
      };
    }
    // 速率限制检查
    if (!checkRateLimit('textora:run_tool')) {
      log.warn('Rate limit exceeded for textora:run_tool');
      return {
        toolId: tool?.id || '',
        toolName: tool?.name || '',
        stdout: '',
        stderr: 'Blocked: Rate limit exceeded. Please wait before retrying.',
        exitCode: 1,
        duration: 0,
      };
    }
    // vars 必须是普通对象；渲染端可能传 null/数组，防御性兜底为空对象（expandToolArgs 内已处理）
    const safeVars = isPlainObject(vars) ? vars : {};

    const cwd = resolveToolCwd(tool?.cwd, safeVars);
    if (!cwd) {
      return {
        toolId: tool?.id || '',
        toolName: tool?.name || '',
        stdout: '',
        stderr: 'Blocked: No active workspace. Open a folder before running tools.',
        exitCode: 1,
        duration: 0,
      };
    }
    const args = expandedTool?.args || [];

    const startTime = Date.now();
    return new Promise((resolve) => {
      let proc: import('child_process').ChildProcess | undefined;
      let timer: ReturnType<typeof setTimeout> | null = null;
      let sigkillTimer: ReturnType<typeof setTimeout> | null = null;
      let settled = false;

      const finish = (result: { stdout: string; stderr: string; exitCode: number }) => {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        if (sigkillTimer) clearTimeout(sigkillTimer);
        resolve({
          toolId: tool.id || '',
          toolName: tool.name || tool.command,
          stdout: result.stdout,
          stderr: result.stderr,
          exitCode: result.exitCode,
          duration: Date.now() - startTime,
        });
      };

      try {
        // shell: false 防止命令注入；windowsHide 避免 Windows 上闪现控制台窗口。
        // cross-spawn 在 Windows 上自动解析 .cmd/.bat（npm/git 等），无需 shell: true
        proc = spawn(tool.command, args, { cwd, shell: false, windowsHide: true });
        let stdout = '';
        let stderr = '';
        let stdoutTruncated = false;
        let stderrTruncated = false;

        proc.stdout?.on('data', (d: Buffer | string) => {
          if (stdout.length >= PROCESS_LIMITS.OUTPUT_MAX_BYTES) {
          if (!stdoutTruncated) {
            stdoutTruncated = true;
            stderr += `\n[stdout truncated at ${PROCESS_LIMITS.OUTPUT_MAX_BYTES} bytes]`;
          }
          return;
        }
        const chunk = d.toString();
        const remaining = Math.max(0, PROCESS_LIMITS.OUTPUT_MAX_BYTES - stdout.length);
        stdout += chunk.slice(0, remaining);
        if (chunk.length > remaining && !stdoutTruncated) {
          stdoutTruncated = true;
          stderr += `\n[stdout truncated at ${PROCESS_LIMITS.OUTPUT_MAX_BYTES} bytes]`;
        }
        });
        proc.stderr?.on('data', (d: Buffer | string) => {
          if (stderr.length >= PROCESS_LIMITS.OUTPUT_MAX_BYTES) {
            if (!stderrTruncated) {
              stderrTruncated = true;
              stderr = stderr.slice(0, PROCESS_LIMITS.OUTPUT_MAX_BYTES) + `\n[stderr truncated at ${PROCESS_LIMITS.OUTPUT_MAX_BYTES} bytes]`;
            }
            return;
          }
          const chunk = d.toString();
          const remaining = Math.max(0, PROCESS_LIMITS.OUTPUT_MAX_BYTES - stderr.length);
          stderr += chunk.slice(0, remaining);
          if (chunk.length > remaining && !stderrTruncated) {
            stderrTruncated = true;
            stderr += `\n[stderr truncated at ${PROCESS_LIMITS.OUTPUT_MAX_BYTES} bytes]`;
          }
        });
        const child = proc as import('child_process').ChildProcess;
        child.on('close', (exitCode: number | null) => {
          finish({ stdout, stderr, exitCode: exitCode ?? 0 });
        });
        child.on('error', (err: Error) => {
          finish({ stdout: '', stderr: err.message, exitCode: 1 });
        });

        // 超时 kill：先 SIGTERM，5s 后 SIGKILL；两个定时器都在 finish 中清理。
        // Windows 上 kill() 只杀直接子进程，工具可能 fork 孙进程（构建脚本/守护进程），
        // 用 taskkill /T /F 连进程树一起杀，避免残留进程继续占用资源。
        timer = setTimeout(() => {
          const pid = child.pid;
          try { child.kill('SIGTERM'); } catch { /* ignore */ }
          if (pid) {
            // taskkill /T /F 连进程树一起杀；进程可能已退出，失败忽略
            execFile('taskkill', ['/pid', String(pid), '/T', '/F'], { windowsHide: true }, () => {});
          }
          sigkillTimer = setTimeout(() => {
            try { child.kill('SIGKILL'); } catch { /* ignore */ }
          }, PROCESS_LIMITS.SIGKILL_GRACE_MS);
          finish({
            stdout,
            stderr: stderr + `\n[Process killed: timed out after ${PROCESS_LIMITS.TIMEOUT_MS}ms]`,
            exitCode: 124,
          });
        }, PROCESS_LIMITS.TIMEOUT_MS);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        finish({ stdout: '', stderr: msg, exitCode: 1 });
      }
    });
  });

  ipcMain.handle('textora:fetch_url', async (_evt, p: { url: string }) => {
    // 先做 URL 静态校验（协议白名单 / 内网黑名单），非法请求不计入限流配额
    const rawUrl = (typeof p === 'object' && p !== null && typeof p.url === 'string' ? p.url : '');
    const staticSafety = isSafeUrl(rawUrl);
    if (!staticSafety.ok) {
      return `Blocked: ${staticSafety.error}`;
    }
    // 速率限制检查
    if (!checkRateLimit('textora:fetch_url')) {
      log.warn('Rate limit exceeded for textora:fetch_url');
      return 'Blocked: Rate limit exceeded. Please wait before retrying.';
    }
    // DNS 反查：域名解析到内网/环回地址也拒绝
    const dnsSafety = await isSafeUrlResolved(rawUrl);
    if (!dnsSafety.ok) {
      return `Blocked: ${dnsSafety.error}`;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_LIMITS.TIMEOUT_MS);
    try {
      // 手动处理重定向：对每个 Location 都重新做 SSRF 校验，防止初始 URL 合法但重定向到内网
      let currentUrl = rawUrl;
      let resp: Response | null = null;
      const maxRedirects = 5;
      for (let i = 0; i <= maxRedirects; i++) {
        const redirectSafety = await isSafeUrlResolved(currentUrl);
        if (!redirectSafety.ok) {
          return `Blocked: ${redirectSafety.error}`;
        }
        resp = await fetch(currentUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
          },
          signal: controller.signal,
          redirect: 'manual',
        });
        // 3xx 重定向：取出 Location，进入下一轮校验
        if (resp.status >= 300 && resp.status < 400) {
          const location = resp.headers.get('location');
          if (!location) {
            return `Failed to fetch URL: redirect without Location header`;
          }
          currentUrl = new URL(location, currentUrl).toString();
          continue;
        }
        break;
      }
      if (!resp) return 'Failed to fetch URL: no response';
      if (!resp.ok) {
        return `Failed to fetch URL: ${resp.status} ${resp.statusText}`;
      }
      // DNS rebinding TOCTOU 收窄：连接完成、返回内容前再次解析最终主机名，
      // 若任一新解析地址落回内网/环回，丢弃本次响应——防止检查后 DNS 被切换
      // 到 169.254.169.254 等元数据地址并把敏感响应回传给调用方。
      // 连接本身已发生（fetch_url 为 GET，无副作用），但响应数据不会泄漏。
      {
        const finalHost = new URL(currentUrl).hostname.replace(/^\[|\]$/g, '');
        const isLiteralIp = /^\d{1,3}(?:\.\d{1,3}){3}$/.test(finalHost)
          || (finalHost.includes(':') && /^[0-9a-f:]+$/i.test(finalHost));
        if (!isLiteralIp) {
          try {
            const postAddresses = await dnsLookup(finalHost, { all: true });
            for (const { address, family } of postAddresses) {
              const probe = family === 6 ? `http://[${address}]/` : `http://${address}/`;
              const check = isSafeUrl(probe);
              if (!check.ok) {
                return `Blocked: ${address} resolved to a disallowed address after fetch (possible DNS rebinding)`;
              }
            }
          } catch {
            // 复查解析失败：无法确认，放行（fetch 已成功，内容为公网响应）
          }
        }
      }
      // 限制响应体大小，超过 5MB 截断
      const reader = resp.body?.getReader();
      if (!reader) {
        const text = await resp.text();
        return text.length > FETCH_LIMITS.SIZE_MAX_BYTES ? text.slice(0, FETCH_LIMITS.SIZE_MAX_BYTES) + '\n[truncated]' : text;
      }
      const decoder = new TextDecoder();
      let received = 0;
      let result = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        received += value.length;
        if (received > FETCH_LIMITS.SIZE_MAX_BYTES) {
          result += decoder.decode(value.subarray(0, FETCH_LIMITS.SIZE_MAX_BYTES - (received - value.length)));
          result += '\n[truncated]';
          // 主动取消读取：否则连接保持打开直到响应自然结束，超长响应会一直占用连接
          void reader.cancel().catch(() => {});
          break;
        }
        result += decoder.decode(value, { stream: true });
      }
      return result;
    } catch (err: unknown) {
      const name = err instanceof Error ? err.name : '';
      const msg = err instanceof Error ? err.message : String(err);
      if (name === 'AbortError') return 'Failed to fetch URL: timed out';
      return `Failed to fetch URL: ${msg}`;
    } finally {
      clearTimeout(timeoutId);
    }
  });
}
