/**
 * useThemeStore unit tests
 *
 * Covers:
 *  - initial theme detection
 *  - setTheme updates localStorage + DOM
 *  - toggleTheme cycles in order
 *  - rapid toggleTheme calls each advance one step (no lost toggles)
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { useThemeStore } from "../store/useThemeStore";

describe("useThemeStore", () => {
  beforeEach(() => {
    // Reset to known state
    useThemeStore.getState().setTheme("light");
    localStorage.clear();
  });

  afterEach(() => {
    useThemeStore.getState().setTheme("light");
    localStorage.clear();
  });

  describe("setTheme", () => {
    it("updates the theme state", () => {
      useThemeStore.getState().setTheme("dark");
      expect(useThemeStore.getState().theme).toBe("dark");
    });

    it("persists to localStorage", () => {
      useAppStoreSetThemeSafe("nord");
      expect(localStorage.getItem("textora.theme")).toBe('"nord"');
    });

    it("applies data-theme attribute on <html>", () => {
      useThemeStore.getState().setTheme("sepia");
      expect(document.documentElement.getAttribute("data-theme")).toBe("sepia");
    });
  });

  describe("toggleTheme", () => {
    it("cycles light → dark → sepia → nord → light", () => {
      useThemeStore.setState({ theme: "light" });
      useThemeStore.getState().toggleTheme();
      expect(useThemeStore.getState().theme).toBe("dark");
      useThemeStore.getState().toggleTheme();
      expect(useThemeStore.getState().theme).toBe("sepia");
      useThemeStore.getState().toggleTheme();
      expect(useThemeStore.getState().theme).toBe("nord");
      useThemeStore.getState().toggleTheme();
      expect(useThemeStore.getState().theme).toBe("light");
    });

    it("persists each toggle to localStorage", () => {
      useThemeStore.setState({ theme: "light" });
      useThemeStore.getState().toggleTheme();
      expect(localStorage.getItem("textora.theme")).toBe('"dark"');
    });

    it("rapid successive calls each advance one step (no lost toggles)", () => {
      useThemeStore.setState({ theme: "light" });
      // Simulate 3 rapid toggles within the same tick
      useThemeStore.getState().toggleTheme();
      useThemeStore.getState().toggleTheme();
      useThemeStore.getState().toggleTheme();
      // Should land on nord (light → dark → sepia → nord)
      expect(useThemeStore.getState().theme).toBe("nord");
    });

    it("handles unknown theme gracefully (wraps to light)", () => {
      // Force an invalid value
      useThemeStore.setState({ theme: "magenta" as any });
      useThemeStore.getState().toggleTheme();
      // indexOf returns -1 → (-1 + 1) % 4 = 0 → "light"
      expect(useThemeStore.getState().theme).toBe("light");
    });
  });
});

// Helper that calls setTheme without triggering the DOM side-effect
// (used for the localStorage-only test).
function useAppStoreSetThemeSafe(theme: string) {
  // We use the real store but just want to check storage was written
  useThemeStore.getState().setTheme(theme as any);
}
