/**
 * Plugin API - extension system for Textora
 * 
 * Plugins can:
 * - Register commands (palette actions)
 * - Subscribe to editor events (content change, save, cursor move)
 * - Add status bar items
 * - Add sidebar panels
 * 
 * Plugin structure:
 * {
 *   id: string;
 *   name: string;
 *   version: string;
 *   activate: (ctx: PluginContext) => void | (() => void);
 * }
 */

export interface PluginContext {
  // Register a command that appears in the command palette
  registerCommand: (cmd: { id: string; label: string; execute: () => void }) => void;
  // Subscribe to editor content changes
  onContentChange: (cb: (content: string) => void) => () => void;
  // Subscribe to file save events
  onSave: (cb: (path: string) => void) => () => void;
  // Add a status bar item
  addStatusBarItem: (item: { position: "left" | "right"; text: string; onClick?: () => void }) => () => void;
  // Log to the main process log
  log: (message: string) => void;
}

interface Plugin {
  id: string;
  name: string;
  version: string;
  activate: (ctx: PluginContext) => void | (() => void);
  deactivate?: () => void;
}

const PLUGINS_KEY = "textora.plugins";

// Registry of active plugins
const activePlugins: Map<string, { plugin: Plugin; cleanup?: () => void }> = new Map();
const pluginCommands: Map<string, { id: string; label: string; execute: () => void }> = new Map();
const contentChangeCallbacks: Set<(content: string) => void> = new Set();
const saveCallbacks: Set<(path: string) => void> = new Set();

export function getPluginCommands(): { id: string; label: string; execute: () => void }[] {
  return Array.from(pluginCommands.values());
}

export function executePluginCommand(id: string): void {
  const cmd = pluginCommands.get(id);
  if (cmd) cmd.execute();
}

export function onContentChange(cb: (content: string) => void): () => void {
  contentChangeCallbacks.add(cb);
  return () => contentChangeCallbacks.delete(cb);
}

export function onSave(cb: (path: string) => void): () => void {
  saveCallbacks.add(cb);
  return () => saveCallbacks.delete(cb);
}

export function notifyContentChange(content: string): void {
  contentChangeCallbacks.forEach(cb => { try { cb(content); } catch {} });
}

export function notifySave(path: string): void {
  saveCallbacks.forEach(cb => { try { cb(path); } catch {} });
}

export function getInstalledPlugins(): string[] {
  try {
    return JSON.parse(localStorage.getItem(PLUGINS_KEY) || "[]");
  } catch {
    return [];
  }
}

export function installPlugin(id: string): void {
  const installed = getInstalledPlugins();
  if (!installed.includes(id)) {
    installed.push(id);
    localStorage.setItem(PLUGINS_KEY, JSON.stringify(installed));
  }
}

export function uninstallPlugin(id: string): void {
  const installed = getInstalledPlugins().filter(p => p !== id);
  localStorage.setItem(PLUGINS_KEY, JSON.stringify(installed));
  // Deactivate if active
  deactivatePlugin(id);
}

// Plugin registry - built-in and third-party plugins register here
const pluginRegistry: Map<string, Plugin> = new Map();

export function registerPlugin(plugin: Plugin): void {
  pluginRegistry.set(plugin.id, plugin);
}

export function activatePlugin(id: string): boolean {
  if (activePlugins.has(id)) return true;
  const plugin = pluginRegistry.get(id);
  if (!plugin) return false;

  try {
    const ctx: PluginContext = {
      registerCommand: (cmd) => {
        pluginCommands.set(cmd.id, { id, label: cmd.label, execute: cmd.execute });
      },
      onContentChange: (cb) => onContentChange(cb),
      onSave: (cb) => onSave(cb),
      addStatusBarItem: (item) => {
        // Could emit an event for the UI to pick up
        console.log("[Plugin] Status bar item added:", item.text);
        return () => {};
      },
      log: (msg) => {
        console.log(`[${plugin.name}] ${msg}`);
      },
    };

    const cleanup = plugin.activate(ctx);
    activePlugins.set(id, { plugin, cleanup: typeof cleanup === "function" ? cleanup : undefined });
    return true;
  } catch (err) {
    console.error("[Plugin] Failed to activate:", id, err);
    return false;
  }
}

export function deactivatePlugin(id: string): void {
  const entry = activePlugins.get(id);
  if (entry) {
    try { entry.cleanup?.(); } catch {}
    activePlugins.delete(id);
    // Remove commands from this plugin
    for (const [cmdId, cmd] of pluginCommands) {
      if (cmd.id === id) pluginCommands.delete(cmdId);
    }
  }
}

export function getActivePlugins(): Plugin[] {
  return Array.from(activePlugins.values()).map(e => e.plugin);
}

// Auto-activate installed plugins on init
export function initPlugins(): void {
  const installed = getInstalledPlugins();
  for (const id of installed) {
    activatePlugin(id);
  }
}
