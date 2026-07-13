/**
 * Right workspace strip — full-label actions, seamless with the chat column.
 * No project header, no divider: same surface as the stage until a row is active.
 * Opens Session, Changes, Git, Jobs, and reveals Files. Keep topbar free of these.
 */

import type { ReactNode } from "react";
import { changedFilesTotals } from "../../shared/changed-files";
import type { ChangedFile } from "../../shared/reducer";
import {
  IconFile,
  IconFolderOpen,
  IconGitBranch,
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
  sessionOpen,
  gitOpen,
  jobsOpen,
  onOpen,
}: {
  changedFiles: ChangedFile[];
  cwd: string | null;
  sessionOpen: boolean;
  gitOpen: boolean;
  jobsOpen: boolean;
  onOpen: (target: WorkspaceDockTarget) => void;
}) {
  const totals = changedFilesTotals(changedFiles);
  const hasChanges = totals.count > 0;

  return (
    <aside className="workspace-dock" aria-label="Workspace">
      <nav className="workspace-dock-nav" aria-label="Workspace tools">
        <DockRow
          label="Session"
          ariaLabel="Show session panel"
          title="Session panel — model, context, tasks"
          active={sessionOpen}
          onClick={() => onOpen("session")}
          icon={<IconPanel size={15} />}
        />
        <DockRow
          label="Changes"
          ariaLabel="Show session changes"
          title={
            hasChanges
              ? `Review ${totals.count} file${totals.count === 1 ? "" : "s"} · +${totals.added} −${totals.removed}`
              : "No file changes this session"
          }
          active={false}
          disabled={!hasChanges}
          meta={
            hasChanges ? (
              <span className="workspace-dock-meta">
                <span className="diff-add-count">+{totals.added}</span>
                <span className="diff-del-count">−{totals.removed}</span>
              </span>
            ) : null
          }
          onClick={() => onOpen("changes")}
          icon={<IconFile size={15} />}
        />
        <DockRow
          label="Git"
          ariaLabel="Open git panel"
          title={cwd ? "Branches, commit, remotes, PRs" : "Open a project first"}
          active={gitOpen}
          disabled={!cwd}
          onClick={() => onOpen("git")}
          icon={<IconGitBranch size={15} />}
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
