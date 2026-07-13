import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { changedFilesTotals } from "./changed-files";

/**
 * Design-direction contract for the workspace dock: quiet flat list of
 * Session / Changes / Git / Terminal / Jobs / Files — no Local+Files duplicate, no
 * commit/compare chrome that belongs in the Git end panel.
 */
describe("workspace dock design contract", () => {
  const source = readFileSync(
    join(process.cwd(), "src/renderer/layout/WorkspaceDock.tsx"),
    "utf8",
  );
  const appSource = readFileSync(join(process.cwd(), "src/renderer/App.tsx"), "utf8");
  const sidebarSource = readFileSync(
    join(process.cwd(), "src/renderer/layout/ActivitySidebar.tsx"),
    "utf8",
  );
  const gitSource = readFileSync(join(process.cwd(), "src/renderer/git/GitPanel.tsx"), "utf8");
  const terminalSource = readFileSync(
    join(process.cwd(), "src/renderer/panels/TerminalPanel.tsx"),
    "utf8",
  );
  const styles = readFileSync(join(process.cwd(), "src/renderer/styles.css"), "utf8");

  it("exposes only Session, Changes, Git, Terminal, Jobs, Files rows", () => {
    const labels = [...source.matchAll(/label="([^"]+)"/g)].map((m) => m[1]);
    // Branch label is dynamic template — still one Git row.
    const staticLabels = labels.filter((l) => !l.includes("${") && l !== "Git");
    // Template string for Git · branch counts as the Git row via aria.
    expect(source).toContain('ariaLabel="Show session panel"');
    expect(source).toContain('ariaLabel="Show session changes"');
    expect(source).toContain('ariaLabel="Open git panel"');
    expect(source).toContain('ariaLabel="Open project terminal"');
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

  it("opens every tool in one structural edge-attached activity sidebar", () => {
    expect(styles).toContain("grid-template-columns: minmax(0, 1fr) min(var(--activity-rail-w), 48%)");
    expect(styles).toMatch(/\.activity-sidebar\s*\{[\s\S]*?position: relative;/);
    expect(styles).toMatch(/\.activity-sidebar\s*\{[\s\S]*?border-left:/);
    expect(styles).toMatch(/\.activity-sidebar\s*\{[\s\S]*?border-radius: 0;/);
    expect(styles).toMatch(/\.activity-sidebar\s*\{[\s\S]*?box-shadow: none;/);
    expect(appSource).toContain('"Resize activity sidebar"');
    expect(appSource).toContain('"Resize changes sidebar"');
    expect(appSource).not.toContain("jobs-drawer-root");
    expect(appSource).not.toContain("jobs-drawer-backdrop");
    expect(appSource).not.toContain("jobs-drawer");
    expect(appSource).toContain('className="activity-rail jobs-activity-rail"');
    expect(gitSource).not.toContain("git-drawer");
    expect(gitSource).not.toContain("export function GitContent");
    expect(gitSource).toContain('className="activity-rail git-activity-rail"');
    for (const label of ["Session", "Changes", "Git", "Terminal", "Jobs"]) {
      expect(sidebarSource).toContain(`label: "${label}"`);
    }
    expect(terminalSource).toContain('getPropertyValue("--font-mono")');
    expect(terminalSource).toContain("fontFamily: terminalFontFromTokens()");
    expect(terminalSource).toContain("letterSpacing: 0");
  });
});
