/** Renderer/main contract for the project-session interactive terminal. */
export type TerminalEvent =
  | { type: "data"; id: string; data: string; sequence: number }
  | { type: "exit"; id: string; exitCode: number; signal: number };

export type TerminalOpenRequest = {
  cwd: string;
  cols: number;
  rows: number;
};

export type TerminalOpenResult =
  | {
      ok: true;
      id: string;
      cwd: string;
      shell: string;
      reused: boolean;
      replay: string;
      sequence: number;
    }
  | { ok: false; error: string };

export type TerminalCommandResult = { ok: true } | { ok: false; error: string };
