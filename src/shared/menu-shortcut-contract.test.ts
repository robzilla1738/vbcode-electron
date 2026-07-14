import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("native menu shortcut contract", () => {
  const source = readFileSync(join(process.cwd(), "src/main/index.ts"), "utf8");

  it("does not steal the transcript Cmd/Ctrl+O fold shortcut", () => {
    const openProject = source.match(
      /label: "Open Project…",([\s\S]*?)click: \(\) => sendToRenderer\("menu:action", "openProject"\)/,
    )?.[1];
    expect(openProject).toBeDefined();
    expect(openProject).not.toContain('accelerator: "CmdOrCtrl+O"');
  });

  it("keeps DevTools distinct from the Session Inspector shortcut", () => {
    expect(source).toContain('role: "toggleDevTools" as const');
    expect(source).toContain('accelerator: "CmdOrCtrl+Alt+I"');
    expect(source).toContain('label: "Toggle Inspector"');
    expect(source).toContain('accelerator: "CmdOrCtrl+Shift+I"');
  });
});
