import { create } from "zustand";
import { SETTINGS_KEY, DEFAULT_SETTINGS, safeReadLocal, safeWriteLocal } from "./helpers";
import type { Settings } from "./types";

export interface SettingsState {
  settings: Settings;
  updateSettings: (patch: Partial<Settings>) => void;
  toggleFocus: () => void;
  toggleTypewriter: () => void;
  toggleSource: () => void;
  toggleReading: () => void;
  toggleSpellcheck: () => void;
  toggleSidebar: () => void;
  toggleOutline: () => void;
  toggleVimMode: () => void;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: { ...DEFAULT_SETTINGS, ...safeReadLocal<Partial<Settings>>(SETTINGS_KEY, {}, (v) => v !== null && typeof v === "object" && !Array.isArray(v)) },
  updateSettings: (patch) => {
    const next = { ...get().settings, ...patch };
    safeWriteLocal(SETTINGS_KEY, next);
    set({ settings: next });
  },
  toggleFocus: () => get().updateSettings({ focusMode: !get().settings.focusMode }),
  toggleTypewriter: () => get().updateSettings({ typewriterMode: !get().settings.typewriterMode }),
  toggleSource: () => get().updateSettings({ sourceMode: !get().settings.sourceMode }),
  toggleReading: () => get().updateSettings({ readingMode: !get().settings.readingMode }),
  toggleSpellcheck: () => get().updateSettings({ spellcheck: !get().settings.spellcheck }),
  toggleSidebar: () => get().updateSettings({ sidebarVisible: !get().settings.sidebarVisible }),
  toggleOutline: () => get().updateSettings({ outlineVisible: !get().settings.outlineVisible }),
  toggleVimMode: () => get().updateSettings({ vimMode: !get().settings.vimMode }),
}));
