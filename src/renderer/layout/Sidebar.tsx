import type { SessionChrome } from "../hooks/useSession";
import { firstLine } from "../../shared/reducer";
import { hasUnfinishedTasks, windowTasks } from "../../shared/task-window";

function MetaRow({ label, value, hot }: { label: string; value: string; hot?: boolean }) {
  return (
    <div className={`meta-row${hot ? " ctx-hot" : ""}`}>
      <span className="meta-label">{label}</span>
      <span className="meta-value" title={value}>{value}</span>
    </div>
  );
}

function StatusDot({ status }: { status: "done" | "active" | "pending" | "running" | "completed" }) {
  const kind =
    status === "done" || status === "completed"
      ? "done"
      : status === "active" || status === "running"
        ? "active"
        : "pending";
  return <span className={`status-dot status-dot-${kind}`} aria-hidden />;
}

export function LiveSidebar({
  chrome,
  onOpenSubagent,
}: {
  chrome: SessionChrome;
  onOpenSubagent?: (id: string) => void;
}) {
  const ctxPct =
    chrome.ctxWindow > 0
      ? Math.min(100, Math.round((100 * chrome.ctxUsed) / chrome.ctxWindow))
      : null;
  const taskWindow = windowTasks(chrome.tasks, 8);
  const gitLine = chrome.git
    ? [
        chrome.git.branch,
        chrome.git.dirty ? `${chrome.git.dirty} dirty` : null,
        chrome.git.ahead ? `↑${chrome.git.ahead}` : null,
        chrome.git.behind ? `↓${chrome.git.behind}` : null,
      ]
        .filter(Boolean)
        .join(" · ")
    : null;
  const goalLine = chrome.goal
    ? [
        chrome.goal,
        chrome.goalRun?.active
          ? `${chrome.goalRun.phase ?? "run"} ${chrome.goalRun.round}/${chrome.goalRun.max}`
          : chrome.goalRun?.met
            ? "met"
            : null,
      ]
        .filter(Boolean)
        .join(" · ")
    : null;

  return (
    <aside className="activity-rail" aria-label="Live session activity">
      <div className="inspector-scroll">
      <div className="sidebar-section">
        <h4>Session</h4>
        <div className="meta-block">
          <MetaRow label="Path" value={chrome.cwd} />
          <MetaRow label="Model" value={chrome.model} />
          {gitLine && <MetaRow label="Git" value={gitLine} />}
          {ctxPct != null && (
            <MetaRow
              label="Context"
              value={`${ctxPct}% · $${chrome.usage.costUSD.toFixed(4)}`}
              hot={ctxPct >= 80}
            />
          )}
          {goalLine && <MetaRow label="Goal" value={goalLine} />}
        </div>
      </div>

      {hasUnfinishedTasks(chrome.tasks) && (
        <div className="sidebar-section">
          <h4>Tasks</h4>
          {taskWindow.lead > 0 && <div className="sidebar-line task-summary">{taskWindow.lead} done</div>}
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

      {chrome.orchestration.length > 0 && (
        <div className="sidebar-section">
          <h4>DAG</h4>
          {chrome.orchestration.map((o) => (
            <div key={o.taskId} className="task-row">
              <StatusDot status={o.status === "running" ? "running" : o.status === "completed" ? "completed" : "pending"} />
              <span>{o.objective.slice(0, 48)}</span>
            </div>
          ))}
        </div>
      )}

      {chrome.subagents.length > 0 && (
        <div className="sidebar-section">
          <h4>Subagents</h4>
          {chrome.subagents.map((s) => (
            <button
              key={s.id}
              type="button"
              className="activity-button"
              onClick={() => onOpenSubagent?.(s.id)}
            >
              <div className="task-row subagent-tone">
                <StatusDot status={s.status === "running" ? "running" : "completed"} />
                <span>{firstLine(s.prompt) ?? s.id}</span>
              </div>
              {(s.activity || s.result) && (
                <div className="sidebar-line">{s.activity || firstLine(s.result)}</div>
              )}
            </button>
          ))}
        </div>
      )}

      {chrome.busy && chrome.thoughtLog.length > 0 && (
        <div className="sidebar-section">
          <h4>Thinking</h4>
          <div className="activity-stream thinking-panel trail">
            {chrome.thoughtLog.map((line, i) => (
              <div key={i} className="trail-line">{line || " "}</div>
            ))}
          </div>
        </div>
      )}
      </div>
    </aside>
  );
}
