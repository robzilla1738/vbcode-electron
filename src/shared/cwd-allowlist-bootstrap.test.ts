import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Structural contract: failed bootstrap must not widen the project cwd allowlist.
 * `projectCwdAllowlist.add` must run only after `bridge.start` succeeds.
 */
describe("cwd allowlist after successful bootstrap only", () => {
  const source = readFileSync(join(process.cwd(), "src/main/index.ts"), "utf8");

  it("registers allowlist after await bridge.start, not before", () => {
    const start = source.indexOf('ipcMain.handle(\n    "engine:bootstrap"');
    const end = source.indexOf('ipcMain.handle("engine:send"', start);
    const block = source.slice(start, end > start ? end : undefined);
    const addAt = block.indexOf("projectCwdAllowlist.add");
    const startAt = block.indexOf("await bridge.start");
    expect(addAt, "allowlist add missing").toBeGreaterThanOrEqual(0);
    expect(startAt, "bridge.start missing").toBeGreaterThanOrEqual(0);
    expect(addAt).toBeGreaterThan(startAt);
  });
});
