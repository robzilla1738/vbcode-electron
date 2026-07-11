import type { ProjectSummary } from "../../shared/protocol";
import { projectLabel, relativeSessionTime } from "../../shared/project-index";

function folderLabel(cwd: string): string {
  const parts = cwd.replace(/\\/g, "/").split("/").filter(Boolean);
  return parts.at(-1) || cwd;
}

/** Shared boot / error copy so WelcomeGate and in-column SessionBoot match. */
export function bootHeading(label: string | null): string {
  return label ? `Opening ${label}` : "Opening project";
}

export function bootDetail(label: string | null): string {
  return label ? `Starting the engine in ${label}…` : "Starting the engine…";
}

export const BOOT_ERROR_TITLE = "Couldn’t open project";
export const BOOT_ERROR_DETAIL =
  "Check the error below, then retry or choose a different folder.";

export function WelcomeGate({
  booting,
  bootError,
  pendingCwd,
  recentProjects = [],
  onOpenProject,
  onOpenRecent,
  onRetry,
}: {
  booting: boolean;
  bootError: string | null;
  pendingCwd: string | null;
  recentProjects?: ProjectSummary[];
  onOpenProject: () => void;
  onOpenRecent?: (cwd: string) => void;
  onRetry?: () => void;
}) {
  const label = pendingCwd ? folderLabel(pendingCwd) : null;
  const title = booting
    ? bootHeading(label)
    : bootError
      ? BOOT_ERROR_TITLE
      : "Open a project";
  const detail = booting
    ? bootDetail(label)
    : bootError
      ? BOOT_ERROR_DETAIL
      : "Pick a folder to start coding with the same engine as the CLI.";

  const recents =
    !booting && !bootError && recentProjects.length > 0
      ? recentProjects.slice(0, 5)
      : [];

  return (
    <div className="app-shell">
      <div className="workspace">
        <div className="content-inset gate-inset">
          <header className="topbar gate-topbar">
            <div className="topbar-leading">
              <span className="gate-product-name">Vibe Codr</span>
            </div>
          </header>

          <main
            className="gate"
            id="main-content"
            aria-busy={booting || undefined}
            aria-labelledby="gate-title"
          >
            <div className="gate-inner">
              <div className="gate-copy">
                <h1 id="gate-title">{title}</h1>
                <p>{detail}</p>
              </div>

              {booting && (
                <div className="gate-status" role="status" aria-live="polite">
                  <span className="gate-spinner" aria-hidden />
                  <span>{bootHeading(label)}</span>
                </div>
              )}

              {bootError && (
                <pre className="gate-error" role="alert" tabIndex={-1}>
                  {bootError}
                </pre>
              )}

              {recents.length > 0 && (
                <ul className="gate-recents" aria-label="Recent projects">
                  {recents.map((project, index) => (
                    <li key={project.cwd}>
                      <button
                        type="button"
                        className="gate-recent"
                        onClick={() => onOpenRecent?.(project.cwd)}
                        title={project.cwd}
                        // biome-ignore lint/a11y/noAutofocus: single autofocus owner — first recent when present
                        autoFocus={index === 0}
                      >
                        <span className="gate-recent-name">
                          {projectLabel(project, recentProjects)}
                        </span>
                        <time
                          className="gate-recent-time"
                          dateTime={new Date(project.updatedAt).toISOString()}
                        >
                          {relativeSessionTime(project.updatedAt)}
                        </time>
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {!booting && (
                <div className="gate-actions">
                  {bootError && pendingCwd && onRetry && (
                    <button type="button" className="button" onClick={onRetry}>
                      Retry
                    </button>
                  )}
                  <button
                    type="button"
                    className="button primary"
                    onClick={onOpenProject}
                    // biome-ignore lint/a11y/noAutofocus: single autofocus owner — Open project only when no recents
                    autoFocus={recents.length === 0}
                  >
                    {bootError ? "Choose another project" : "Open project"}
                  </button>
                </div>
              )}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}

export function SessionBoot({ cwd }: { cwd: string }) {
  const label = folderLabel(cwd);
  return (
    <div
      className="session-boot"
      role="status"
      aria-busy="true"
      aria-live="polite"
      aria-labelledby="session-boot-title"
    >
      <div className="session-boot-inner">
        <span className="gate-spinner" aria-hidden />
        <div className="session-boot-copy">
          <h1 id="session-boot-title">{bootHeading(label)}</h1>
          <p>{bootDetail(label)}</p>
        </div>
      </div>
    </div>
  );
}

export function SessionBootError({
  error,
  onRetry,
  onOpenProject,
}: {
  error: string;
  onRetry: () => void;
  onOpenProject: () => void;
}) {
  return (
    <div
      className="session-boot session-boot-error"
      role="alert"
      aria-labelledby="session-boot-error-title"
    >
      <div className="session-boot-inner">
        <div className="session-boot-copy">
          <h1 id="session-boot-error-title">{BOOT_ERROR_TITLE}</h1>
          <p>{BOOT_ERROR_DETAIL}</p>
        </div>
        <pre className="gate-error" tabIndex={-1}>
          {error}
        </pre>
        <div className="gate-actions">
          <button type="button" className="button" onClick={onRetry}>
            Retry
          </button>
          <button
            type="button"
            className="button primary"
            onClick={onOpenProject}
            // biome-ignore lint/a11y/noAutofocus: single autofocus owner on in-column boot error
            autoFocus
          >
            Choose another project
          </button>
        </div>
      </div>
    </div>
  );
}
