/**
 * Git operations for the Electron shell.
 *
 * Spawns `git` directly (same pattern as `vibe-codr/packages/core/src/git-info.ts`)
 * to read working-tree state and perform branch/commit/merge/push/pull actions.
 * These are shell-level operations — the agent loop is never involved.
 */

import { spawn } from "node:child_process";
import type { Readable } from "node:stream";
import type {
  GitBranch,
  GitCommitInfo,
  GitFullStatus,
  GitRemote,
  GitResult,
  GitStatusEntry,
} from "./git-types";

const GIT_TIMEOUT_MS = 30_000;

interface SpawnedChild {
  stdout: Readable;
  stderr: Readable;
  kill(signal?: string): void;
  on(event: "error", cb: (err: Error) => void): void;
  on(event: "close", cb: (code: number | null) => void): void;
}

export interface GitRunResult {
  ok: boolean;
  stdout: string;
  stderr: string;
}

/** Spawn a git command in `cwd` and return trimmed streams + success. */
/** PATH enrichment so GUI-launched spawns find Homebrew git (Dock/Finder PATH is thin). */
function gitEnv(): NodeJS.ProcessEnv {
  const home = process.env.HOME ?? "";
  const extras = [
    home ? `${home}/.bun/bin` : "",
    "/opt/homebrew/bin",
    "/usr/local/bin",
    "/usr/bin",
    "/bin",
  ].filter(Boolean).join(":");
  const path = process.env.PATH ? `${extras}:${process.env.PATH}` : extras;
  return { ...process.env, PATH: path };
}

export async function runGit(cwd: string, args: string[]): Promise<GitRunResult> {
  return new Promise((resolve) => {
    const child = spawn("git", args, {
      cwd,
      env: gitEnv(),
      stdio: ["ignore", "pipe", "pipe"],
    }) as unknown as SpawnedChild;
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 2000);
    }, GIT_TIMEOUT_MS);

    child.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });
    child.on("error", (err: Error) => {
      clearTimeout(timer);
      resolve({ ok: false, stdout, stderr: err.message });
    });
    child.on("close", (code: number | null) => {
      clearTimeout(timer);
      resolve({ ok: code === 0, stdout, stderr });
    });
  });
}

/** Check if `cwd` is inside a git repository. */
export async function isGitRepo(cwd: string): Promise<boolean> {
  const res = await runGit(cwd, ["rev-parse", "--is-inside-work-tree"]);
  return res.ok && res.stdout.trim() === "true";
}

function parseRemoteUrl(url: string): { host?: string; owner?: string; repo?: string } {
  // SSH: git@github.com:owner/repo.git
  const ssh = url.match(/^[\w-]+@([^:]+):([^/]+)\/(.+?)(?:\.git)?$/);
  if (ssh) {
    return { host: ssh[1], owner: ssh[2], repo: ssh[3] };
  }
  // HTTPS: https://github.com/owner/repo.git
  try {
    const u = new URL(url);
    const parts = u.pathname.replace(/\.git$/, "").split("/").filter(Boolean);
    if (parts.length >= 2) {
      return { host: u.host, owner: parts[0], repo: parts[1] };
    }
  } catch {
    /* not a URL */
  }
  return {};
}

export async function listRemotes(cwd: string): Promise<GitRemote[]> {
  const res = await runGit(cwd, ["remote", "-v"]);
  if (!res.ok) return [];
  const seen = new Set<string>();
  const remotes: GitRemote[] = [];
  for (const line of res.stdout.split("\n")) {
    const m = line.match(/^(\S+)\s+(\S+)/);
    if (!m) continue;
    const name = m[1]!;
    if (seen.has(name)) continue;
    seen.add(name);
    const url = m[2]!;
    const parsed = parseRemoteUrl(url);
    remotes.push({ name, url, ...parsed });
  }
  return remotes;
}

export async function listBranches(cwd: string): Promise<GitBranch[]> {
  const [local, remote] = await Promise.all([
    runGit(cwd, [
      "for-each-ref",
      "--format=%(HEAD)%00%(refname:short)%00%(upstream:short)%00%(committerdate:unix)%00%(subject)",
      "refs/heads/",
    ]),
    runGit(cwd, [
      "for-each-ref",
      "--format=%(refname:short)%00%(committerdate:unix)%00%(subject)",
      "refs/remotes/",
    ]),
  ]);

  const branches: GitBranch[] = [];

  if (local.ok) {
    for (const line of local.stdout.split("\n")) {
      if (!line.trim()) continue;
      const [head, name, upstream, dateStr, ...subjectParts] = line.split("\0");
      const subject = subjectParts.join("\0");
      branches.push({
        name: name ?? "",
        current: head === "*",
        remote: false,
        upstream: upstream || undefined,
        lastSubject: subject || undefined,
        lastDate: dateStr ? Number(dateStr) * 1000 : undefined,
      });
    }
  }

  if (remote.ok) {
    for (const line of remote.stdout.split("\n")) {
      if (!line.trim()) continue;
      const [name, dateStr, ...subjectParts] = line.split("\0");
      const subject = subjectParts.join("\0");
      branches.push({
        name: name ?? "",
        current: false,
        remote: true,
        lastSubject: subject || undefined,
        lastDate: dateStr ? Number(dateStr) * 1000 : undefined,
      });
    }
  }

  // Enrich local branches with ahead/behind
  for (const branch of branches) {
    if (branch.remote || !branch.upstream) continue;
    const counts = await runGit(cwd, [
      "rev-list", "--left-right", "--count", `${branch.upstream}...${branch.name}`,
    ]);
    if (counts.ok) {
      const [behind, ahead] = counts.stdout.trim().split(/\s+/).map(Number);
      branch.behind = behind || 0;
      branch.ahead = ahead || 0;
    }
  }

  return branches;
}

