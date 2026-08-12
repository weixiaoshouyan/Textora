/**
 * rendererLogger 单元测试
 *
 * 验证：
 * 1. window.textora.log 存在时，调用 bridge.log 转发
 * 2. window.textora 不存在时，降级到 console（不抛错）
 * 3. installGlobalErrorHandlers 安装的钩子能捕获 error / unhandledrejection
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { rlog, installGlobalErrorHandlers } from "../rendererLogger";

describe("rendererLogger", () => {
  let originalTextora: any;
  let consoleSpy: { log: ReturnType<typeof vi.spyOn>; warn: ReturnType<typeof vi.spyOn>; error: ReturnType<typeof vi.spyOn> };

  beforeEach(() => {
    originalTextora = (window as any).textora;
    consoleSpy = {
      log: vi.spyOn(console, "log").mockImplementation(() => {}),
      warn: vi.spyOn(console, "warn").mockImplementation(() => {}),
      error: vi.spyOn(console, "error").mockImplementation(() => {}),
    };
  });

  afterEach(() => {
    (window as any).textora = originalTextora;
    vi.restoreAllMocks();
  });

  describe("rlog（带 bridge）", () => {
    it("info 应调用 bridge.log('info', ...)", () => {
      const logFn = vi.fn();
      (window as any).textora = { log: logFn };
      rlog.info("hello", { a: 1 });
      expect(logFn).toHaveBeenCalledWith("info", "hello", { a: 1 });
    });

    it("warn 应调用 bridge.log('warn', ...)", () => {
      const logFn = vi.fn();
      (window as any).textora = { log: logFn };
      rlog.warn("warning");
      expect(logFn).toHaveBeenCalledWith("warn", "warning", undefined);
    });

    it("error 应调用 bridge.log('error', ...)", () => {
      const logFn = vi.fn();
      (window as any).textora = { log: logFn };
      rlog.error("crashed", new Error("x"));
      expect(logFn).toHaveBeenCalledWith("error", "crashed", expect.any(Error));
    });
  });

  describe("rlog（无 bridge 时降级）", () => {
    it("应降级到 console.log 不抛错", () => {
      delete (window as any).textora;
      expect(() => rlog.info("test")).not.toThrow();
      expect(consoleSpy.log).toHaveBeenCalled();
    });

    it("warn 应降级到 console.warn", () => {
      delete (window as any).textora;
      rlog.warn("test");
      expect(consoleSpy.warn).toHaveBeenCalled();
    });

    it("error 应降级到 console.error", () => {
      delete (window as any).textora;
      rlog.error("test");
      expect(consoleSpy.error).toHaveBeenCalled();
    });

    it("bridge.log 抛错时应静默吞掉（不传播）", () => {
      (window as any).textora = {
        log: () => { throw new Error("bridge broken"); },
      };
      expect(() => rlog.info("test")).not.toThrow();
    });
  });

  describe("installGlobalErrorHandlers", () => {
    it("应捕获 window 'error' 事件并转发到 rlog", () => {
      const logFn = vi.fn();
      (window as any).textora = { log: logFn };
      installGlobalErrorHandlers();

      const event = new ErrorEvent("error", {
        message: "test error",
        filename: "test.js",
        lineno: 10,
        colno: 5,
        error: new Error("underlying"),
      });
      window.dispatchEvent(event);

      expect(logFn).toHaveBeenCalledWith(
        "error",
        "Uncaught error",
        expect.objectContaining({ message: "test error", filename: "test.js", line: 10 })
      );
    });

    it("应捕获 unhandledrejection 事件并转发到 rlog", async () => {
      const logFn = vi.fn();
      (window as any).textora = { log: logFn };
      installGlobalErrorHandlers();

      // 用一个已捕获的 promise 构造事件，避免污染全局未处理 rejection
      const reason = new Error("rejected");
      const promise = Promise.reject(reason);
      // 立即 attach catch 防止 unhandledrejection 污染测试运行时
      promise.catch(() => {});

      const event = new PromiseRejectionEvent("unhandledrejection", {
        promise,
        reason,
      });
      window.dispatchEvent(event);

      // 让 microtask 跑一下
      await Promise.resolve();

      expect(logFn).toHaveBeenCalledWith(
        "error",
        "Unhandled promise rejection",
        expect.objectContaining({})
      );
    });
  });
});
