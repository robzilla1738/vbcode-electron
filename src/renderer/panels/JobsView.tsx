import type { JobInfo } from "../../shared/types";
import { externalHref } from "../../shared/sources";

function statusLabel(status: JobInfo["status"]): string {
  if (status === "running") return "Running";
  if (status === "killed") return "Killed";
  return "Exited";
}

export function JobsView({ jobs }: { jobs: JobInfo[] }) {
  if (jobs.length === 0) {
    return (
      <div className="jobs-view transcript">
        <div className="empty-state">
          <h2>No background jobs are running.</h2>
          <p>Long-running commands and local servers will appear here.</p>
        </div>
      </div>
    );
  }
  return (
    <div className="jobs-view transcript">
      {jobs.map((j) => (
        <div key={j.id} className="job-card">
          <div className="job-header">
            <span className={`job-status job-status-${j.status}`}>{statusLabel(j.status)}</span>
            <span className="job-command">{j.command}</span>
            {j.status === "running" && j.pid != null && (
              <span className="job-pid">pid {j.pid}</span>
            )}
            {j.exitCode != null && j.status !== "running" && (
              <span className="job-exit">exit {j.exitCode}</span>
            )}
          </div>
          {j.servers.length > 0 && (
            <div className="job-links">
              {j.servers.map((server) => {
                const href = externalHref(server);
                return href ? (
                  <a
                    key={server}
                    href={href}
                    onClick={(event) => {
                      event.preventDefault();
                      void window.vibe.openExternal(href);
                    }}
                  >
                    {server}
                  </a>
                ) : null;
              })}
            </div>
          )}
          {j.outputTail && (
            <pre className="job-output">
              {j.outputTail.slice(-600)}
            </pre>
          )}
        </div>
      ))}
    </div>
  );
}
