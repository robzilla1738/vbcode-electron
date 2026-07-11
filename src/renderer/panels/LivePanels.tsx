import { useState } from "react";
import { permissionPreview, toolLabel } from "../../shared/tool-icons";
import type { PendingPerm } from "../../shared/reducer";
import type { QueuedItem } from "../../shared/types";
import { IconChevron, IconRemove, IconSteer } from "../icons";
import { CopyButton } from "../CopyButton";
import { ExternalLink } from "../primitives";
import { MarkdownView } from "../transcript/MarkdownView";

function ActionKbd({ children }: { children: string }) {
  return <kbd className="action-kbd">{children}</kbd>;
}

const PREVIEW_MAX_LINES = 8;

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
  const previewLines = preview?.lines.slice(0, PREVIEW_MAX_LINES) ?? [];
  const previewClipped = (preview?.lines.length ?? 0) > PREVIEW_MAX_LINES;

  const title = `Permission required${count > 1 ? ` · 1/${count}` : ""} · ${perm.toolName}`;

  return (
    <div className="card perm" role="region" aria-labelledby="permission-card-title">
      <h3 id="permission-card-title">{title}</h3>
      <p className="perm-tool-label">{toolLabel(perm.toolName, perm.input)}</p>
      {preview && previewLines.length > 0 && (
        <div className="tool-body permission-preview">
          {previewLines.map((l, i) => (
            <div
              key={i}
              className={
                preview.diff ? (l.startsWith("+") ? "diff-add" : l.startsWith("-") ? "diff-del" : undefined) : undefined
              }
            >
              {l}
            </div>
          ))}
          {previewClipped ? <div className="permission-preview-more">…</div> : null}
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
      <div className="plan-text has-copy">
        {plan.text ? <CopyButton text={plan.text} label="Copy plan" /> : null}
        <div className="md">
          <MarkdownView>{plan.text}</MarkdownView>
        </div>
      </div>
      {plan.sources && plan.sources.length > 0 && (
        <div className="plan-evidence">
          <h4>Sources</h4>
          <ol className="plan-sources">
            {plan.sources.map((source) => (
              <li key={source.url}>
                <ExternalLink href={source.url}>
                  {source.title || source.url}
                </ExternalLink>
              </li>
            ))}
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
  pending,
  onSteer,
  onDequeue,
}: {
  pending: QueuedItem[];
  onSteer: (id: string) => void;
  onDequeue: (id: string) => void;
}) {
  // Show the first queued item (with actions) always; expand for the rest.
  const [expanded, setExpanded] = useState(false);
  if (pending.length === 0) return null;
  const visible = expanded ? pending : pending.slice(0, 1);
  const hiddenCount = pending.length - visible.length;

  return (
    <div className="composer-queue-tray" role="region" aria-label="Queued prompts">
      <div className="queue-tray-bar">
        <span className="queue-tray-count">{pending.length} queued</span>
        {pending.length > 1 ? (
          <button
            type="button"
            className="queue-tray-toggle"
            onClick={() => setExpanded((value) => !value)}
            aria-expanded={expanded}
            aria-controls="composer-queue-items"
          >
            <IconChevron open={expanded} size={12} />
            {expanded ? "Show less" : `+${hiddenCount} more`}
          </button>
        ) : null}
      </div>
      <div id="composer-queue-items" className="queue-items">
        {visible.map((q) => (
          <div key={q.id} className="queue-row">
            <span className="queue-label">{q.label}</span>
            <div className="queue-actions">
              <button
                type="button"
                className="queue-action"
                onClick={() => onSteer(q.id)}
                title="Steer — run this next"
                aria-label={`Steer ${q.label} to front of queue`}
              >
                <IconSteer size={13} />
                <span>Steer</span>
              </button>
              <button
                type="button"
                className="queue-action"
                onClick={() => onDequeue(q.id)}
                title="Remove from queue"
                aria-label={`Remove ${q.label} from queue`}
              >
                <IconRemove size={13} />
                <span>Remove</span>
              </button>
            </div>
          </div>
        ))}
      </div>
      <p className="queue-hint">Steer runs next · Remove drops it</p>
    </div>
  );
}
