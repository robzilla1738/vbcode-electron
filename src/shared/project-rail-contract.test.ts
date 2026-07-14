import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  join(process.cwd(), "src/renderer/layout/ProjectRail.tsx"),
  "utf8",
);

describe("project rail mutation contract", () => {
  it("preserves rename drafts until the backing operation succeeds", () => {
    expect(source).toContain("if (!renaming || renamePendingRef.current) return");
    expect(source).toContain("ok = await onRenameSession(cwd, id, title)");
    expect(source).toMatch(/if \(ok\) \{\s*setRenaming\(null\);/);
    expect(source).toContain("ok = await onRenameProject(cwd, name)");
    expect(source).toMatch(/if \(ok\) \{\s*setRenamingProject\(null\);/);
    expect(source).toContain("disabled={renamePending}");
  });

  it("keeps destructive confirmations open and prevents duplicate submission", () => {
    expect(source).toContain("if (menuActionPendingRef.current) return");
    expect(source).toContain("disabled={menuActionPending}");
    expect(source).toContain("void runProjectAction(cwd, mode)");
    expect(source).toContain("void runSessionAction(cwd, session.id, mode)");
    expect(source).toMatch(/if \(ok\) \{\s*setMenu\(null\);\s*setConfirmProjectAction\(null\);/);
    expect(source).toMatch(/if \(ok\) \{\s*setMenu\(null\);\s*setConfirmAction\(null\);/);
  });
});
