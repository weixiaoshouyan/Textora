/**
 * Vitest 测试环境 setup
 * Mock Electron IPC 和 localStorage（jsdom 已内置 localStorage）
 */
import { vi } from "vitest";

// Mock window.textora（Electron preload 暴露的接口）
const mockTextora = {
  invoke: vi.fn().mockResolvedValue(null),
  on: vi.fn().mockReturnValue(() => {}),
  emit: vi.fn(),
  dialog: {
    open: vi.fn().mockResolvedValue(null),
    save: vi.fn().mockResolvedValue(null),
    message: vi.fn().mockResolvedValue(0),
  },
  window: {
    minimize: vi.fn(),
    maximizeToggle: vi.fn(),
    close: vi.fn(),
    setTitle: vi.fn(),
  },
};

Object.defineProperty(window, "textora", {
  value: mockTextora,
  writable: true,
});

// Mock matchMedia
Object.defineProperty(window, "matchMedia", {
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
  writable: true,
});
