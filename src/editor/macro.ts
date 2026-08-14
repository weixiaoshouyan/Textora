/**
 * Macro Recording & Playback System
 * 
 * Records editor operations (text insertions, deletions, cursor movements)
 * and can replay them. Macros are stored in localStorage.
 */

export interface MacroAction {
  type: "insert" | "delete" | "select" | "cursor";
  text?: string;
  from?: number;
  to?: number;
  timestamp: number;
}

export interface Macro {
  id: string;
  name: string;
  actions: MacroAction[];
  createdAt: number;
}

const MACROS_KEY = "textora.macros";

export function getMacros(): Macro[] {
  try {
    const raw = localStorage.getItem(MACROS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveMacro(macro: Macro): void {
  const macros = getMacros();
  const idx = macros.findIndex(m => m.id === macro.id);
  if (idx >= 0) macros[idx] = macro;
  else macros.push(macro);
  localStorage.setItem(MACROS_KEY, JSON.stringify(macros));
}

export function deleteMacro(id: string): void {
  const macros = getMacros().filter(m => m.id !== id);
  localStorage.setItem(MACROS_KEY, JSON.stringify(macros));
}

export class MacroRecorder {
  private actions: MacroAction[] = [];
  private recording = false;
  private lastActionTime = 0;

  startRecording(): void {
    this.actions = [];
    this.recording = true;
    this.lastActionTime = Date.now();
  }

  stopRecording(): MacroAction[] {
    this.recording = false;
    return [...this.actions];
  }

  isRecording(): boolean {
    return this.recording;
  }

  recordInsert(text: string, pos: number): void {
    if (!this.recording) return;
    const now = Date.now();
    // Merge consecutive inserts at adjacent positions
    const last = this.actions[this.actions.length - 1];
    if (last && last.type === "insert" && (last.from || 0) + (last.text || "").length === pos) {
      last.text = (last.text || "") + text;
    } else {
      this.actions.push({ type: "insert", text, from: pos, timestamp: now - this.lastActionTime });
    }
    this.lastActionTime = now;
  }

  recordDelete(from: number, to: number): void {
    if (!this.recording) return;
    const now = Date.now();
    this.actions.push({ type: "delete", from, to, timestamp: now - this.lastActionTime });
    this.lastActionTime = now;
  }

  recordCursor(from: number, to: number): void {
    if (!this.recording) return;
    const now = Date.now();
    // Only record cursor movements that are significant (> 100ms apart)
    if (now - this.lastActionTime > 100) {
      this.actions.push({ type: "select", from, to, timestamp: now - this.lastActionTime });
      this.lastActionTime = now;
    }
  }
}

export class MacroPlayer {
  private playing = false;
  private abortFlag = false;
  private rafIds: number[] = [];

  stop(): void {
    this.abortFlag = true;
    this.rafIds.forEach(id => cancelAnimationFrame(id));
    this.rafIds = [];
  }

  isPlaying(): boolean {
    return this.playing;
  }

  async play(
    actions: MacroAction[],
    editor: {
      getText: () => string;
      setText: (text: string) => void;
      select: (from: number, to: number) => void;
      focus: () => void;
    }
  ): Promise<void> {
    this.playing = true;
    this.abortFlag = false;
    editor.focus();

    try {
      for (const action of actions) {
        if (this.abortFlag) break;

        if (action.timestamp > 0) {
          await new Promise(r => setTimeout(r, Math.min(action.timestamp, 500)));
        }
        if (this.abortFlag) break;

        const text = editor.getText();
        switch (action.type) {
          case "insert": {
            const pos = action.from ?? text.length;
            const newText = text.slice(0, pos) + (action.text || "") + text.slice(pos);
            editor.setText(newText);
            const id = requestAnimationFrame(() => editor.select(pos + (action.text || "").length, pos + (action.text || "").length));
            this.rafIds.push(id);
            break;
          }
          case "delete": {
            const from = action.from ?? 0;
            const to = action.to ?? from;
            const newText = text.slice(0, from) + text.slice(to);
            editor.setText(newText);
            const id = requestAnimationFrame(() => editor.select(from, from));
            this.rafIds.push(id);
            break;
          }
          case "select":
          case "cursor": {
            editor.select(action.from ?? 0, action.to ?? 0);
            break;
          }
        }
      }
    } finally {
      // 任何异常（setText/select 抛错、编辑器被切换）都必须复位 playing，
      // 否则 isPlaying() 永久为 true，后续所有回放都被拒绝
      this.playing = false;
    }
  }
}
