import { beforeEach, describe, expect, it, vi } from "vitest";
import { projectCwdAllowlist } from "../shared/cwd-allowlist";
import type { TerminalEvent } from "../shared/terminal";

const { spawnMock } = vi.hoisted(() => ({ spawnMock: vi.fn() }));

vi.mock("node-pty", () => ({ spawn: spawnMock }));

import { TerminalManager } from "./terminal-manager";

function fakePty() {
  let onData: ((data: string) => void) | null = null;
  let onExit: ((event: { exitCode: number; signal?: number }) => void) | null = null;
  return {
    write: vi.fn(),
    resize: vi.fn(),
    kill: vi.fn(),
    onData: vi.fn((listener: (data: string) => void) => {
      onData = listener;
      return { dispose: vi.fn() };
    }),
    onExit: vi.fn((listener: (event: { exitCode: number; signal?: number }) => void) => {
      onExit = listener;
      return { dispose: vi.fn() };
    }),
    emitData(data: string) {
      onData?.(data);
    },
    emitExit(exitCode = 0, signal = 0) {
      onExit?.({ exitCode, signal });
    },
  };
}

describe("TerminalManager persistence", () => {
  beforeEach(() => {
    spawnMock.mockReset();
    projectCwdAllowlist.add(process.cwd());
  });

  it("reuses a project PTY and replays output after the renderer detaches", () => {
    const pty = fakePty();
    spawnMock.mockReturnValue(pty);
    const events: TerminalEvent[] = [];
    const manager = new TerminalManager((event) => events.push(event));

    const first = manager.open({ cwd: process.cwd(), cols: 80, rows: 24 });
    expect(first).toMatchObject({ ok: true, reused: false, replay: "", sequence: 0 });
    if (!first.ok) throw new Error(first.error);

    pty.emitData("first\r\n");
    pty.emitData("second\r\n");
    expect(events).toEqual([
      { type: "data", id: first.id, data: "first\r\n", sequence: 1 },
      { type: "data", id: first.id, data: "second\r\n", sequence: 2 },
    ]);

    const reopened = manager.open({ cwd: process.cwd(), cols: 120, rows: 40 });
    expect(reopened).toMatchObject({
      ok: true,
      id: first.id,
      reused: true,
      replay: "first\r\nsecond\r\n",
      sequence: 2,
    });
    expect(spawnMock).toHaveBeenCalledTimes(1);
    expect(pty.resize).toHaveBeenLastCalledWith(120, 40);

    manager.dispose();
    expect(pty.kill).toHaveBeenCalledTimes(1);
  });
});
