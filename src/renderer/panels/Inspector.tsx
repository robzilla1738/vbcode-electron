import { useEffect, useRef, useState } from "react";
import { belowBreakpoint } from "../../shared/breakpoints";
import type { ChangedFile } from "../../shared/reducer";
import { hasUnfinishedTasks } from "../../shared/task-window";
import type { SessionChrome } from "../hooks/useSession";
import { IconClose, IconFolderOpen } from "../icons";
import {
  formatGitLine,
  formatGoalLine,
  MetaRow,
  OrchestrationSection,
  projectName,
  SubagentsSection,
  subagentLabel,
  TasksSection,
  ThinkingTrail,
} from "./activity-shared";

export function Inspector({
  chrome,
  changedFiles,
  selectedSubagent,
  subagentStream,
  cwd,
  onClose,
  onUndo,
  onRedo,
  onRevealFile,
  onSelectSubagent,
}: {
  chrome: SessionChrome;
  changedFiles: ChangedFile[];
  selectedSubagent: string | null;
  subagentStream: string;
  cwd: string | null;
  onClose: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onRevealFile: (path: string) => void;
  onSelectSubagent: (id: string | null) => void;
}) {
  const [previewPath, setPreviewPath] = useState<string | null>(null);
  const [previewText, setPreviewText] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewTruncated, setPreviewTruncated] = useState(false);
  const [confirmCp, setConfirmCp] = useState<"undo" | "redo" | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const ctxPct =
    chrome.ctxWindow > 0
      ? Math.min(100, Math.round((100 * chrome.ctxUsed) / chrome.ctxWindow))
      : null;
  const ctxLine =
    chrome.ctxWindow > 0
      ? `${chrome.ctxUsed.toLocaleString()} / ${chrome.ctxWindow.toLocaleString()} · ${ctxPct}%`
      : "No usage yet";
  const gitLine = formatGitLine(chrome.git, { showClean: true });
  const goalLine = formatGoalLine(chrome.goal, chrome.goalRun);
  const selected = chrome.subagents.find((s) => s.id === selectedSubagent) ?? null;
  const latestCpLabel = chrome.checkpoints.length > 0
    ? chrome.checkpoints[chrome.checkpoints.length - 1]!.label
    : null;
  const rootRef = useRef<HTMLElement>(null);

  // Focus trap only when the inspector is a modal drawer (≤ compact) — when
  // docked it behaves as a side panel and should not capture Tab (I49).
  const [isDrawer, setIsDrawer] = useState(() => belowBreakpoint("compact"));
  useEffect(() => {
    const onResize = () => setIsDrawer(belowBreakpoint("compact"));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || !isDrawer) return;
    const trigger = document.activeElement as HTMLElement | null;
    const close = root.querySelector<HTMLButtonElement>(".sidebar-close");
    close?.focus();

    const focusable = (): HTMLElement[] =>
      Array.from(
        root.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((el) => {
        const style = window.getComputedStyle(el);
        return style.visibility !== "hidden" && style.display !== "none";
      });

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const targets = focusable();
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
      const targets = focusable();
      (targets[0] ?? root).focus();
    };

    document.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("focusin", onFocusIn);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("focusin", onFocusIn);
      trigger?.focus();
    };
  }, [isDrawer]);

  useEffect(() => {
    if (!previewPath || !cwd) {
      setPreviewText(null);
      setPreviewError(null);
      setPreviewTruncated(false);
      return;
    }
    let cancelled = false;
    setPreviewLoading(true);
    setPreviewError(null);
    void window.vibe
      .readTextFile({ cwd, path: previewPath })
      .then((res) => {
        if (cancelled) return;
        if (!res.ok) {
          setPreviewText(null);
          setPreviewError(res.error);
          setPreviewTruncated(false);
          return;
        }
        setPreviewText(res.text);
        setPreviewError(null);
        setPreviewTruncated(res.truncated);
      })
      .finally(() => {
        if (!cancelled) setPreviewLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [previewPath, cwd]);

  // Clear stale preview when the file leaves the changed set.
  useEffect(() => {
    if (previewPath && !changedFiles.some((f) => f.path === previewPath)) {
      setPreviewPath(null);
    }
  }, [changedFiles, previewPath]);

  const idle =
    changedFiles.length === 0 &&
    chrome.checkpoints.length === 0 &&
    chrome.orchestration.length === 0 &&
    chrome.subagents.length === 0 &&
    !hasUnfinishedTasks(chrome.tasks) &&
    chrome.thoughtLog.length === 0;

  let title = "Session";
  let subtitle = "Model, context, and changes";
  if (previewPath) {
    title = previewPath.split(/[/\\]/).pop() || previewPath;
    subtitle = "File preview";
  } else if (selected) {
    title = subagentLabel(selected.prompt, selected.id);
    subtitle = `Subagent · ${selected.status}`;
  }

  return (
    <aside
      id="session-panel"
      className="activity-rail inspector-rail"
      aria-label="Session details"
      aria-labelledby="inspector-title"
      ref={rootRef}
    >
      <div className="sidebar-heading-row">
        <div className="sidebar-heading-copy">
          <p className="sidebar-eyebrow">Workspace</p>
          <h2 id="inspector-title" className="sidebar-heading-title">
            {title}
          </h2>
          <p className="sidebar-heading-sub">{subtitle}</p>
        </div>
        <button
          type="button"
          className="icon-button sidebar-close"
          onClick={onClose}
          aria-label="Close session panel"
          title="Close session panel"
        >
          <IconClose size={14} />
        </button>
      </div>

      <div className="inspector-scroll">
        {!previewPath && !selected && (
          <div className="sidebar-section">
            <h4>Overview</h4>
            <div className="meta-block">
              <MetaRow label="Project" value={projectName(chrome.cwd)} />
              <MetaRow label="Model" value={chrome.model || "—"} />
              <MetaRow label="Mode" value={chrome.mode} />
              <MetaRow label="Approvals" value={chrome.approvals} />
              <MetaRow label="Context" value={ctxLine} hot={ctxPct != null && ctxPct >= 80} />
              <MetaRow label="Cost" value={`$${chrome.usage.costUSD.toFixed(4)}`} />
              {gitLine && <MetaRow label="Git" value={gitLine} />}
              {chrome.reasoning && <MetaRow label="Reasoning" value={chrome.reasoning} />}
              {chrome.lastGate && <MetaRow label="Gate" value={chrome.lastGate} />}
              {goalLine && <MetaRow label="Goal" value={goalLine} />}
            </div>
            {chrome.cwd ? (
              <p className="inspector-path" title={chrome.cwd}>
                {chrome.cwd}
              </p>
            ) : null}
          </div>
        )}

        {!previewPath && <TasksSection tasks={chrome.tasks} />}

        {previewPath ? (
          <div className="sidebar-section">
            <div className="file-preview-toolbar">
              <button
                type="button"
                className="button"
                onClick={() => setPreviewPath(null)}
              >
                Back
              </button>
              <button
                type="button"
                className="button"
                onClick={() => onRevealFile(previewPath)}
                title="Reveal in Finder"
              >
                <IconFolderOpen size={13} />
                Reveal
              </button>
            </div>
            <p className="inspector-path" title={previewPath}>
              {previewPath}
            </p>
            {previewLoading ? (
              <p className="inspector-empty">
                <span className="spinner" aria-hidden /> Loading preview…
              </p>
            ) : previewError ? (
              <p className="inspector-empty is-error" role="alert">
                Couldn’t load preview · {previewError}
              </p>
            ) : (
              <pre
                className="activity-stream inspector-stream file-preview"
                // biome-ignore lint/a11y/noNoninteractiveTabindex: keyboard-scrollable preview
                tabIndex={0}
                aria-label={`Preview of ${previewPath}`}
              >
                {previewText || "This file is empty."}
              </pre>
            )}
            {previewTruncated ? (
              <p className="inspector-hint">Preview truncated to the first 64 KB.</p>
            ) : null}
          </div>
        ) : (
          <div className="sidebar-section">
            <h4>Changed files</h4>
            {changedFiles.length > 0 ? (
              changedFiles.map((f) => (
                <div key={f.path} className="file-row-actions">
                  <button
                    type="button"
                    className="activity-button file-row"
                    onClick={() => setPreviewPath(f.path)}
                    aria-label={`Preview ${f.path}, +${f.added} −${f.removed}`}
                    title={`Preview ${f.path}`}
                  >
                    <span className="file-path">{f.path}</span>
                    <span className="file-diff" aria-hidden>
                      <span className="diff-add-count">+{f.added}</span>
                      <span className="diff-del-count">−{f.removed}</span>
                    </span>
                  </button>
                  <button
                    type="button"
                    className="file-reveal"
                    onClick={() => onRevealFile(f.path)}
                    aria-label={`Reveal ${f.path} in Finder`}
                    title="Reveal in Finder"
                  >
                    <IconFolderOpen size={13} />
                  </button>
                </div>
              ))
            ) : (
              <p className="inspector-empty">No file edits yet this session.</p>
            )}
          </div>
        )}

        {!previewPath && chrome.checkpoints.length > 0 ? (
          <div className="sidebar-section">
            <h4>Checkpoints</h4>
            {chrome.checkpoints
              .slice()
              .reverse()
              .map((c) => (
                <div key={c.id} className="sidebar-line">
                  {c.label}
                </div>
              ))}
            <div className="card-actions compact">
              {confirmCp ? (
                <span className="cp-confirm" role="status">
                  <span className="cp-confirm-msg">
                    {confirmCp === "undo"
                      ? `Undo to “${latestCpLabel ?? "last checkpoint"}”?`
                      : "Redo the undone checkpoint?"}
                  </span>
                  <button
                    type="button"
                    className="button"
                    // biome-ignore lint/a11y/noAutofocus: focus the safe choice
                    autoFocus
                    onClick={() => setConfirmCp(null)}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="button"
                    onClick={() => {
                      const mode = confirmCp;
                      setConfirmCp(null);
                      if (mode === "undo") onUndo();
                      else onRedo();
                    }}
                  >
                    {confirmCp === "undo" ? "Undo" : "Redo"}
                  </button>
                </span>
              ) : (
                <>
                  <button
                    type="button"
                    className="button"
                    onClick={() => setConfirmCp("undo")}
                    aria-label={`Undo last checkpoint${latestCpLabel ? ` · ${latestCpLabel}` : ""}`}
                    title={`Undo to ${latestCpLabel ?? "last checkpoint"}`}
                  >
                    Undo
                  </button>
                  <button
                    type="button"
                    className="button"
                    onClick={() => setConfirmCp("redo")}
                    aria-label="Redo checkpoint"
                  >
                    Redo
                  </button>
                </>
              )}
            </div>
          </div>
        ) : null}

        {!previewPath && <OrchestrationSection orchestration={chrome.orchestration} />}

        {!previewPath && (
          <SubagentsSection
            subagents={chrome.subagents}
            selectedId={selectedSubagent}
            onSelect={onSelectSubagent}
          />
        )}

        {!previewPath && selected && (
          <div className="sidebar-section">
            <div className="file-preview-toolbar">
              <button
                type="button"
                className="button"
                onClick={() => onSelectSubagent(null)}
              >
                Back
              </button>
            </div>
            <h4>{subagentLabel(selected.prompt, selected.id)}</h4>
            <pre
              className="activity-stream inspector-stream thinking-panel"
              // biome-ignore lint/a11y/noNoninteractiveTabindex: keyboard-scrollable output region
              tabIndex={0}
              aria-label={`Stream for ${subagentLabel(selected.prompt, selected.id)}`}
            >
              {subagentStream || selected.result || "(no stream yet)"}
            </pre>
          </div>
        )}

        {!previewPath && !selected && (
          <ThinkingTrail lines={chrome.thoughtLog} live={chrome.busy} />
        )}

        {idle && (
          <p className="inspector-hint">
            File diffs, tasks, and checkpoints appear here as the turn progresses.
          </p>
        )}
      </div>
    </aside>
  );
}
