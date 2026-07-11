import type { SessionChrome } from "../hooks/useSession";
import type { ChangedFile } from "../../shared/reducer";
import { firstLine } from "../../shared/reducer";
import { hasUnfinishedTasks, windowTasks } from "../../shared/task-window";
import { IconClose } from "../icons";

function MetaRow({ label, value, hot }: { label: string; value: string; hot?: boolean }) {
  return (
    <div className={`meta-row${hot ? " ctx-hot" : ""}`}>
      <span className="meta-label">{label}</span>
      <span className="meta-value" title={value} aria-label={`${label}: ${value}`}>
        {value}
      </span>
    </div>
  );
}

function StatusDot({
  status,
}: {
  status: "done" | "active" | "pending" | "running" | "completed" | "failed" | "skipped";
}) {
  const kind =
    status === "done" || status === "completed"
      ? "done"
      : status === "failed"
        ? "failed"
        : status === "skipped"
          ? "skipped"
          : status === "active" || status === "running"
            ? "active"
            : "pending";
  return <span className={`status-dot status-dot-${kind}`} aria-hidden />;
}

function projectName(cwd: string): string {
  const parts = cwd.replace(/\\/g, "/").split("/").filter(Boolean);
  return parts.at(-1) || cwd || "—";
}

export function Inspector({
  chrome,
  changedFiles,
  selectedSubagent,
  subagentStream,
  onClose,
  onUndo,
  onRedo,
  onShowFile,
  onSelectSubagent,
}: {
  chrome: SessionChrome;
  changedFiles: ChangedFile[];
  selectedSubagent: string | null;
  subagentStream: string;
  onClose: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onShowFile: (path: string) => void;
  onSelectSubagent: (id: string) => void;
}) {
  const ctxPct =
    chrome.ctxWindow > 0
      ? Math.min(100, Math.round((100 * chrome.ctxUsed) / chrome.ctxWindow))
      : null;
  const ctxLine =
    chrome.ctxWindow > 0
      ? `${chrome.ctxUsed.toLocaleString()} / ${chrome.ctxWindow.toLocaleString()} · ${ctxPct}%`
      : "No usage yet";
  const gitLine = chrome.git
    ? [
        chrome.git.branch,
        chrome.git.dirty ? `${chrome.git.dirty} dirty` : "clean",
        chrome.git.ahead ? `↑${chrome.git.ahead}` : null,
        chrome.git.behind ? `↓${chrome.git.behind}` : null,
      ]
        .filter(Boolean)
        .join(" · ")
    : null;
  const taskWindow = windowTasks(chrome.tasks, 8);
  const showTasks = hasUnfinishedTasks(chrome.tasks);
  const idle =
    changedFiles.length === 0 &&
    chrome.checkpoints.length === 0 &&
    chrome.orchestration.length === 0 &&
    chrome.subagents.length === 0 &&
    !showTasks;

  return (
    <aside
      className="activity-rail inspector-rail"
      aria-label="Session details"
      aria-labelledby="inspector-title"
    >
      <div className="sidebar-heading-row">
        <div className="sidebar-heading-copy">
          <h2 id="inspector-title" className="sidebar-heading-title">Session</h2>
          <p className="sidebar-heading-sub">Model, context, and changes</p>
        </div>
        <button type="button" className="icon-button sidebar-close" onClick={onClose} aria-label="Close session panel">
          <IconClose size={15} />
        </button>
      </div>

      <div className="inspector-scroll">
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
            {chrome.goal && <MetaRow label="Goal" value={chrome.goal} />}
          </div>
          {chrome.cwd ? (
            <p className="inspector-path" title={chrome.cwd}>
              {chrome.cwd}
            </p>
          ) : null}
        </div>

        {showTasks && (
          <div className="sidebar-section">
            <h4>Tasks</h4>
            {taskWindow.lead > 0 && (
              <div className="sidebar-line task-summary">{taskWindow.lead} done</div>
            )}
            {taskWindow.visible.map((t) => (
              <div
                key={t.id}
                className={`task-row ${
                  t.status === "completed"
                    ? "done"
                    : t.status === "in_progress"
                      ? "active"
                      : "pending"
                }`}
              >
                <StatusDot
                  status={
                    t.status === "completed"
                      ? "done"
                      : t.status === "in_progress"
                        ? "active"
                        : "pending"
                  }
                />
                <span>{t.title}</span>
              </div>
            ))}
            {taskWindow.trailing > 0 && (
              <div className="sidebar-line task-summary">+{taskWindow.trailing} more</div>
            )}
          </div>
        )}

        {changedFiles.length > 0 ? (
          <div className="sidebar-section">
            <h4>Changed files</h4>
            {changedFiles.map((f) => (
              <button
                key={f.path}
                type="button"
                className="activity-button file-row"
                onClick={() => onShowFile(f.path)}
                aria-label={`Show ${f.path} in Finder, +${f.added} −${f.removed}`}
                title={`Show ${f.path}`}
              >
                <span className="file-path">{f.path}</span>
                <span className="file-diff" aria-hidden>
                  <span className="diff-add-count">+{f.added}</span>
                  <span className="diff-del-count">−{f.removed}</span>
                </span>
              </button>
            ))}
          </div>
        ) : (
          <div className="sidebar-section">
            <h4>Changed files</h4>
            <p className="inspector-empty">Edits from this session will show up here.</p>
          </div>
        )}

        {chrome.checkpoints.length > 0 ? (
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
              <button type="button" className="chip" onClick={onUndo} aria-label="Undo last checkpoint">
                Undo
              </button>
              <button type="button" className="chip" onClick={onRedo} aria-label="Redo checkpoint">
                Redo
              </button>
            </div>
          </div>
        ) : null}

        {chrome.orchestration.length > 0 && (
          <div className="sidebar-section">
            <h4>Orchestration</h4>
            {chrome.orchestration.map((o) => {
              const label =
                o.objective.length > 48 ? `${o.objective.slice(0, 48)}…` : o.objective;
              return (
                <div key={o.taskId} className={`task-row orch-${o.status}`} title={o.objective}>
                  <StatusDot status={o.status} />
                  <span>{label}</span>
                </div>
              );
            })}
          </div>
        )}

        {chrome.subagents.length > 0 && (
          <div className="sidebar-section">
            <h4>Subagents</h4>
            {chrome.subagents.map((subagent) => (
              <button
                key={subagent.id}
                type="button"
                className={`activity-button${selectedSubagent === subagent.id ? " active" : ""}`}
                aria-pressed={selectedSubagent === subagent.id}
                aria-label={`Subagent ${firstLine(subagent.prompt) ?? subagent.id}, ${subagent.status}`}
                onClick={() => onSelectSubagent(subagent.id)}
              >
                <div className="task-row subagent-tone">
                  <StatusDot status={subagent.status === "running" ? "active" : "done"} />
                  <span>{firstLine(subagent.prompt) ?? subagent.id}</span>
                </div>
              </button>
            ))}
          </div>
        )}

        {selectedSubagent && (
          <div className="sidebar-section">
            <h4>Subagent {selectedSubagent.slice(0, 8)}</h4>
            <pre
              className="activity-stream inspector-stream thinking-panel"
              // biome-ignore lint/a11y/noNoninteractiveTabindex: keyboard-scrollable output region for screen reader users
              tabIndex={0}
              aria-label={`Stream for subagent ${selectedSubagent.slice(0, 8)}`}
            >
              {subagentStream ||
                chrome.subagents.find((s) => s.id === selectedSubagent)?.result ||
                "(no stream yet)"}
            </pre>
          </div>
        )}

        {idle && (
          <p className="inspector-hint">
            As you work, tasks, file diffs, and checkpoints land in this panel.
          </p>
        )}
      </div>
    </aside>
  );
}
