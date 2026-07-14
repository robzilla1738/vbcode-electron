/**
 * Git operation types for the Electron shell's GitHub/branch integration panel.
 *
 * All git operations are performed by the Electron main process spawning `git`
 * directly — these are shell-level operations, NOT engine commands. The engine
 * remains the sole authority for agent-loop work; this panel manages the working
 * tree's branch state the way a developer would at the terminal.
 */

export interface GitBranch {
  name: string;
  current: boolean;
  remote: boolean;
  /** Upstream tracking branch, if any (e.g. "origin/main"). */
  upstream?: string;
  /** Commits ahead of upstream (0 when no upstream). */
  ahead?: number;
  /** Commits behind upstream (0 when no upstream). */
  behind?: number;
  /** Last commit subject on this branch. */
  lastSubject?: string;
  /** Last commit date (epoch ms). */
  lastDate?: number;
}

export interface GitRemote {
  name: string;
  url: string;
  /** Normalized host for display (e.g. "github.com"). */
  host?: string;
  /** Owner/repo extracted from the URL, when available. */
  owner?: string;
  repo?: string;
}

export interface GitCommitInfo {
  hash: string;
  shortHash: string;
  author: string;
  date: number;
  subject: string;
}

export interface GitStatusEntry {
  /** Porcelain status code (e.g. "M", "A", "D", "??", "R"). */
  index: string;
  /** Working-tree status code. */
  working: string;
  path: string;
  /** Original path for renames. */
  oldPath?: string;
}

export interface GitStatusResult {
  branch: string;
  upstream?: string;
  ahead: number;
  behind: number;
  clean: boolean;
  entries: GitStatusEntry[];
  stagedCount: number;
  unstagedCount: number;
  untrackedCount: number;
}

export interface GitFullStatus extends GitStatusResult {
  remotes: GitRemote[];
  branches: GitBranch[];
  recentCommits: GitCommitInfo[];
}

export type GitFileDiffResult =
  | { ok: true; available: false }
  | {
      ok: true;
      available: true;
      diff: string;
      added: number;
      removed: number;
    }
  | { ok: false; error: string };

// ── Operation request/result types ───────────────────────────────────────

export interface GitCreateBranchRequest {
  cwd: string;
  name: string;
  /** Base branch/commit to branch from. Defaults to HEAD. */
  from?: string;
  /** Checkout the new branch after creating it. */
  checkout?: boolean;
}

export interface GitCheckoutRequest {
  cwd: string;
  name: string;
  /** Create the local branch from upstream if it doesn't exist. */
  track?: boolean;
}

export interface GitDeleteBranchRequest {
  cwd: string;
  name: string;
  force?: boolean;
}

export interface GitCommitRequest {
  cwd: string;
  message: string;
  /** Stage all tracked changes before committing (git add -u). */
  stageAll?: boolean;
  /** Also stage untracked files (git add -A). */
  stageAllIncludingUntracked?: boolean;
  /** Amend the previous commit instead of creating a new one. */
  amend?: boolean;
}

export interface GitMergeRequest {
  cwd: string;
  branch: string;
  /** Create a merge commit even when fast-forward is possible. */
  noFastForward?: boolean;
}

export interface GitPushRequest {
  cwd: string;
  /** Remote name. Defaults to "origin". */
  remote?: string;
  /** Branch to push. Defaults to current. */
  branch?: string;
  /** Set upstream tracking on first push. */
  setUpstream?: boolean;
  force?: boolean;
}

export interface GitPullRequest {
  cwd: string;
  remote?: string;
  branch?: string;
}

export interface GitResult {
  ok: boolean;
  stdout: string;
  stderr: string;
  /** Human-readable summary for a toast. */
  message?: string;
}

export interface GhPrCreateRequest {
  cwd: string;
  title: string;
  body?: string;
  base?: string;
  head?: string;
  draft?: boolean;
  web?: boolean;
}

export interface GhPrCreateResult {
  ok: boolean;
  url?: string;
  message?: string;
  error?: string;
}

export interface GhPrListResult {
  ok: boolean;
  prs: { number: number; title: string; state: string; head: string; url: string }[];
  error?: string;
}
