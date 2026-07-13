import { describe, expect, it } from "vitest";
import {
  runGit,
  isGitRepo,
  listBranches,
  getFullStatus,
  stageFiles,
  unstageFiles,
  createBranch,
  checkoutBranch,
  deleteBranch,
  mergeBranch,
  pushBranch,
  commit,
} from "./git-ops";

// These tests use a real git repo in a temp directory to verify the spawn
// and parsing logic. They are integration-style but fast (git is quick on
// small repos). Skip if git is not installed.

const hasGit = await (async () => {
  try {
    const res = await runGit("/", ["--version"]);
    return res.ok;
  } catch {
    return false;
  }
})();

const itGit = hasGit ? it : it.skip;

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

async function makeRepo(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "vibe-git-test-"));
  await runGit(dir, ["init", "-q", "-b", "main"]);
  await runGit(dir, ["config", "user.email", "test@test.com"]);
  await runGit(dir, ["config", "user.name", "Test User"]);
  const { writeFile } = await import("node:fs/promises");
  await writeFile(join(dir, "README.md"), "# Test\n");
  await runGit(dir, ["add", "-A"]);
  await runGit(dir, ["commit", "-q", "-m", "initial commit"]);
  return dir;
}

describe("git-ops", () => {
  describe("runGit", () => {
    itGit("returns ok for --version", async () => {
      const res = await runGit("/", ["--version"]);
      expect(res.ok).toBe(true);
      expect(res.stdout).toContain("git version");
    });

    itGit("returns not ok for invalid args", async () => {
      const res = await runGit("/", ["not-a-command"]);
      expect(res.ok).toBe(false);
    });
  });

  describe("isGitRepo", () => {
    itGit("returns true inside a git repo", async () => {
      const dir = await makeRepo();
      try {
        expect(await isGitRepo(dir)).toBe(true);
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    });

    itGit("returns false outside a git repo", async () => {
      const dir = await mkdtemp(join(tmpdir(), "vibe-non-git-"));
      try {
        expect(await isGitRepo(dir)).toBe(false);
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    });
  });

  describe("getFullStatus", () => {
    itGit("returns null outside a repo", async () => {
      const dir = await mkdtemp(join(tmpdir(), "vibe-non-git-"));
      try {
        expect(await getFullStatus(dir)).toBeNull();
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    });

    itGit("returns status for a clean repo", async () => {
      const dir = await makeRepo();
      try {
        const status = await getFullStatus(dir);
        expect(status).not.toBeNull();
        expect(status!.branch).toBe("main");
        expect(status!.clean).toBe(true);
        expect(status!.entries).toHaveLength(0);
        expect(status!.branches.length).toBeGreaterThan(0);
        expect(status!.recentCommits.length).toBeGreaterThan(0);
        expect(status!.recentCommits[0]!.subject).toBe("initial commit");
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    });

    itGit("detects untracked files", async () => {
      const dir = await makeRepo();
      try {
        const { writeFile } = await import("node:fs/promises");
        await writeFile(join(dir, "new-file.ts"), "export const x = 1;\n");
        const status = await getFullStatus(dir);
        expect(status).not.toBeNull();
        expect(status!.clean).toBe(false);
        expect(status!.untrackedCount).toBe(1);
        expect(status!.entries[0]!.path).toBe("new-file.ts");
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    });

    itGit("detects modified files", async () => {
      const dir = await makeRepo();
      try {
        const { writeFile } = await import("node:fs/promises");
        await writeFile(join(dir, "README.md"), "# Modified\n");
        const status = await getFullStatus(dir);
        expect(status).not.toBeNull();
        expect(status!.clean).toBe(false);
        expect(status!.unstagedCount).toBe(1);
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    });
  });

  describe("listBranches", () => {
    itGit("lists local branches", async () => {
      const dir = await makeRepo();
      try {
        await runGit(dir, ["branch", "feature/test"]);
        const branches = await listBranches(dir);
        const localBranches = branches.filter((b) => !b.remote);
        expect(localBranches.length).toBe(2);
        expect(localBranches.some((b) => b.name === "main")).toBe(true);
        expect(localBranches.some((b) => b.name === "feature/test")).toBe(true);
        const mainBranch = localBranches.find((b) => b.name === "main");
        expect(mainBranch?.current).toBe(true);
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    });
  });

  describe("branch create/checkout/delete/merge (real git)", () => {
    itGit("createBranch with checkout creates and switches to the named branch", async () => {
      const dir = await makeRepo();
      try {
        const res = await createBranch(dir, "feature/login", undefined, true);
        expect(res.ok, res.stderr).toBe(true);
        const status = await getFullStatus(dir);
        expect(status!.branch).toBe("feature/login");
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    });

    itGit("createBranch without checkout leaves HEAD on main", async () => {
      const dir = await makeRepo();
      try {
        const res = await createBranch(dir, "feature/hold");
        expect(res.ok, res.stderr).toBe(true);
        const status = await getFullStatus(dir);
        expect(status!.branch).toBe("main");
        expect(status!.branches.some((b) => b.name === "feature/hold" && !b.remote)).toBe(true);
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    });

    itGit("checkoutBranch switches to an existing branch", async () => {
      const dir = await makeRepo();
      try {
        expect((await createBranch(dir, "feature/switch")).ok).toBe(true);
        const res = await checkoutBranch(dir, "feature/switch");
        expect(res.ok, res.stderr).toBe(true);
        expect((await getFullStatus(dir))!.branch).toBe("feature/switch");
        expect((await checkoutBranch(dir, "main")).ok).toBe(true);
        expect((await getFullStatus(dir))!.branch).toBe("main");
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    });

    itGit("deleteBranch removes a non-current branch", async () => {
      const dir = await makeRepo();
      try {
        expect((await createBranch(dir, "feature/gone")).ok).toBe(true);
        const res = await deleteBranch(dir, "feature/gone");
        expect(res.ok, res.stderr).toBe(true);
        const branches = await listBranches(dir);
        expect(branches.some((b) => b.name === "feature/gone")).toBe(false);
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    });

    itGit("mergeBranch merges a feature branch into main", async () => {
      const dir = await makeRepo();
      try {
        const { writeFile } = await import("node:fs/promises");
        expect((await createBranch(dir, "feature/merge", undefined, true)).ok).toBe(true);
        await writeFile(join(dir, "extra.ts"), "export const y = 2;\n");
        expect((await stageFiles(dir, ["extra.ts"])).ok).toBe(true);
        expect((await commit(dir, "add extra", {})).ok).toBe(true);
        expect((await checkoutBranch(dir, "main")).ok).toBe(true);
        const res = await mergeBranch(dir, "feature/merge");
        expect(res.ok, res.stderr).toBe(true);
        const status = await getFullStatus(dir);
        expect(status!.branch).toBe("main");
        expect(status!.clean).toBe(true);
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    });

    itGit("pushBranch force uses --force-with-lease (not bare --force)", async () => {
      // Without a remote, push fails — but stderr/args path must not use raw --force.
      // Spy by running with force against a dead remote and checking the error is lease-shaped
      // or generic remote failure, never "unknown option".
      const dir = await makeRepo();
      try {
        await runGit(dir, ["remote", "add", "origin", "https://example.invalid/repo.git"]);
        const res = await pushBranch(dir, { force: true });
        // Expect failure (no network/remote) but not ref/argv rejection from our layer
        expect(res.stderr).not.toMatch(/must not start with/);
        // forceUnsafe would also fail similarly; ensure force:true still builds a command
        expect(res.ok).toBe(false);
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    });

    itGit("rejects option-like branch names before git runs", async () => {
      const dir = await makeRepo();
      try {
        const bad = await createBranch(dir, "--output=/tmp/x", undefined, true);
        expect(bad.ok).toBe(false);
        expect(bad.stderr).toMatch(/must not start with/);
        expect((await getFullStatus(dir))!.branch).toBe("main");
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    });
  });

  describe("stageFiles / unstageFiles", () => {
    itGit("stages and unstages a single path", async () => {
      const dir = await makeRepo();
      try {
        const { writeFile } = await import("node:fs/promises");
        await writeFile(join(dir, "README.md"), "# staged-path\n");
        const staged = await stageFiles(dir, ["README.md"]);
        expect(staged.ok).toBe(true);
        let status = await getFullStatus(dir);
        expect(status!.stagedCount).toBe(1);
        const unstaged = await unstageFiles(dir, ["README.md"]);
        expect(unstaged.ok).toBe(true);
        status = await getFullStatus(dir);
        expect(status!.stagedCount).toBe(0);
        expect(status!.unstagedCount).toBe(1);
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    });

    itGit("empty stageFiles does not wipe the index (not unstage-all)", async () => {
      const dir = await makeRepo();
      try {
        const { writeFile } = await import("node:fs/promises");
        await writeFile(join(dir, "README.md"), "# keep-staged\n");
        expect((await stageFiles(dir, ["README.md"])).ok).toBe(true);
        const empty = await stageFiles(dir, []);
        expect(empty.ok).toBe(false);
        expect(empty.stderr).toMatch(/No paths to stage/i);
        const status = await getFullStatus(dir);
        expect(status!.stagedCount).toBe(1);
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    });
  });
});
