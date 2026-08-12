import { beforeAll, beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const { handlers, showSaveDialog, showOpenDialog } = vi.hoisted(() => ({
  handlers: new Map<string, (...args: any[]) => unknown>(),
  showSaveDialog: vi.fn(),
  showOpenDialog: vi.fn(),
}));

vi.mock("electron", () => ({
  BrowserWindow: class BrowserWindow {},
  ipcMain: {
    handle: vi.fn((channel: string, handler: (...args: any[]) => unknown) => {
      handlers.set(channel, handler);
    }),
  },
  dialog: {
    showOpenDialog,
    showSaveDialog,
    showMessageBox: vi.fn(),
  },
  shell: {
    showItemInFolder: vi.fn(),
  },
  app: {
    getPath: vi.fn(() => "C:/Users/test/AppData/Roaming/Textora"),
  },
}));

import { registerFileHandlers } from "../main/ipc/files";
import { registerDialogHandlers } from "../main/ipc/dialogs";
import { setWorkspaceRoot } from "../main/shared";
import { FILE_SIZE_LIMITS } from "../main/constants";

async function invokeRegistered(channel: string, ...args: unknown[]): Promise<unknown> {
  const handler = handlers.get(`textora:${channel}`);
  if (!handler) throw new Error(`No handler registered for ${channel}`);
  return handler({}, ...args);
}

describe("file IPC security boundary", () => {
  let root: string;
  let outside: string;

  beforeAll(async () => {
    registerFileHandlers({ getMainWindow: () => null, dirWatchers: new Map() });
    registerDialogHandlers({ getMainWindow: () => ({} as any) });
  });

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "textora-root-"));
    outside = await mkdtemp(join(tmpdir(), "textora-outside-"));
    setWorkspaceRoot(root);
  });

  afterEach(async () => {
    setWorkspaceRoot(null);
    await rm(root, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  });

  it("rejects a workspace root that is not a directory", async () => {
    const filePath = join(outside, "workspace.txt");
    await writeFile(filePath, "not a directory");

    await expect(invokeRegistered("set_workspace_root", filePath))
      .rejects.toMatchObject({ code: "NOT_DIRECTORY" });
  });

  it("rejects is_directory checks outside the workspace", async () => {
    await expect(invokeRegistered("is_directory", outside))
      .rejects.toMatchObject({ code: "WORKSPACE_ESCAPE" });
  });

  it("rejects text writes over the byte limit", async () => {
    await expect(invokeRegistered("write_text_file", join(root, "large.md"), "x".repeat(FILE_SIZE_LIMITS.TEXT_MAX_SIZE + 1)))
      .rejects.toMatchObject({ code: "SIZE_LIMIT" });
  });

  it("rejects binary writes over the byte limit", async () => {
    await expect(invokeRegistered("write_binary_file", join(root, "large.bin"), Buffer.alloc(FILE_SIZE_LIMITS.BINARY_MAX_SIZE + 1)))
      .rejects.toMatchObject({ code: "SIZE_LIMIT" });
  });

  it("rejects oversized images before reading them", async () => {
    const imagePath = join(root, "large.png");
    await writeFile(imagePath, Buffer.alloc(FILE_SIZE_LIMITS.IMAGE_MAX_SIZE + 1));

    await expect(invokeRegistered("open_file", imagePath))
      .rejects.toMatchObject({ code: "SIZE_LIMIT" });
  });

  it("rejects save dialog targets outside the workspace", async () => {
    showSaveDialog.mockResolvedValueOnce({ canceled: false, filePath: join(outside, "escape.md") });

    await expect(invokeRegistered("dialog_save", {}))
      .rejects.toMatchObject({ code: "WORKSPACE_ESCAPE" });
  });

  it("rejects default file dialog selections outside the workspace", async () => {
    showOpenDialog.mockResolvedValueOnce({ canceled: false, filePaths: [join(outside, "escape.md")] });

    await expect(invokeRegistered("dialog_open", {}))
      .rejects.toMatchObject({ code: "WORKSPACE_ESCAPE" });
  });

});
