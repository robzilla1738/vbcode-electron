function projectLabel(cwd: string): string {
  const parts = cwd.replace(/\\/g, "/").split("/").filter(Boolean);
  return parts.at(-1) || cwd;
}

export function WelcomeGate({
  booting,
  bootError,
  pendingCwd,
  onOpenProject,
  onRetry,
}: {
  booting: boolean;
  bootError: string | null;
  pendingCwd: string | null;
  onOpenProject: () => void;
  onRetry?: () => void;
}) {
  const label = pendingCwd ? projectLabel(pendingCwd) : null;

  return (
    <div className="app-shell">
      <div className="workspace">
        <div className="content-inset gate-inset">
          <header className="topbar gate-topbar">
            <div className="topbar-leading">
              <span className="gate-product-name">Vibe Codr</span>
            </div>
          </header>

          <main className="gate" id="main-content">
            <div className="gate-inner">
              <div className="gate-copy">
                <h1>{booting ? "Opening project" : bootError ? "Couldn’t open project" : "Open a project"}</h1>
                <p>
                  {booting
                    ? label
                      ? `Starting the vibe-codr engine in ${label}…`
                      : "Starting the vibe-codr engine…"
                    : bootError
                      ? "Check the error below, then retry or choose a different folder."
                      : "Pick a folder to start coding with the same engine as the CLI."}
                </p>
              </div>

              {booting && (
                <div className="gate-status" role="status">
                  <span className="gate-spinner" aria-hidden />
                  <span>{label ? `Opening ${label}` : "Opening workspace"}</span>
                </div>
              )}

              {bootError && (
                <pre className="gate-error" role="alert">
                  {bootError}
                </pre>
              )}

              {!booting && (
                <div className="gate-actions">
                  {bootError && pendingCwd && onRetry && (
                    <button type="button" className="button" onClick={onRetry}>
                      Retry
                    </button>
                  )}
                  <button type="button" className="button primary" onClick={onOpenProject}>
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
  return (
    <div className="session-boot" role="status">
      <div className="session-boot-inner">
        <span className="gate-spinner" aria-hidden />
        <div className="session-boot-copy">
          <h1>Opening {projectLabel(cwd)}</h1>
          <p>Loading session…</p>
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
    <div className="session-boot session-boot-error" role="alert">
      <div className="session-boot-inner">
        <div className="session-boot-copy">
          <h1>Couldn’t open session</h1>
          <p>Retry this project or choose a different folder.</p>
        </div>
        <pre className="gate-error">{error}</pre>
        <div className="gate-actions">
          <button type="button" className="button" onClick={onRetry}>
            Retry
          </button>
          <button type="button" className="button primary" onClick={onOpenProject}>
            Open project
          </button>
        </div>
      </div>
    </div>
  );
}
