import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Production guard: Instructions (VIBE.md) drafts must not unmount on section
 * switch. SettingsFormArea keeps the section mounted and hidden so dirty bind
 * + editor content survive Models ↔ Instructions navigation.
 */
describe("settings instructions mount contract", () => {
  const panelSrc = readFileSync(
    resolve(import.meta.dirname, "../renderer/settings/SettingsPanel.tsx"),
    "utf8",
  );
  const instructionsSrc = readFileSync(
    resolve(import.meta.dirname, "../renderer/settings/sections/InstructionsSection.tsx"),
    "utf8",
  );

  it("keeps InstructionsSection mounted while hidden on other sections", () => {
    expect(panelSrc).toMatch(/hidden=\{activeSection !== "instructions"\}/);
    expect(panelSrc).toMatch(/<InstructionsSection/);
    // Must not only render instructions inside the exclusive switch.
    expect(panelSrc).toMatch(/activeSection !== "instructions" \? renderConfigSection/);
  });

  it("does not clear the dirty binder on InstructionsSection unmount", () => {
    // The old bug bound `() => false` on cleanup, wiping shell dirty when
    // switching away from Instructions.
    expect(instructionsSrc).not.toMatch(/onBindDirty\?\.\(\(\) => false\)/);
    expect(instructionsSrc).toMatch(/onBindDirty\?\.\(\(\) => dirtyRef\.current\)/);
  });
});
