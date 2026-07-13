/** Compact environment card for the chat surface. Keep workspace tools grouped
 * here so the project rail can stay focused on navigation and sessions. */

import type { ReactNode } from "react";
import { changedFilesTotals } from "../../shared/changed-files";
import type { ChangedFile } from "../../shared/reducer";
import {
  IconFile,
  IconFolderOpen,
  IconGitBranch,
  IconChevron,
  IconExternalLink,
  IconPanel,
  IconTerminal,
} from "../icons";

export type WorkspaceDockTarget =
  | "session"
  | "changes"
  | "git"
  | "jobs"
  | "files";

export function WorkspaceDock({
  changedFiles,
  cwd,
  project,
  branch,
  sessionOpen,
  gitOpen,
  jobsOpen,
  onOpen,
}: {
  changedFiles: ChangedFile[];
  cwd: string | null;
  project: string;
  branch: string | null;
  sessionOpen: boolean;
  gitOpen: boolean;
  jobsOpen: boolean;
  onOpen: (target: WorkspaceDockTarget) => void;
}) {
  const totals = changedFilesTotals(changedFiles);
  const hasChanges = totals.count > 0;

  return (
    <aside className="workspace-dock" aria-label="Environment">
      <div className="workspace-dock-header">
        <div className="workspace-dock-header-copy">
          <span className="workspace-dock-eyebrow">Environment</span>
          <span className="workspace-dock-project" title={project}>{project}</span>
        </div>
      </div>
      <nav className="workspace-dock-nav" aria-label="Workspace tools">
        <div className="workspace-dock-section-label">Workspace</div>
        <DockRow
          label="Changes"
          ariaLabel="Show session changes"
          title={
            hasChanges
              ? `Review ${totals.count} file${totals.count === 1 ? "" : "s"} · +${totals.added} −${totals.removed}`
              : "Review session changes"
          }
          active={false}
          meta={
            <span className="workspace-dock-meta">
              <span className="diff-add-count">+{totals.added}</span>
              <span className="diff-del-count">−{totals.removed}</span>
            </span>
          }
          onClick={() => onOpen("changes")}
          icon={<IconFile size={15} />}
        />
        <DockRow
          label="Local"
          ariaLabel={`Reveal ${project} in Finder`}
          title={cwd ? "Reveal project in Finder" : "Open a project first"}
          disabled={!cwd}
          meta={<IconChevron size={13} />}
          onClick={() => onOpen("files")}
          icon={<IconFolderOpen size={15} />}
        />
        <DockRow
          label={branch ?? "Git"}
          ariaLabel="Open git panel"
          title={cwd ? "Branches, commit, remotes, PRs" : "Open a project first"}
          active={gitOpen}
          disabled={!cwd}
          meta={<IconChevron size={13} />}
          onClick={() => onOpen("git")}
          icon={<IconGitBranch size={15} />}
        />
        <DockRow
          label="Commit or push"
          ariaLabel="Open git commit and push actions"
          title={hasChanges ? "Open Git to commit or push" : "No changes to commit or push"}
          disabled={!cwd || !hasChanges}
          onClick={() => onOpen("git")}
          icon={<IconGitBranch size={15} />}
        />
        <DockRow
          label="Compare branch"
          ariaLabel="Compare the current branch"
          title={cwd ? "Open Git branch comparison" : "Open a project first"}
          disabled={!cwd}
          meta={<IconExternalLink size={13} />}
          onClick={() => onOpen("git")}
          icon={<IconGitBranch size={15} />}
        />
        <div className="workspace-dock-divider" />
        <div className="workspace-dock-section-label">Session</div>
        <DockRow
          label="Session"
          ariaLabel="Show session panel"
          title="Open session details"
          active={sessionOpen}
          onClick={() => onOpen("session")}
          icon={<IconPanel size={15} />}
        />
        <DockRow
          label="Jobs"
          ariaLabel="Toggle background jobs"
          title="Background jobs and local servers"
          active={jobsOpen}
          onClick={() => onOpen("jobs")}
          icon={<IconTerminal size={15} />}
        />
        <DockRow
          label="Files"
          ariaLabel="Reveal project in Finder"
          title={cwd ? "Reveal project in Finder" : "Open a project first"}
          disabled={!cwd}
          onClick={() => onOpen("files")}
          icon={<IconFolderOpen size={15} />}
        />
      </nav>
    </aside>
  );
}

function DockRow({
  label,
  ariaLabel,
  title,
  icon,
  meta,
  active,
  disabled,
  onClick,
}: {
  label: string;
  /** Accessible name (may be richer than the visible label). */
  ariaLabel: string;
  title: string;
  icon: ReactNode;
  meta?: ReactNode;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`workspace-dock-row${active ? " is-active" : ""}`}
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={ariaLabel}
      aria-pressed={active}
    >
      <span className="workspace-dock-row-icon" aria-hidden>
        {icon}
      </span>
      <span className="workspace-dock-row-label">{label}</span>
      {meta ? <span className="workspace-dock-row-meta">{meta}</span> : null}
    </button>
  );
}
