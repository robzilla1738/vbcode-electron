import type { SessionChrome } from "../hooks/useSession";
import { firstLine, truncate } from "../../shared/reducer";
import { hasUnfinishedTasks, windowTasks } from "../../shared/task-window";

export function MetaRow({
  label,
  value,
  hot,
}: {
  label: string;
  value: string;
  hot?: boolean;
}) {
  return (
    <div className={`meta-row${hot ? " ctx-hot" : ""}`}>
      <span className="meta-label">{label}</span>
      <span className="meta-value" title={value} aria-label={`${label}: ${value}`}>
        {value}
      </span>
    </div>
  );
}

export function StatusDot({
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

export function projectName(cwd: string): string {
  const parts = cwd.replace(/\\/g, "/").split("/").filter(Boolean);
  return parts.at(-1) || cwd || "—";
}

export function formatGitLine(
  git: SessionChrome["git"],
  opts?: { showClean?: boolean },
): string | null {
  if (!git) return null;
  return [
    git.branch,
    git.dirty ? `${git.dirty} dirty` : opts?.showClean ? "clean" : null,
    git.ahead ? `↑${git.ahead}` : null,
    git.behind ? `↓${git.behind}` : null,
    git.worktree ? "worktree" : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/**
 * Goal chrome for sidebar MetaRows (`meta`) or the context-line (`context`, ★ prefix).
 */
export function formatGoalLine(
  goal: SessionChrome["goal"],
  goalRun: SessionChrome["goalRun"],
  opts?: { style?: "meta" | "context" },
): string | null {
  if (!goal) return null;
  if (opts?.style === "context") {
    if (!goalRun) return `★ ${goal}`;
    if (goalRun.met) return `★ ${goal} · met`;
    if (goalRun.active) {
      // TUI parity: plan phase reads planning (not plan) and does NOT show
      // round/max until the execute phase begins.
      if (goalRun.phase === "plan") return `★ ${goal} · planning`;
      const phase = goalRun.phase ? ` · ${goalRun.phase}` : "";
      return `★ ${goal}${phase} · ${goalRun.round}/${goalRun.max}`;
    }
    if (goalRun.pausedReason) return `★ ${goal} · paused`;
    return `★ ${goal}`;
  }
  return [
    goal,
    goalRun?.active
      ? `${goalRun.phase ?? "run"} ${goalRun.round}/${goalRun.max}`
      : goalRun?.met
        ? "met"
        : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/** Compact path/git/goal line for context chrome (not topbar / splash crumb). */
export function formatChromeSummary(parts: {
  project?: string | null;
  git?: string | null;
  goal?: string | null;
}): string {
  return [parts.project, parts.git, parts.goal].filter(Boolean).join(" · ");
}

/** Prefer the prompt’s first line; fall back to a short id. */
export function subagentLabel(prompt: string | undefined, id: string): string {
  return firstLine(prompt) ?? truncate(id, 12);
}

export function TasksSection({ tasks }: { tasks: SessionChrome["tasks"] }) {
  if (!hasUnfinishedTasks(tasks)) return null;
  const taskWindow = windowTasks(tasks, 8);
  return (
    <div className="sidebar-section">
      <h4>Tasks</h4>
      {taskWindow.lead > 0 && (
        <div className="sidebar-line task-summary">{taskWindow.lead} done</div>
      )}
      {taskWindow.visible.map((t) => (
        <div
          key={t.id}
          className={`task-row ${
            t.status === "completed" ? "done" : t.status === "in_progress" ? "active" : "pending"
          }`}
        >
          <StatusDot
            status={
              t.status === "completed" ? "done" : t.status === "in_progress" ? "active" : "pending"
            }
          />
          <span>{t.title}</span>
        </div>
      ))}
      {taskWindow.trailing > 0 && (
        <div className="sidebar-line task-summary">+{taskWindow.trailing} more</div>
      )}
    </div>
  );
}

export function OrchestrationSection({
  orchestration,
}: {
  orchestration: SessionChrome["orchestration"];
}) {
  if (orchestration.length === 0) return null;
  return (
    <div className="sidebar-section">
      <h4>Orchestration</h4>
      {orchestration.map((o) => {
        const label = o.objective.length > 48 ? `${o.objective.slice(0, 48)}…` : o.objective;
        return (
          <div key={o.taskId} className={`task-row orch-${o.status}`} title={o.objective}>
            <StatusDot status={o.status} />
            <span>{label}</span>
          </div>
        );
      })}
    </div>
  );
}

export function SubagentsSection({
  subagents,
  selectedId,
  onSelect,
  showActivity = false,
}: {
  subagents: SessionChrome["subagents"];
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  showActivity?: boolean;
}) {
  if (subagents.length === 0) return null;
  return (
    <div className="sidebar-section">
      <h4>Subagents</h4>
      {subagents.map((s) => {
        const label = subagentLabel(s.prompt, s.id);
        const body = (
          <>
            <div className="task-row subagent-tone">
              <StatusDot status={s.status === "running" ? "running" : "completed"} />
              <span>{label}</span>
            </div>
            {showActivity && (s.activity || s.result) ? (
              <div className="sidebar-line">{s.activity || firstLine(s.result)}</div>
            ) : null}
          </>
        );
        if (!onSelect) {
          return (
            <div key={s.id} className="activity-static" title={s.prompt}>
              {body}
            </div>
          );
        }
        return (
          <button
            key={s.id}
            type="button"
            className={`activity-button${selectedId === s.id ? " active" : ""}`}
            aria-pressed={selectedId != null ? selectedId === s.id : undefined}
            aria-label={`Subagent ${label}, ${s.status}`}
            title={s.prompt}
            onClick={() => onSelect(s.id)}
          >
            {body}
          </button>
        );
      })}
    </div>
  );
}

export function ThinkingTrail({
  lines,
  live = false,
}: {
  lines: string[];
  live?: boolean;
}) {
  if (lines.length === 0) return null;
  return (
    <div className="sidebar-section">
      <h4>{live ? "Thinking" : "Last thinking"}</h4>
      <div
        className="activity-stream thinking-panel trail"
        role="log"
        aria-live={live ? "polite" : "off"}
        aria-label={live ? "Live thinking trail" : "Last thinking trail"}
        // biome-ignore lint/a11y/noNoninteractiveTabindex: keyboard-scrollable region
        tabIndex={0}
      >
        {lines.map((line, i) => (
          <div key={i} className="trail-line">
            {line || " "}
          </div>
        ))}
      </div>
    </div>
  );
}