export async function recentCommits(cwd: string, count = 20): Promise<GitCommitInfo[]> {
  const res = await runGit(cwd, [
    "log", `-${count}`, "--format=%H%x00%h%x00%an%x00%at%x00%s",
  ]);
  if (!res.ok) return [];
  const commits: GitCommitInfo[] = [];
  for (const line of res.stdout.split("\n")) {
    if (!line.trim()) continue;
    const [hash, shortHash, author, dateStr, ...subjectParts] = line.split("\0");
    const subject = subjectParts.join("\0");
    commits.push({
      hash: hash ?? "",
      shortHash: shortHash ?? "",
      author: author ?? "",
      date: dateStr ? Number(dateStr) * 1000 : 0,
      subject: subject ?? "",
    });
  }
  return commits;
}

function parsePorcelain(stdout: string): GitStatusEntry[] {
  const entries: GitStatusEntry[] = [];
  for (const line of stdout.split("\n")) {
    if (!line) continue;
    const index = line[0] ?? " ";
    const working = line[1] ?? " ";
    const rest = line.slice(3);
    // Handle renames: "old -> new"
    if (rest.includes(" -> ")) {
      const [oldPath, newPath] = rest.split(" -> ");
      entries.push({ index, working, path: newPath ?? rest, oldPath: oldPath });
    } else {
      entries.push({ index, working, path: rest });
    }
  }
  return entries;
}

export async function getFullStatus(cwd: string): Promise<GitFullStatus | null> {
  const [branchRes, statusRes, countsRes, remotes, branches, commits] = await Promise.all([
    runGit(cwd, ["rev-parse", "--abbrev-ref", "HEAD"]),
    runGit(cwd, ["status", "--porcelain"]),
    runGit(cwd, ["rev-list", "--left-right", "--count", "@{upstream}...HEAD"]),
    listRemotes(cwd),
    listBranches(cwd),
    recentCommits(cwd),
  ]);

  if (!branchRes.ok) return null;

  const branch = branchRes.stdout.trim() || "HEAD";
  const entries = parsePorcelain(statusRes.stdout);
  const [behind, ahead] = countsRes.ok
    ? countsRes.stdout.trim().split(/\s+/).map(Number)
    : [0, 0];

  // Find upstream name for the current branch
  const currentBranch = branches.find((b) => b.current);
  const upstream = currentBranch?.upstream;

  const stagedCount = entries.filter((e) => e.index !== " " && e.index !== "?").length;
  const unstagedCount = entries.filter((e) => e.working !== " " && e.working !== "?").length;
  const untrackedCount = entries.filter((e) => e.index === "?").length;

  return {
    branch,
    upstream,
    ahead: ahead || 0,
    behind: behind || 0,
    clean: entries.length === 0,
    entries,
    stagedCount,
    unstagedCount,
    untrackedCount,
    remotes,
    branches,
    recentCommits: commits,
  };
}

// ── Mutating operations ──────────────────────────────────────────────────

export async function createBranch(
  cwd: string,
  name: string,
  from?: string,
  checkout?: boolean,
): Promise<GitResult> {
  const base = from ?? "HEAD";
  if (checkout) {
    const res = await runGit(cwd, ["checkout", "-b", name, base]);
    return {
      ok: res.ok,
      stdout: res.stdout,
      stderr: res.stderr,
      message: res.ok ? `Created and switched to ${name}` : undefined,
    };
  }
  const res = await runGit(cwd, ["branch", name, base]);
  return {
    ok: res.ok,
    stdout: res.stdout,
    stderr: res.stderr,
    message: res.ok ? `Created branch ${name}` : undefined,
  };
}

export async function checkoutBranch(
  cwd: string,
  name: string,
  track?: boolean,
): Promise<GitResult> {
  const args = track ? ["checkout", "-t", name] : ["checkout", name];
  const res = await runGit(cwd, args);
  return {
    ok: res.ok,
    stdout: res.stdout,
    stderr: res.stderr,
    message: res.ok ? `Switched to ${name}` : undefined,
  };
}

export async function deleteBranch(
  cwd: string,
  name: string,
  force?: boolean,
): Promise<GitResult> {
  const args = ["branch", force ? "-D" : "-d", name];
  const res = await runGit(cwd, args);
  return {
    ok: res.ok,
    stdout: res.stdout,
    stderr: res.stderr,
    message: res.ok ? `Deleted branch ${name}` : undefined,
  };
}

