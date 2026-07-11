import { useEffect, useRef } from "react";
import type { JobInfo } from "../../shared/types";
import { IconClose, IconJobs, IconLink } from "../icons";
import { ExternalLink } from "../primitives";

function statusLabel(status: JobInfo["status"]): string {
  if (status === "running") return "Running";
  if (status === "killed") return "Killed";
  return "Exited";
}

function focusableIn(root: ParentNode | null): HTMLElement[] {
  if (!root) return [];
  return Array.from(
    root.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((el) => {
    const style = window.getComputedStyle(el);
    return style.visibility !== "hidden" && style.display !== "none";
  });
}

export function JobsView({
  jobs,
  onClose,
}: {
  jobs: JobInfo[];
  onClose?: () => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    // Capture the element that opened the drawer (e.g. the Jobs toggle) before
    // moving focus inside, so we can restore it on close (I47 — no focus orphan).
    const trigger = document.activeElement as HTMLElement | null;
    const close = root.querySelector<HTMLButtonElement>(".jobs-close");
    (close ?? root).focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const targets = focusableIn(root);
      if (targets.length === 0) return;
      const active = document.activeElement as HTMLElement | null;
      const index = active ? targets.indexOf(active) : -1;
      if (index < 0) return;
      if (event.shiftKey && index === 0) {
        event.preventDefault();
        targets.at(-1)?.focus();
      } else if (!event.shiftKey && index === targets.length - 1) {
        event.preventDefault();
        targets[0]?.focus();
      }
    };

    const onFocusIn = (event: FocusEvent) => {
      const target = event.target as Node | null;
      if (!target || root.contains(target)) return;
      const targets = focusableIn(root);
      (targets[0] ?? root).focus();
    };

    document.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("focusin", onFocusIn);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("focusin", onFocusIn);
      // Restore focus to the opener on dismiss so keyboard users aren't orphaned.
      trigger?.focus();
    };
  }, []);

  const heading = (
    <div className="jobs-heading">
      <span className="jobs-heading-icon" aria-hidden>
        <IconJobs size={15} />
      </span>
      <div className="jobs-heading-copy">
        <h2 id="jobs-drawer-title">Background jobs</h2>
        <p>
          {jobs.length === 0
            ? "None running"
            : `${jobs.length} ${jobs.length === 1 ? "process" : "processes"} from this session`}
        </p>
      </div>
      {onClose ? (
        <button
          type="button"
          className="jobs-close"
          onClick={onClose}
          aria-label="Close jobs"
        >
          <IconClose size={14} />
          <span>Close</span>
          <kbd className="action-kbd">Esc</kbd>
        </button>
      ) : null}
    </div>
  );

  if (jobs.length === 0) {
    return (
      <div
        ref={rootRef}
        className="jobs-view"
        tabIndex={-1}
        aria-labelledby="jobs-drawer-title"
      >
        {heading}
        <div className="jobs-empty">
          <p>Long-running commands and local servers will appear here.</p>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={rootRef}
      className="jobs-view"
      tabIndex={-1}
      aria-labelledby="jobs-drawer-title"
      aria-label={`Background jobs, ${jobs.length} total`}
    >
      {heading}
      <div className="jobs-list">
        {jobs.map((j) => (
          <article
            key={j.id}
            className="job-card"
            aria-labelledby={`job-command-${j.id}`}
          >
            <div className="job-header">
              <span
                className={`job-status job-status-${j.status}`}
                aria-label={`Status ${statusLabel(j.status)}`}
              >
                {statusLabel(j.status)}
              </span>
              <span className="job-command" id={`job-command-${j.id}`}>
                {j.command}
              </span>
              {j.status === "running" && j.pid != null && (
                <span className="job-pid">pid {j.pid}</span>
              )}
              {j.exitCode != null && j.status !== "running" && (
                <span className="job-exit">exit {j.exitCode}</span>
              )}
            </div>
            {j.servers.length > 0 ? (
              <div className="job-links" aria-label="Detected server URLs">
                {j.servers.map((server) => (
                  <ExternalLink key={server} href={server}>
                    <IconLink size={13} />
                    {server}
                  </ExternalLink>
                ))}
              </div>
            ) : null}
            {j.outputTail && (
              <pre
                className="job-output"
                // biome-ignore lint/a11y/noNoninteractiveTabindex: keyboard-scrollable output region for screen reader users
                tabIndex={0}
                aria-label="Job output tail"
              >
                {j.outputTail.slice(-600)}
              </pre>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}
