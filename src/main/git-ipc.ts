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
import {
  appendCapture,
  captureOverflowError,
  createCaptureBuffers,
  DEFAULT_CAPTURE_MAX_BYTES,
} from "../shared/stream-cap";
import { isAllowedCwd } from "../shared/cwd-allowlist";

function rejectCwd(cwd: unknown): { ok: false; error: string } | null {
  if (typeof cwd !== "string" || !cwd) return { ok: false, error: "cwd required" };
  if (!isAllowedCwd(cwd)) return { ok: false, error: "cwd is not an opened project root" };
  return null;
}

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
    const capture = createCaptureBuffers(DEFAULT_CAPTURE_MAX_BYTES);
    let forceTimer: NodeJS.Timeout | null = null;
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      forceTimer = setTimeout(() => child.kill("SIGKILL"), 2000);
    }, 30_000);
    const clearTimers = () => {
      clearTimeout(timer);
      if (forceTimer) clearTimeout(forceTimer);
    };
    child.stdout.on("data", (c: Buffer) => appendCapture(capture, "stdout", c));
    child.stderr.on("data", (c: Buffer) => appendCapture(capture, "stderr", c));
    child.on("error", () => {
      clearTimers();
      resolve({ ok: false, stdout: capture.stdout, stderr: "gh CLI not found" });
    });
    child.on("close", (code: number | null) => {
      clearTimers();
      if (capture.truncated) {
        resolve({
          ok: false,
          stdout: capture.stdout,
          stderr: captureOverflowError(capture, "gh output"),
        });
        return;
      }
      resolve({ ok: code === 0, stdout: capture.stdout, stderr: capture.stderr });
    });
  });
}

export function registerGitIpc(assertTrusted: AssertTrustedIpc): void {
  ipcMain.handle("git:status", async (event, cwd: string) => {
    assertTrusted(event);
    const bad = rejectCwd(cwd);
    if (bad) return bad;
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
    const bad = rejectCwd(req.cwd);
    if (bad) return bad;
    const result = await createBranch(req.cwd, req.name, req.from, req.checkout);
    return { ok: result.ok, message: result.message, error: result.ok ? undefined : result.stderr || "Failed" };
  });

  ipcMain.handle("git:checkout", async (event, req: GitCheckoutRequest) => {
    assertTrusted(event);
    if (!req || typeof req.cwd !== "string" || typeof req.name !== "string") {
      return { ok: false as const, error: "Invalid request" };
    }
    const bad = rejectCwd(req.cwd);
    if (bad) return bad;
    const result = await checkoutBranch(req.cwd, req.name, req.track);
    return { ok: result.ok, message: result.message, error: result.ok ? undefined : result.stderr || "Failed" };
  });

  ipcMain.handle("git:deleteBranch", async (event, req: GitDeleteBranchRequest) => {
    assertTrusted(event);
    if (!req || typeof req.cwd !== "string" || typeof req.name !== "string") {
      return { ok: false as const, error: "Invalid request" };
    }
    const bad = rejectCwd(req.cwd);
    if (bad) return bad;
    const result = await deleteBranch(req.cwd, req.name, req.force);
    return { ok: result.ok, message: result.message, error: result.ok ? undefined : result.stderr || "Failed" };
  });

  ipcMain.handle("git:stage", async (event, opts: { cwd: string; paths?: string[]; all?: boolean; allIncludingUntracked?: boolean }) => {
    assertTrusted(event);
    if (!opts || typeof opts.cwd !== "string") {
      return { ok: false as const, error: "Invalid request" };
    }
    const bad = rejectCwd(opts.cwd);
    if (bad) return bad;
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
    const bad = rejectCwd(opts.cwd);
    if (bad) return bad;
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
    const bad = rejectCwd(req.cwd);
    if (bad) return bad;
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
    const bad = rejectCwd(req.cwd);
    if (bad) return bad;
    const result = await mergeBranch(req.cwd, req.branch, req.noFastForward);
    return { ok: result.ok, message: result.message, error: result.ok ? undefined : result.stderr || "Failed" };
  });

  ipcMain.handle("git:push", async (event, req: GitPushRequest) => {
    assertTrusted(event);
    if (!req || typeof req.cwd !== "string") {
      return { ok: false as const, error: "Invalid request" };
    }
    const bad = rejectCwd(req.cwd);
    if (bad) return bad;
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
    const bad = rejectCwd(req.cwd);
    if (bad) return bad;
    const result = await pullBranch(req.cwd, { remote: req.remote, branch: req.branch });
    return { ok: result.ok, message: result.message, error: result.ok ? undefined : result.stderr || "Failed" };
  });

  ipcMain.handle("git:fetch", async (event, opts: { cwd: string; remote?: string }) => {
    assertTrusted(event);
    if (!opts || typeof opts.cwd !== "string") {
      return { ok: false as const, error: "Invalid request" };
    }
    const bad = rejectCwd(opts.cwd);
    if (bad) return bad;
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
    const bad = rejectCwd(cwd);
    if (bad) return { ok: false as const, prs: [], error: bad.error } as GhPrListResult;
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
    const bad = rejectCwd(req.cwd);
    if (bad) return { ok: false as const, error: bad.error } as GhPrCreateResult;
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