export async function stageFiles(cwd: string, paths: string[]): Promise<GitResult> {
  // Empty paths must NOT unstage the index — that is unstageAll / unstageFiles([]).
  if (paths.length === 0) {
    return {
      ok: false,
      stdout: "",
      stderr: "No paths to stage",
      message: undefined,
    };
  }
  const res = await runGit(cwd, ["add", "--", ...paths]);
  return { ok: res.ok, stdout: res.stdout, stderr: res.stderr, message: res.ok ? `Staged ${paths.length} file(s)` : undefined };
}

/** Unstage specific paths (`git restore --staged -- …`). */
export async function unstageFiles(cwd: string, paths: string[]): Promise<GitResult> {
  if (paths.length === 0) {
    return unstageAll(cwd);
  }
  // Prefer restore --staged (Git 2.23+); fall back to reset HEAD for older git.
  const restore = await runGit(cwd, ["restore", "--staged", "--", ...paths]);
  if (restore.ok) {
    return {
      ok: true,
      stdout: restore.stdout,
      stderr: restore.stderr,
      message: `Unstaged ${paths.length} file(s)`,
    };
  }
  const res = await runGit(cwd, ["reset", "HEAD", "--", ...paths]);
  return {
    ok: res.ok,
    stdout: res.stdout,
    stderr: res.stderr || restore.stderr,
    message: res.ok ? `Unstaged ${paths.length} file(s)` : undefined,
  };
}

/** Unstage everything in the index (`git reset --mixed HEAD`). */
export async function unstageAll(cwd: string): Promise<GitResult> {
  const res = await runGit(cwd, ["reset", "--mixed", "HEAD"]);
  return {
    ok: res.ok,
    stdout: res.stdout,
    stderr: res.stderr,
    message: res.ok ? "Unstaged all" : undefined,
  };
}

export async function stageAll(cwd: string, includeUntracked: boolean): Promise<GitResult> {
  const res = await runGit(cwd, ["add", includeUntracked ? "-A" : "-u"]);
  return {
    ok: res.ok,
    stdout: res.stdout,
    stderr: res.stderr,
    message: res.ok ? "Staged all changes" : undefined,
  };
}

export async function commit(
  cwd: string,
  message: string,
  opts: { stageAll?: boolean; stageAllIncludingUntracked?: boolean; amend?: boolean },
): Promise<GitResult> {
  if (opts.stageAll || opts.stageAllIncludingUntracked) {
    const stage = await stageAll(cwd, opts.stageAllIncludingUntracked ?? false);
    if (!stage.ok) return stage;
  }
  const args = ["commit"];
  if (opts.amend) {
    args.push("--amend");
    // When a new message is given, replace the old one; otherwise keep it.
    if (message) args.push("-m", message);
    else args.push("--no-edit");
  } else {
    args.push("-m", message);
  }
  const res = await runGit(cwd, args);
  return {
    ok: res.ok,
    stdout: res.stdout,
    stderr: res.stderr,
    message: res.ok ? (opts.amend ? "Amended commit" : "Committed") : undefined,
  };
}

export async function mergeBranch(
  cwd: string,
  branch: string,
  noFastForward?: boolean,
): Promise<GitResult> {
  const args = ["merge", branch];
  if (noFastForward) args.push("--no-ff");
  const res = await runGit(cwd, args);
  return {
    ok: res.ok,
    stdout: res.stdout,
    stderr: res.stderr,
    message: res.ok ? `Merged ${branch}` : undefined,
  };
}

export async function pushBranch(
  cwd: string,
  opts: { remote?: string; branch?: string; setUpstream?: boolean; force?: boolean },
): Promise<GitResult> {
  const remote = opts.remote ?? "origin";
  const args = ["push"];
  if (opts.setUpstream) args.push("-u");
  if (opts.force) args.push("--force");
  args.push(remote);
  if (opts.branch) args.push(opts.branch);
  const res = await runGit(cwd, args);
  return {
    ok: res.ok,
    stdout: res.stdout,
    stderr: res.stderr,
    message: res.ok ? `Pushed to ${remote}` : undefined,
  };
}

export async function pullBranch(
  cwd: string,
  opts: { remote?: string; branch?: string },
): Promise<GitResult> {
  const args = ["pull"];
  if (opts.remote) args.push(opts.remote);
  if (opts.branch) args.push(opts.branch);
  const res = await runGit(cwd, args);
  return {
    ok: res.ok,
    stdout: res.stdout,
    stderr: res.stderr,
    message: res.ok ? "Pulled latest" : undefined,
  };
}

export async function fetchRemotes(cwd: string, remote?: string): Promise<GitResult> {
  const args = ["fetch", "--prune"];
  if (remote) args.push(remote);
  const res = await runGit(cwd, args);
  return {
    ok: res.ok,
    stdout: res.stdout,
    stderr: res.stderr,
    message: res.ok ? "Fetched latest" : undefined,
  };
}
