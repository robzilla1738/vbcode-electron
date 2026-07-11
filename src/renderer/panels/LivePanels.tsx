import { permissionPreview, toolLabel } from "../../shared/tool-icons";
import type { PendingPerm } from "../../shared/reducer";
import type { QueuedItem } from "../../shared/types";
import { externalHref } from "../../shared/sources";

function ActionKbd({ children }: { children: string }) {
  return <kbd className="action-kbd">{children}</kbd>;
}

export function PermissionCard({
  perm,
  count,
  onDecide,
}: {
  perm: PendingPerm;
  count: number;
  onDecide: (decision: "once" | "always" | "always-project" | "deny") => void;
}) {
  const preview = permissionPreview(perm.toolName, perm.input);
  const payload = JSON.stringify(perm.input, null, 2).slice(0, 800);

  const title = `Permission required${count > 1 ? ` · 1/${count}` : ""} · ${perm.toolName}`;

  return (
    <div className="card perm" role="region" aria-labelledby="permission-card-title">
      <h3 id="permission-card-title">{title}</h3>
      <p className="perm-tool-label">{toolLabel(perm.toolName, perm.input)}</p>
      {preview && (
        <div className="tool-body permission-preview">
          {preview.lines.map((l, i) => (
            <div
              key={i}
              className={
                preview.diff ? (l.startsWith("+") ? "diff-add" : l.startsWith("-") ? "diff-del" : undefined) : undefined
              }
            >
              {l}
            </div>
          ))}
        </div>
      )}
      <details className="decision-details" open={!preview}>
        <summary>{preview ? "Show input" : "Input"}</summary>
        <pre className="decision-payload">{payload}</pre>
      </details>
      <div className="card-actions">
        <button
          type="button"
          className="chip primary"
          onClick={() => onDecide("once")}
          // biome-ignore lint/a11y/noAutofocus: focus the default action so keyboard users can approve without tabbing
          autoFocus
          aria-keyshortcuts="y"
        >
          Allow once <ActionKbd>Y</ActionKbd>
        </button>
        <button
          type="button"
          className="chip"
          onClick={() => onDecide("always")}
          aria-keyshortcuts="a"
        >
          Allow for session <ActionKbd>A</ActionKbd>
        </button>
        <button
          type="button"
          className="chip"
          onClick={() => onDecide("always-project")}
          aria-keyshortcuts="Meta+p"
        >
          Allow for project <ActionKbd>⌘P</ActionKbd>
        </button>
        <button
          type="button"
          className="chip danger"
          onClick={() => onDecide("deny")}
          aria-keyshortcuts="n"
        >
          Deny <ActionKbd>N</ActionKbd>
        </button>
      </div>
    </div>
  );
}

export function PlanCard({
  plan,
  onAccept,
  onAcceptYolo,
  onKeep,
}: {
  plan: {
    text: string;
    sources?: { url: string; title?: string }[];
    assumptions?: string[];
    ungrounded?: boolean;
  };
  onAccept: () => void;
  onAcceptYolo: () => void;
  onKeep: () => void;
}) {
  return (
    <div className="card plan" role="region" aria-labelledby="plan-card-title">
      <h3 id="plan-card-title">Plan approval</h3>
      {plan.ungrounded && (
        <div className="notice warn" role="status">
          Ungrounded — presented without the research this request required
        </div>
      )}
      <pre className="plan-text">
        {plan.text}
      </pre>
      {plan.sources && plan.sources.length > 0 && (
        <div className="plan-evidence">
          <h4>Sources</h4>
          <ol className="plan-sources">
            {plan.sources.map((source) => {
              const href = externalHref(source.url);
              return (
                <li key={source.url}>
                  {href ? (
                    <a
                      href={href}
                      onClick={(event) => {
                        event.preventDefault();
                        void window.vibe.openExternal(href);
                      }}
                    >
                      {source.title || source.url}
                    </a>
                  ) : source.title || source.url}
                </li>
              );
            })}
          </ol>
        </div>
      )}
      {plan.assumptions && plan.assumptions.length > 0 && (
        <div className="plan-evidence assumptions">
          <h4>Assumptions to verify</h4>
          <ul>
            {plan.assumptions.map((assumption, index) => <li key={index}>{assumption}</li>)}
          </ul>
        </div>
      )}
      <div className="card-actions">
        <button
          type="button"
          className="chip primary"
          onClick={onAccept}
          // biome-ignore lint/a11y/noAutofocus: focus the default action so keyboard users can accept without tabbing
          autoFocus
          aria-keyshortcuts="Enter"
        >
          Accept <ActionKbd>Enter</ActionKbd>
        </button>
        <button
          type="button"
          className="chip"
          onClick={onAcceptYolo}
          aria-keyshortcuts="Meta+y"
        >
          Accept + YOLO <ActionKbd>⌘Y</ActionKbd>
        </button>
        <button
          type="button"
          className="chip"
          onClick={onKeep}
          aria-keyshortcuts="Escape"
        >
          Keep planning <ActionKbd>Esc</ActionKbd>
        </button>
        <span className="action-hint">Type feedback to revise</span>
      </div>
    </div>
  );
}

export function QueuePanel({
  active,
  pending,
  onSteer,
  onDequeue,
}: {
  active: QueuedItem | null;
  pending: QueuedItem[];
  onSteer: (id: string) => void;
  onDequeue: (id: string) => void;
}) {
  if (!active && pending.length === 0) return null;
  const count = (active ? 1 : 0) + pending.length;
  const preview = active?.label ?? pending[0]?.label ?? "";
  return (
    <div className="composer-queue-tray" role="region" aria-label="Queued prompts">
      <div className="queue-tray-header">
        <span className="queue-tray-count">{count} queued</span>
        {preview ? <span className="queue-tray-preview">{preview}</span> : null}
      </div>
      {active && (
        <div className="queue-row is-active" aria-current="true">
          <span className="queue-label">{active.label}</span>
          <span className="queue-active-badge">Active</span>
        </div>
      )}
      {pending.map((q) => (
        <div key={q.id} className="queue-row">
          <span className="queue-label">{q.label}</span>
          <div className="queue-actions">
            <button
              type="button"
              className="queue-action"
              onClick={() => onSteer(q.id)}
              title="Make this the active queued item"
              aria-label={`Steer ${q.label} to front of queue`}
            >
              Steer
            </button>
            <button
              type="button"
              className="queue-action"
              onClick={() => onDequeue(q.id)}
              aria-label={`Remove ${q.label} from queue`}
            >
              Remove
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
