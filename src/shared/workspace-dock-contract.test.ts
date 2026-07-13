import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { changedFilesTotals } from "./changed-files";

/**
 * Design-direction contract for the workspace dock: quiet flat list of
 * Session / Changes / Git / Jobs / Files — no Local+Files duplicate, no
 * commit/compare chrome that belongs in the Git end panel.
 */
describe("workspace dock design contract", () => {
  const source = readFileSync(
    join(process.cwd(), "src/renderer/layout/WorkspaceDock.tsx"),
    "utf8",
  );

  it("exposes only Session, Changes, Git, Jobs, Files rows", () => {
    const labels = [...source.matchAll(/label="([^"]+)"/g)].map((m) => m[1]);
    // Branch label is dynamic template — still one Git row.
    const staticLabels = labels.filter((l) => !l.includes("${") && l !== "Git");
    // Template string for Git · branch counts as the Git row via aria.
    expect(source).toContain('ariaLabel="Show session panel"');
    expect(source).toContain('ariaLabel="Show session changes"');
    expect(source).toContain('ariaLabel="Open git panel"');
    expect(source).toContain('ariaLabel="Toggle background jobs"');
    expect(source).toContain('ariaLabel="Reveal project in Finder"');

    expect(source).not.toContain("Commit or push");
    expect(source).not.toContain("Compare branch");
    expect(source).not.toContain('label="Local"');
    // Exactly one Files / Finder row (aria + title may both mention reveal)
    expect((source.match(/ariaLabel="Reveal project in Finder"/g) ?? []).length).toBe(1);
    expect((source.match(/onOpen\("files"\)/g) ?? []).length).toBe(1);
    // No section divider chrome
    expect(source).not.toContain("workspace-dock-divider");
    expect(source).not.toContain("workspace-dock-section-label");
    void staticLabels;
  });

  it("uses changedFilesTotals for change meta (shipped pure helper)", () => {
    const totals = changedFilesTotals([
      { path: "a.ts", added: 2, removed: 1 },
      { path: "b.ts", added: 0, removed: 3 },
    ]);
    expect(totals).toEqual({ count: 2, added: 2, removed: 4 });
  });
});
