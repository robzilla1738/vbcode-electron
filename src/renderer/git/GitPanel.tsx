/**
 * Git view — full-workspace git integration for branch management and PRs.
 *
 * When active, this replaces the normal workspace layout:
 *   Left rail  → git tabs (Branches, Changes, History, Remotes, PRs) + quick actions
 *   Center     → scrollable content for the active tab
 *
 * All git operations spawn `git` directly from the main process — the engine
 * is never involved. GitHub PR actions use the `gh` CLI when available.
 */

import { useCallback, useEffect, useState } from "react";
import type { GitFullStatus } from "../../shared/git-types";
import { IconClose, IconSidebar } from "../icons";

type Tab = "branches" | "changes" | "history" | "remotes" | "prs";

const TABS: { id: Tab; label: string; desc: string }[] = [
  { id: "branches", label: "Branches", desc: "Create, switch, delete" },
  { id: "changes", label: "Changes", desc: "Stage, commit, amend" },
  { id: "history", label: "History", desc: "Recent commits" },
  { id: "remotes", label: "Remotes", desc: "Remote URLs and hosts" },
  { id: "prs", label: "Pull Requests", desc: "List and create via gh" },
];

function relativeDate(ms: number): string {
  const diff = Date.now() - ms;
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "now";
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}d`;
  const mo = Math.floor(day / 30);
  if (mo < 12) return `${mo}mo`;
  return `${Math.floor(mo / 12)}y`;
}

function statusIcon(index: string, working: string): string {
  if (index === "?" && working === "?") return "?";
  if (index === "A") return "A";
  if (index === "M" || working === "M") return "M";
  if (index === "D" || working === "D") return "D";
  if (index === "R") return "R";
  return index !== " " ? index : working;
}

interface GitOpResult { ok: boolean; message?: string; error?: string }

// ── Sidebar ──────────────────────────────────────────────────────────────

export function GitSidebar({
  status,
  cwd,
  activeTab,
  onSelectTab,
  busy,
  onAction,
  onClose,
}: {
  status: GitFullStatus | null;
  cwd: string;
  loading: boolean;
  activeTab: Tab;
  onSelectTab: (tab: Tab) => void;
  busy: boolean;
  onAction: (op: () => Promise<GitOpResult>, msg?: string) => void;
  onClose: () => void;
}) {
  return (
    <aside
      id="project-rail"
      className="project-rail is-open settings-rail"
      aria-label="Git sections"
    >
      <div className="rail-chrome">
        <button type="button" className="icon-button rail-chrome-toggle no-drag" onClick={onClose} aria-label="Close git panel">
          <IconSidebar size={15} />
        </button>
      </div>

      <div className="rail-title-row">
        <h1 className="rail-product-name">Git</h1>
      </div>

      {status && (
        <div className="git-rail-status">
          <span className="git-branch-name">{status.branch}</span>
          <div className="git-rail-meta">
            {status.upstream && <span className="git-upstream">{status.upstream}</span>}
            {status.ahead > 0 && <span className="git-ahead">↑{status.ahead}</span>}
            {status.behind > 0 && <span className="git-behind">↓{status.behind}</span>}
            {status.clean
              ? <span className="git-clean">clean</span>
              : <span className="git-dirty">{status.entries.length} changed</span>}
          </div>
        </div>
      )}

      {/* Quick actions */}
      <div className="rail-actions">
        <button type="button" className="rail-action" disabled={busy} onClick={() => onAction(() => window.vibe.gitFetch({ cwd }))}>
          <span>Fetch</span>
        </button>
        <button type="button" className="rail-action" disabled={busy} onClick={() => onAction(() => window.vibe.gitPull({ cwd }))}>
          <span>Pull</span>
        </button>
        <button type="button" className="rail-action" disabled={busy} onClick={() => onAction(() => window.vibe.gitPush({ cwd }))}>
          <span>Push</span>
        </button>
      </div>

      <h2 className="rail-section-label">Sections</h2>
      <nav className="settings-nav-list" aria-label="Git sections">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`settings-nav-item${activeTab === tab.id ? " active" : ""}`}
            onClick={() => onSelectTab(tab.id)}
          >
            <span className="settings-nav-label">
              {tab.label}
              {tab.id === "changes" && status && status.entries.length > 0 && (
                <span className="git-tab-count">{status.entries.length}</span>
              )}
            </span>
            <span className="settings-nav-desc">{tab.desc}</span>
          </button>
        ))}
      </nav>
    </aside>
  );
}

// ── Content area ─────────────────────────────────────────────────────────

export function GitContent({
  status,
  tab,
  cwd,
  busy,
  runOp,
  loading,
  error,
  onRetry,
  ghAvailable,
  showToast,
}: {
  status: GitFullStatus | null;
  tab: Tab;
  cwd: string;
  busy: boolean;
  runOp: (op: () => Promise<GitOpResult>, msg?: string) => void;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  ghAvailable: boolean;
  showToast: (message: string, severity?: "info" | "warn" | "error") => void;
}) {
  if (loading) {
    return <div className="settings-loading"><span className="spinner" aria-hidden /> Loading git status…</div>;
  }
  if (error) {
    return (
      <div className="settings-error" role="alert">
        <p>{error}</p>
        <button type="button" className="button" onClick={onRetry}>Retry</button>
      </div>
    );
  }
  if (!status) {
    return <p className="setting-empty">This directory is not a git repository.</p>;
  }

  return (
    <div className="settings-form-scroll">
      {tab === "branches" && <BranchesContent status={status} cwd={cwd} busy={busy} runOp={runOp} />}
      {tab === "changes" && <ChangesContent status={status} cwd={cwd} busy={busy} runOp={runOp} />}
      {tab === "history" && <HistoryContent status={status} />}
      {tab === "remotes" && <RemotesContent status={status} />}
      {tab === "prs" && <PrsContent cwd={cwd} ghAvailable={ghAvailable} showToast={showToast} />}
    </div>
  );
}

// ── Combined view (used by App.tsx) ──────────────────────────────────────

export function GitView({
  cwd,
  onClose,
  showToast,
}: {
  cwd: string;
  onClose: () => void;
  showToast: (message: string, severity?: "info" | "warn" | "error") => void;
}) {
  const [tab, setTab] = useState<Tab>("branches");
  const [status, setStatus] = useState<GitFullStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [ghAvailable, setGhAvailable] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await window.vibe.gitStatus(cwd);
      if (!res.ok) { setError(res.error); setLoading(false); return; }
      setStatus(res.status); setLoading(false);
    } catch (err) { setError(err instanceof Error ? err.message : "Failed"); setLoading(false); }
  }, [cwd]);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => { void window.vibe.ghCheckAvailable().then((res) => setGhAvailable(res.available)); }, []);

  const runOp = useCallback(async (op: () => Promise<GitOpResult>, successMsg?: string) => {
    setBusy(true);
    try {
      const res = await op();
      if (res.ok) { showToast(successMsg ?? res.message ?? "Done", "info"); await refresh(); }
      else { showToast(res.error ?? "Operation failed", "error"); }
    } catch (err) { showToast(err instanceof Error ? err.message : "Operation failed", "error"); }
    finally { setBusy(false); }
  }, [refresh, showToast]);

  // Keyboard: Escape closes
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); onClose(); }
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [onClose]);

  const activeMeta = TABS.find((t) => t.id === tab);

  return (
    <>
      <GitSidebar
        status={status}
        cwd={cwd}
        loading={loading}
        activeTab={tab}
        onSelectTab={setTab}
        busy={busy}
        onAction={runOp}
        onClose={onClose}
      />
      <div className="content-inset">
        <header className="topbar">
          <div className="topbar-leading">
            <h1 className="topbar-title">
              <span className="topbar-project">Git</span>
              <span className="topbar-separator" aria-hidden>/</span>
              <span className="topbar-session">{activeMeta?.label}</span>
            </h1>
          </div>
          <div className="topbar-actions no-drag">
            <button type="button" className="icon-button" onClick={onClose} aria-label="Close git panel" title="Close (Esc)">
              <IconClose size={16} />
            </button>
          </div>
        </header>
        <div className="main-column settings-main" id="main-content">
          <GitContent
            status={status}
            tab={tab}
            cwd={cwd}
            busy={busy}
            runOp={runOp}
            loading={loading}
            error={error}
            onRetry={refresh}
            ghAvailable={ghAvailable}
            showToast={showToast}
          />
        </div>
      </div>
    </>
  );
}

// ── Tab content components ───────────────────────────────────────────────

function BranchesContent({ status, cwd, busy, runOp }: { status: GitFullStatus; cwd: string; busy: boolean; runOp: (op: () => Promise<GitOpResult>, msg?: string) => void }) {
  const [newBranch, setNewBranch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const localBranches = status.branches.filter((b) => !b.remote);
  const remoteBranches = status.branches.filter((b) => b.remote);

  return (
    <div className="settings-section">
      <div className="git-section-header">
        <h3 className="setting-section-title">Local branches</h3>
        <button type="button" className="button" onClick={() => setShowCreate(!showCreate)}>New branch</button>
      </div>
      {showCreate && (
        <div className="git-create-row">
          <input type="text" className="setting-input is-mono" value={newBranch} placeholder="branch-name" onChange={(e) => setNewBranch(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && newBranch.trim()) { void runOp(() => window.vibe.gitCreateBranch({ cwd, name: newBranch.trim(), checkout: true }), `Created and switched to ${newBranch.trim()}`); setNewBranch(""); setShowCreate(false); } if (e.key === "Escape") { setShowCreate(false); setNewBranch(""); } }}
          />
          <button type="button" className="button primary" disabled={!newBranch.trim() || busy} onClick={() => { void runOp(() => window.vibe.gitCreateBranch({ cwd, name: newBranch.trim(), checkout: true }), `Created and switched to ${newBranch.trim()}`); setNewBranch(""); setShowCreate(false); }}>Create & switch</button>
          <button type="button" className="button" onClick={() => { setShowCreate(false); setNewBranch(""); }}>Cancel</button>
        </div>
      )}
      <div className="git-branch-list">
        {localBranches.map((branch) => (
          <div key={branch.name} className={`git-branch-row${branch.current ? " current" : ""}`}>
            <button type="button" className="git-branch-main" disabled={branch.current || busy} onClick={() => void runOp(() => window.vibe.gitCheckout({ cwd, name: branch.name }), `Switched to ${branch.name}`)}>
              <span className="git-branch-marker">{branch.current ? "●" : "○"}</span>
              <span className="git-branch-label">{branch.name}</span>
              {(branch.ahead ?? 0) > 0 && <span className="git-ahead">↑{branch.ahead}</span>}
              {(branch.behind ?? 0) > 0 && <span className="git-behind">↓{branch.behind}</span>}
              {branch.lastSubject && <span className="git-branch-subject" title={branch.lastSubject}>{branch.lastSubject}</span>}
              {branch.lastDate && <span className="git-branch-date">{relativeDate(branch.lastDate)}</span>}
            </button>
            {!branch.current && (confirmDelete === branch.name ? (
              <div className="git-confirm-delete">
                <button type="button" className="button danger" onClick={() => { void runOp(() => window.vibe.gitDeleteBranch({ cwd, name: branch.name })); setConfirmDelete(null); }}>Confirm</button>
                <button type="button" className="button" onClick={() => setConfirmDelete(null)}>Cancel</button>
              </div>
            ) : (
              <button type="button" className="git-branch-action" onClick={() => setConfirmDelete(branch.name)} title="Delete branch" disabled={busy}>✕</button>
            ))}
          </div>
        ))}
      </div>
      {remoteBranches.length > 0 && (
        <>
          <h4 className="git-changes-heading">Remote branches</h4>
          <div className="git-branch-list">
            {remoteBranches.map((branch) => (
              <div key={branch.name} className="git-branch-row remote">
                <button type="button" className="git-branch-main" disabled={busy} onClick={() => void runOp(() => window.vibe.gitCheckout({ cwd, name: branch.name, track: true }), `Switched to ${branch.name}`)}>
                  <span className="git-branch-marker">○</span>
                  <span className="git-branch-label">{branch.name}</span>
                  {branch.lastSubject && <span className="git-branch-subject" title={branch.lastSubject}>{branch.lastSubject}</span>}
                  {branch.lastDate && <span className="git-branch-date">{relativeDate(branch.lastDate)}</span>}
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function ChangesContent({ status, cwd, busy, runOp }: { status: GitFullStatus; cwd: string; busy: boolean; runOp: (op: () => Promise<GitOpResult>, msg?: string) => void }) {
  const [commitMsg, setCommitMsg] = useState("");
  const [stageAllUntracked, setStageAllUntracked] = useState(false);

  if (status.clean) return <p className="setting-empty git-clean-msg">Working tree is clean — no changes to commit.</p>;
  const staged = status.entries.filter((e) => e.index !== " " && e.index !== "?");
  const unstaged = status.entries.filter((e) => e.working !== " " && e.working !== "?");
  const untracked = status.entries.filter((e) => e.index === "?");

  return (
    <div className="settings-section">
      <div className="git-changes-actions">
        <button type="button" className="button" disabled={busy} onClick={() => void runOp(() => window.vibe.gitStage({ cwd, all: true, allIncludingUntracked: stageAllUntracked }))}>Stage all</button>
        <button type="button" className="button" disabled={busy} onClick={() => void runOp(() => window.vibe.gitStage({ cwd }))}>Unstage all</button>
        <label className="git-checkbox"><input type="checkbox" checked={stageAllUntracked} onChange={(e) => setStageAllUntracked(e.target.checked)} />Include untracked</label>
      </div>
      {staged.length > 0 && (<><h4 className="git-changes-heading">Staged ({staged.length})</h4><div className="git-file-list">{staged.map((entry, i) => (<div key={i} className="git-file-row"><span className="git-file-status git-status-staged">{statusIcon(entry.index, " ")}</span><span className="git-file-path" title={entry.path}>{entry.path}</span><button type="button" className="git-file-action" disabled={busy} onClick={() => void runOp(() => window.vibe.gitStage({ cwd, paths: [entry.path] }))} title="Unstage">−</button></div>))}</div></>)}
      {unstaged.length > 0 && (<><h4 className="git-changes-heading">Unstaged ({unstaged.length})</h4><div className="git-file-list">{unstaged.map((entry, i) => (<div key={i} className="git-file-row"><span className="git-file-status git-status-unstaged">{statusIcon(" ", entry.working)}</span><span className="git-file-path" title={entry.path}>{entry.path}</span><button type="button" className="git-file-action" disabled={busy} onClick={() => void runOp(() => window.vibe.gitStage({ cwd, paths: [entry.path] }))} title="Stage">+</button></div>))}</div></>)}
      {untracked.length > 0 && (<><h4 className="git-changes-heading">Untracked ({untracked.length})</h4><div className="git-file-list">{untracked.map((entry, i) => (<div key={i} className="git-file-row"><span className="git-file-status git-status-untracked">?</span><span className="git-file-path" title={entry.path}>{entry.path}</span><button type="button" className="git-file-action" disabled={busy} onClick={() => void runOp(() => window.vibe.gitStage({ cwd, paths: [entry.path] }))} title="Stage">+</button></div>))}</div></>)}
      <div className="git-commit-area">
        <textarea className="setting-textarea" value={commitMsg} onChange={(e) => setCommitMsg(e.target.value)} placeholder="Commit message…" rows={3} />
        <div className="git-commit-actions">
          <button type="button" className="button primary" disabled={!commitMsg.trim() || busy} onClick={() => { void runOp(() => window.vibe.gitCommit({ cwd, message: commitMsg.trim(), stageAllIncludingUntracked: stageAllUntracked }), "Committed"); setCommitMsg(""); }}>Commit</button>
          <button type="button" className="button" disabled={!commitMsg.trim() || busy} onClick={() => { void runOp(() => window.vibe.gitCommit({ cwd, message: commitMsg.trim(), amend: true }), "Amended"); setCommitMsg(""); }}>Amend</button>
        </div>
      </div>
    </div>
  );
}

function HistoryContent({ status }: { status: GitFullStatus }) {
  return (
    <div className="settings-section">
      <h4 className="git-changes-heading">Recent commits</h4>
      <div className="git-commit-list">
        {status.recentCommits.map((commit) => (
          <div key={commit.hash} className="git-commit-row">
            <span className="git-commit-hash" title={commit.hash}>{commit.shortHash}</span>
            <span className="git-commit-subject" title={commit.subject}>{commit.subject}</span>
            <span className="git-commit-author">{commit.author}</span>
            <span className="git-commit-date">{relativeDate(commit.date)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function RemotesContent({ status }: { status: GitFullStatus }) {
  return (
    <div className="settings-section">
      <h4 className="git-changes-heading">Remotes</h4>
      {status.remotes.length === 0 ? <p className="setting-empty">No remotes configured.</p> : (
        <div className="git-remote-list">
          {status.remotes.map((remote) => (
            <div key={remote.name} className="git-remote-row">
              <div className="git-remote-info"><span className="git-remote-name">{remote.name}</span><span className="git-remote-url" title={remote.url}>{remote.url}</span></div>
              {remote.host && <span className="git-remote-host">{remote.host}{remote.owner && remote.repo && ` · ${remote.owner}/${remote.repo}`}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PrsContent({ cwd, ghAvailable, showToast }: { cwd: string; ghAvailable: boolean; showToast: (message: string, severity?: "info" | "warn" | "error") => void }) {
  const [prs, setPrs] = useState<{ number: number; title: string; state: string; head: string; url: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [prTitle, setPrTitle] = useState("");
  const [prBody, setPrBody] = useState("");
  const [prBase, setPrBase] = useState("");
  const [prDraft, setPrDraft] = useState(false);
  const [creating, setCreating] = useState(false);

  const loadPrs = useCallback(async () => {
    setLoading(true); setError(null);
    try { const res = await window.vibe.ghPrList(cwd); if (!res.ok) { setError(res.error ?? "Failed"); setLoading(false); return; } setPrs(res.prs); setLoading(false); }
    catch (err) { setError(err instanceof Error ? err.message : "Failed"); setLoading(false); }
  }, [cwd]);

  useEffect(() => { if (ghAvailable) void loadPrs(); }, [ghAvailable, loadPrs]);

  const createPr = useCallback(async () => {
    setCreating(true);
    try {
      const res = await window.vibe.ghPrCreate({ cwd, title: prTitle.trim(), body: prBody.trim() || undefined, base: prBase.trim() || undefined, draft: prDraft });
      if (res.ok) { showToast(res.url ? `PR created: ${res.url}` : "PR created", "info"); if (res.url) void window.vibe.openExternal(res.url); setShowCreate(false); setPrTitle(""); setPrBody(""); setPrBase(""); setPrDraft(false); void loadPrs(); }
      else { showToast(res.error ?? "Failed to create PR", "error"); }
    } finally { setCreating(false); }
  }, [cwd, prTitle, prBody, prBase, prDraft, showToast, loadPrs]);

  if (!ghAvailable) {
    return (
      <div className="settings-section">
        <p className="setting-empty">GitHub CLI (<code>gh</code>) is not installed. Install it to manage pull requests.</p>
        <button type="button" className="button" onClick={() => void window.vibe.openExternal("https://cli.github.com/")}>Install gh CLI</button>
      </div>
    );
  }

  return (
    <div className="settings-section">
      <div className="git-section-header">
        <h3 className="setting-section-title">Pull Requests</h3>
        <button type="button" className="button" onClick={() => setShowCreate(!showCreate)}>New PR</button>
      </div>
      {showCreate && (
        <div className="git-pr-create">
          <input className="setting-input" value={prTitle} placeholder="PR title" onChange={(e) => setPrTitle(e.target.value)} />
          <textarea className="setting-textarea" value={prBody} placeholder="PR description (optional)" rows={4} onChange={(e) => setPrBody(e.target.value)} />
          <input className="setting-input" value={prBase} placeholder="base branch (optional)" onChange={(e) => setPrBase(e.target.value)} />
          <label className="git-checkbox"><input type="checkbox" checked={prDraft} onChange={(e) => setPrDraft(e.target.checked)} />Draft PR</label>
          <div className="git-commit-actions">
            <button type="button" className="button primary" disabled={!prTitle.trim() || creating} onClick={() => void createPr()}>{creating ? "Creating…" : "Create PR"}</button>
            <button type="button" className="button" onClick={() => setShowCreate(false)}>Cancel</button>
          </div>
        </div>
      )}
      {loading ? <p className="setting-empty"><span className="spinner" aria-hidden /> Loading PRs…</p>
        : error ? <div className="settings-save-error" role="alert">{error}</div>
        : prs.length === 0 ? <p className="setting-empty">No open pull requests.</p>
        : <div className="git-pr-list">{prs.map((pr) => (<button key={pr.number} type="button" className="git-pr-row" onClick={() => void window.vibe.openExternal(pr.url)}><span className="git-pr-number">#{pr.number}</span><span className="git-pr-title">{pr.title}</span><span className={`git-pr-state ${pr.state.toLowerCase()}`}>{pr.state}</span><span className="git-pr-branch">{pr.head}</span></button>))}</div>}
    </div>
  );
}
