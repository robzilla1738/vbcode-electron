/**
 * Git IPC handlers for the Electron main process.
 *
 * Registers `git:*` IPC channels that the renderer calls through `window.vibe`
 * to manage branches, commits, and remotes. All operations spawn `git` directly
 * — the engine is never involved.
 */

import { spawn } from "node:child_process";
import type { Readable } from "node:stream";
import { ipcMain } from "electron";
import {
  checkoutBranch,
  commit,
  createBranch,
  deleteBranch,
  fetchRemotes,
  getFullStatus,
  isGitRepo,
  mergeBranch,
  pullBranch,
  pushBranch,
  stageAll,
  stageFiles,
  unstageAll,
  unstageFiles,
} from "../shared/git-ops";
import type {
  GhPrCreateRequest,
  GhPrCreateResult,
  GhPrListResult,
  GitCheckoutRequest,
  GitCommitRequest,
  GitCreateBranchRequest,
  GitDeleteBranchRequest,
  GitMergeRequest,
  GitPullRequest,
  GitPushRequest,
} from "../shared/git-types";
import { enrichedEnv } from "./host-resolver";
import type { AssertTrustedIpc } from "./ipc-security";

interface SpawnedChild {
  stdout: Readable;
  stderr: Readable;
  kill(signal?: string): void;
  on(event: "error", cb: (err: Error) => void): void;
  on(event: "close", cb: (code: number | null) => void): void;
}

function spawnGh(cwd: string, args: string[]): Promise<{ ok: boolean; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn("gh", args, {
      cwd,
      env: enrichedEnv(),
      stdio: ["ignore", "pipe", "pipe"],
    }) as unknown as SpawnedChild;
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 2000);
    }, 30_000);
    child.stdout.on("data", (c: Buffer) => { stdout += c.toString(); });
    child.stderr.on("data", (c: Buffer) => { stderr += c.toString(); });
    child.on("error", () => {
      clearTimeout(timer);
      resolve({ ok: false, stdout, stderr: "gh CLI not found" });
    });
    child.on("close", (code: number | null) => {
      clearTimeout(timer);
      resolve({ ok: code === 0, stdout, stderr });
    });
  });
}

