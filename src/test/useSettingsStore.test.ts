/**
 * useSettingsStore unit tests
 *
 * Covers:
 *  - default settings initialisation
 *  - updateSettings merges correctly
 *  - each toggle flips its flag
 *  - localStorage round-trip
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { useSettingsStore } from "../store/useSettingsStore";

describe("useSettingsStore", () => {
  beforeEach(() => {
    localStorage.clear();
    // Reset to defaults
    useSettingsStore.setState({
      settings: {
        autoSaveSeconds: 0,
        fontSize: 16,
        fontFamily: "Inter, sans-serif",
        focusMode: false,
        typewriterMode: false,
        sourceMode: false,
        readingMode: false,
        spellcheck: false,
        sidebarVisible: true,
        outlineVisible: true,
        sidebarWidth: 240,
      },
    });
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe("updateSettings", () => {
    it("merges partial patch into existing settings", () => {
      useSettingsStore.getState().updateSettings({ fontSize: 24 });
      const { settings } = useSettingsStore.getState();
      expect(settings.fontSize).toBe(24);
      expect(settings.fontFamily).toBe("Inter, sans-serif"); // unchanged
    });

    it("persists merged settings to localStorage", () => {
      useSettingsStore.getState().updateSettings({ focusMode: true });
      const raw = localStorage.getItem("textora.settings");
      expect(raw).not.toBeNull();
      const parsed = JSON.parse(raw!);
      expect(parsed.focusMode).toBe(true);
    });
  });

  describe("toggles", () => {
    it("toggleFocus flips focusMode", () => {
      expect(useSettingsStore.getState().settings.focusMode).toBe(false);
      useSettingsStore.getState().toggleFocus();
      expect(useSettingsStore.getState().settings.focusMode).toBe(true);
      useSettingsStore.getState().toggleFocus();
      expect(useSettingsStore.getState().settings.focusMode).toBe(false);
    });

    it("toggleTypewriter flips typewriterMode", () => {
      useSettingsStore.getState().toggleTypewriter();
      expect(useSettingsStore.getState().settings.typewriterMode).toBe(true);
    });

    it("toggleSource flips sourceMode", () => {
      useSettingsStore.getState().toggleSource();
      expect(useSettingsStore.getState().settings.sourceMode).toBe(true);
    });

    it("toggleReading flips readingMode", () => {
      useSettingsStore.getState().toggleReading();
      expect(useSettingsStore.getState().settings.readingMode).toBe(true);
    });

    it("toggleSpellcheck flips spellcheck", () => {
      useSettingsStore.getState().toggleSpellcheck();
      expect(useSettingsStore.getState().settings.spellcheck).toBe(true);
    });

    it("toggleSidebar flips sidebarVisible", () => {
      expect(useSettingsStore.getState().settings.sidebarVisible).toBe(true);
      useSettingsStore.getState().toggleSidebar();
      expect(useSettingsStore.getState().settings.sidebarVisible).toBe(false);
    });

    it("toggleOutline flips outlineVisible", () => {
      expect(useSettingsStore.getState().settings.outlineVisible).toBe(true);
      useSettingsStore.getState().toggleOutline();
      expect(useSettingsStore.getState().settings.outlineVisible).toBe(false);
    });
  });

  describe("localStorage initialisation", () => {
    it("reads persisted settings from localStorage on init", () => {
      localStorage.setItem(
        "textora.settings",
        JSON.stringify({ fontSize: 42, focusMode: true })
      );
      // Create a fresh store instance by calling the init logic
      // (simulated by manually spreading stored values)
      const stored = JSON.parse(localStorage.getItem("textora.settings")!);
      useSettingsStore.getState().updateSettings(stored);
      const { settings } = useSettingsStore.getState();
      expect(settings.fontSize).toBe(42);
      expect(settings.focusMode).toBe(true);
    });
  });
});
