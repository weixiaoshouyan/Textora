import { create } from "zustand";
import { THEME_KEY, safeWriteLocal, detectInitialTheme } from "./helpers";
import type { ThemeMode } from "./types";

function applyThemeToDom(theme: ThemeMode): void {
  document.documentElement.setAttribute("data-theme", theme);
}

const THEME_ORDER: ThemeMode[] = ["light", "dark", "sepia", "nord"];

export interface ThemeState {
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
  toggleTheme: () => void;
}

export const useThemeStore = create<ThemeState>((set) => ({
  theme: detectInitialTheme(),
  setTheme: (theme: ThemeMode) => {
    applyThemeToDom(theme);
    safeWriteLocal(THEME_KEY, theme);
    set({ theme });
  },
  toggleTheme: () => {
    // Functional updater: each call advances one step from latest state.
    set((s) => {
      const idx = THEME_ORDER.indexOf(s.theme);
      const next = THEME_ORDER[(idx + 1) % THEME_ORDER.length];
      applyThemeToDom(next);
      safeWriteLocal(THEME_KEY, next);
      return { theme: next };
    });
  },
}));

// Apply initial theme on module load
applyThemeToDom(useThemeStore.getState().theme);
