import type { Palette } from "../../shared/themes";
import { paletteColorScheme } from "../../shared/theme-scheme";

/** Apply a TUI palette as CSS variables on :root. */
export function applyPalette(p: Palette, accentOverride?: string, themeName?: string): void {
  const root = document.documentElement;
  const scheme = paletteColorScheme(p);
  // The CLI light palette targets terminal cells. The desktop shell needs a
  // brighter raised surface and stronger neutral contrast because macOS window
  // materials and antialiasing otherwise wash those same values out.
  const ui = scheme === "light"
    ? {
        ...p,
        assistant: "#20242e",
        muted: "#5f6878",
        border: "#d5d8df",
        background: "#f8f8f7",
        panel: "#eff0f2",
        elevated: "#ffffff",
        ctx: "#677184",
        taskDone: "#7b8494",
      }
    : p;
  root.style.colorScheme = scheme;
  root.dataset.scheme = scheme;
  if (themeName) root.dataset.theme = themeName;
  const primary = accentOverride || p.primary;
  const accent = accentOverride || p.accent;
  root.style.setProperty("--bg", ui.background);
  root.style.setProperty("--panel", ui.panel);
  root.style.setProperty("--elevated", ui.elevated);
  root.style.setProperty("--border", ui.border);
  root.style.setProperty("--muted", ui.muted);
  root.style.setProperty("--assistant", ui.assistant);
  root.style.setProperty("--primary", primary);
  root.style.setProperty("--accent", accent);
  root.style.setProperty("--user", p.user);
  root.style.setProperty("--tool", p.tool);
  root.style.setProperty("--notice", p.notice);
  root.style.setProperty("--plan", p.plan);
  root.style.setProperty("--subagent", p.subagent);
  root.style.setProperty("--add", p.add);
  root.style.setProperty("--del", p.del);
  root.style.setProperty("--add-bg", p.addBg);
  root.style.setProperty("--del-bg", p.delBg);
  root.style.setProperty("--gutter", p.gutter);
  root.style.setProperty("--heading", p.heading);
  root.style.setProperty("--code", p.code);
  root.style.setProperty("--sel-bg", p.selBg);
  root.style.setProperty("--sel-fg", p.selFg);
  root.style.setProperty("--task-done", ui.taskDone);
  root.style.setProperty("--task-active", p.taskActive);
  root.style.setProperty("--task-pending", p.taskPending);
  root.style.setProperty("--ctx", ui.ctx);
  root.style.setProperty("--rail", ui.background);
  root.style.setProperty("--surface", ui.elevated);
  root.style.setProperty("--ring", accent);
  root.style.setProperty("--focus", accent);
  root.style.setProperty("--mode", accent);
}
