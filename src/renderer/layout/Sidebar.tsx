import type { SessionChrome } from "../hooks/useSession";
import {
  MetaRow,
  TasksSection,
  OrchestrationSection,
  SubagentsSection,
  ThinkingTrail,
  formatGitLine,
  formatGoalLine,
} from "../panels/activity-shared";

export function LiveSidebar({
  chrome,
  onOpenSubagent,
  closing = false,
}: {
  chrome: SessionChrome;
  onOpenSubagent?: (id: string) => void;
  closing?: boolean;
}) {
  const ctxPct =
    chrome.ctxWindow > 0
      ? Math.min(100, Math.round((100 * chrome.ctxUsed) / chrome.ctxWindow))
      : null;
  const gitLine = formatGitLine(chrome.git);
  const goalLine = formatGoalLine(chrome.goal, chrome.goalRun);

  return (
    <aside
      className={`activity-rail${closing ? " is-closing" : ""}`}
      aria-label="Live session activity"
      aria-hidden={closing || undefined}
    >
      <div className="inspector-scroll">
        <div className="sidebar-section">
          <h4 id="live-sidebar-session">Session</h4>
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

        <TasksSection tasks={chrome.tasks} />
        <OrchestrationSection orchestration={chrome.orchestration} />
        <SubagentsSection
          subagents={chrome.subagents}
          onSelect={onOpenSubagent}
          showActivity
        />
        <ThinkingTrail lines={chrome.thoughtLog} live={chrome.busy} />
      </div>
    </aside>
  );
}