export function registerGitIpc(assertTrusted: AssertTrustedIpc): void {
  ipcMain.handle("git:status", async (event, cwd: string) => {
    assertTrusted(event);
    if (typeof cwd !== "string" || !cwd) return { ok: false as const, error: "cwd required" };
    try {
      if (!(await isGitRepo(cwd))) {
        return { ok: true as const, status: null };
      }
      const status = await getFullStatus(cwd);
      return { ok: true as const, status };
    } catch (err) {
      return { ok: false as const, error: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcMain.handle("git:createBranch", async (event, req: GitCreateBranchRequest) => {
    assertTrusted(event);
    if (!req || typeof req.cwd !== "string" || typeof req.name !== "string") {
      return { ok: false as const, error: "Invalid request" };
    }
    const result = await createBranch(req.cwd, req.name, req.from, req.checkout);
    return { ok: result.ok, message: result.message, error: result.ok ? undefined : result.stderr || "Failed" };
  });

  ipcMain.handle("git:checkout", async (event, req: GitCheckoutRequest) => {
    assertTrusted(event);
    if (!req || typeof req.cwd !== "string" || typeof req.name !== "string") {
      return { ok: false as const, error: "Invalid request" };
    }
    const result = await checkoutBranch(req.cwd, req.name, req.track);
    return { ok: result.ok, message: result.message, error: result.ok ? undefined : result.stderr || "Failed" };
  });

  ipcMain.handle("git:deleteBranch", async (event, req: GitDeleteBranchRequest) => {
    assertTrusted(event);
    if (!req || typeof req.cwd !== "string" || typeof req.name !== "string") {
      return { ok: false as const, error: "Invalid request" };
    }
    const result = await deleteBranch(req.cwd, req.name, req.force);
    return { ok: result.ok, message: result.message, error: result.ok ? undefined : result.stderr || "Failed" };
  });

  ipcMain.handle("git:stage", async (event, opts: { cwd: string; paths?: string[]; all?: boolean; allIncludingUntracked?: boolean }) => {
    assertTrusted(event);
    if (!opts || typeof opts.cwd !== "string") {
      return { ok: false as const, error: "Invalid request" };
    }
    let result: { ok: boolean; stdout: string; stderr: string; message?: string };
    if (opts.all || opts.allIncludingUntracked) {
      result = await stageAll(opts.cwd, opts.allIncludingUntracked ?? false);
    } else if (opts.paths && opts.paths.length > 0) {
      result = await stageFiles(opts.cwd, opts.paths);
    } else {
      // Do not treat empty stage as "unstage all" — that is git:unstage.
      return { ok: false as const, error: "paths, all, or allIncludingUntracked required" };
    }
    return { ok: result.ok, message: result.message, error: result.ok ? undefined : result.stderr || "Failed" };
  });

  ipcMain.handle("git:unstage", async (event, opts: { cwd: string; paths?: string[] }) => {
    assertTrusted(event);
    if (!opts || typeof opts.cwd !== "string") {
      return { ok: false as const, error: "Invalid request" };
    }
    const result =
      opts.paths && opts.paths.length > 0
        ? await unstageFiles(opts.cwd, opts.paths)
        : await unstageAll(opts.cwd);
    return { ok: result.ok, message: result.message, error: result.ok ? undefined : result.stderr || "Failed" };
  });

  ipcMain.handle("git:commit", async (event, req: GitCommitRequest) => {
    assertTrusted(event);
    if (!req || typeof req.cwd !== "string" || typeof req.message !== "string") {
      return { ok: false as const, error: "Invalid request" };
    }
    const result = await commit(req.cwd, req.message, {
      stageAll: req.stageAll,
      stageAllIncludingUntracked: req.stageAllIncludingUntracked,
      amend: req.amend,
    });
    return { ok: result.ok, message: result.message, error: result.ok ? undefined : result.stderr || "Failed" };
  });

  ipcMain.handle("git:merge", async (event, req: GitMergeRequest) => {
    assertTrusted(event);
    if (!req || typeof req.cwd !== "string" || typeof req.branch !== "string") {
      return { ok: false as const, error: "Invalid request" };
    }
    const result = await mergeBranch(req.cwd, req.branch, req.noFastForward);
    return { ok: result.ok, message: result.message, error: result.ok ? undefined : result.stderr || "Failed" };
  });

  ipcMain.handle("git:push", async (event, req: GitPushRequest) => {
    assertTrusted(event);
    if (!req || typeof req.cwd !== "string") {
      return { ok: false as const, error: "Invalid request" };
    }
    const result = await pushBranch(req.cwd, {
      remote: req.remote,
      branch: req.branch,
      setUpstream: req.setUpstream,
      force: req.force,
    });
    return { ok: result.ok, message: result.message, error: result.ok ? undefined : result.stderr || "Failed" };
  });

  ipcMain.handle("git:pull", async (event, req: GitPullRequest) => {
    assertTrusted(event);
    if (!req || typeof req.cwd !== "string") {
      return { ok: false as const, error: "Invalid request" };
    }
    const result = await pullBranch(req.cwd, { remote: req.remote, branch: req.branch });
    return { ok: result.ok, message: result.message, error: result.ok ? undefined : result.stderr || "Failed" };
  });

  ipcMain.handle("git:fetch", async (event, opts: { cwd: string; remote?: string }) => {
    assertTrusted(event);
    if (!opts || typeof opts.cwd !== "string") {
      return { ok: false as const, error: "Invalid request" };
    }
    const result = await fetchRemotes(opts.cwd, opts.remote);
    return { ok: result.ok, message: result.message, error: result.ok ? undefined : result.stderr || "Failed" };
  });

  // ── GitHub CLI (gh) integration ──────────────────────────────────────

  ipcMain.handle("gh:checkAvailable", async (event) => {
    assertTrusted(event);
    const res = await spawnGh(process.cwd(), ["--version"]);
    return { available: res.ok };
  });

  ipcMain.handle("gh:prList", async (event, cwd: string) => {
    assertTrusted(event);
    if (typeof cwd !== "string" || !cwd) return { ok: false as const, error: "cwd required" } as GhPrListResult;
    try {
      const res = await spawnGh(cwd, ["pr", "list", "--json", "number,title,state,headRefName,url", "--limit", "20"]);
      if (!res.ok) {
        return { ok: false as const, prs: [], error: res.stderr || "gh command failed" } as GhPrListResult;
      }
      const data = JSON.parse(res.stdout) as { number: number; title: string; state: string; headRefName: string; url: string }[];
      return {
        ok: true as const,
        prs: data.map((p) => ({ number: p.number, title: p.title, state: p.state, head: p.headRefName, url: p.url })),
      } as GhPrListResult;
    } catch (err) {
      return { ok: false as const, prs: [], error: err instanceof Error ? err.message : String(err) } as GhPrListResult;
    }
  });

  ipcMain.handle("gh:prCreate", async (event, req: GhPrCreateRequest) => {
    assertTrusted(event);
    if (!req || typeof req.cwd !== "string" || typeof req.title !== "string") {
      return { ok: false as const, error: "Invalid request" } as GhPrCreateResult;
    }
    try {
      const args = ["pr", "create", "--title", req.title];
      if (req.body) { args.push("--body", req.body); }
      if (req.base) { args.push("--base", req.base); }
      if (req.head) { args.push("--head", req.head); }
      if (req.draft) { args.push("--draft"); }
      if (req.web) { args.push("--web"); }
      const res = await spawnGh(req.cwd, args);
      if (!res.ok) {
        return { ok: false as const, error: res.stderr || "gh pr create failed" } as GhPrCreateResult;
      }
      const url = res.stdout.trim().split("\n")[0] || undefined;
      return { ok: true as const, url, message: res.ok ? "PR created" : undefined } as GhPrCreateResult;
    } catch (err) {
      return { ok: false as const, error: err instanceof Error ? err.message : String(err) } as GhPrCreateResult;
    }
  });
}
