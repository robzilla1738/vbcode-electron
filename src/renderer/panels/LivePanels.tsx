import { useEffect, useRef, useState } from "react";
import type { PendingPerm } from "../../shared/reducer";
import {
  permissionDetail,
  permissionKind,
  permissionPreview,
} from "../../shared/tool-icons";
import type { QueuedItem } from "../../shared/types";
import { CopyButton } from "../CopyButton";
import { IconChevron, IconRemove, IconSteer } from "../icons";
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
  onDecide: (decision: "once" | "always" | "always-project" | "deny", feedback?: string) => void;
}) {
  const onceRef = useRef<HTMLButtonElement>(null);
  const denyInputRef = useRef<HTMLInputElement>(null);
  const [previewExpanded, setPreviewExpanded] = useState(false);
  const [denyReason, setDenyReason] = useState("");
  const [denyOpen, setDenyOpen] = useState(false);
  // Move focus to the primary action when a new permission card appears so the
  // decision is obvious instead of letting typed prose route into the composer
  // (I35). preventScroll avoids yanking the viewport.
  useEffect(() => {
    onceRef.current?.focus({ preventScroll: true });
    setDenyReason("");
    setDenyOpen(false);
    setPreviewExpanded(false);
  }, [perm.id]);

  useEffect(() => {
    if (!denyOpen) return;
    denyInputRef.current?.focus({ preventScroll: true });
  }, [denyOpen]);

  const preview = permissionPreview(perm.toolName, perm.input);
  const payload = JSON.stringify(perm.input, null, 2).slice(0, 800);
  const allPreviewLines = preview?.lines ?? [];
  const previewLines = previewExpanded
    ? allPreviewLines
    : allPreviewLines.slice(0, PREVIEW_MAX_LINES);
  const previewClipped = allPreviewLines.length > PREVIEW_MAX_LINES;
  const kind = permissionKind(perm.toolName);
  const detail = permissionDetail(perm.toolName, perm.input);
  const isCommand =
    perm.toolName.toLowerCase() === "bash" || perm.toolName.toLowerCase() === "shell";

  const submitDeny = () => {
    if (!denyOpen) {
      setDenyOpen(true);
      return;
    }
    onDecide("deny", denyReason.trim() || undefined);
  };

  return (
    <div className="card perm" role="region" aria-labelledby="permission-card-title">
      <header className="card-head">
        <p className="card-eyebrow">
          Needs your approval{count > 1 ? ` · 1 of ${count}` : ""}
        </p>
        <h3 id="permission-card-title">{kind}</h3>
        {detail ? (
          <p className={`perm-detail${isCommand ? " is-command" : ""}`}>{detail}</p>
        ) : null}
      </header>

      {preview && previewLines.length > 0 ? (
        <div className="tool-body permission-preview">
          {previewLines.map((l, i) => (
            <div
              key={i}
              className={
                preview.diff
                  ? l.startsWith("+")
                    ? "diff-add"
                    : l.startsWith("-")
                      ? "diff-del"
                      : undefined
                  : undefined
              }
            >
              {l}
            </div>
          ))}
          {previewClipped && !previewExpanded ? (
            <button
              type="button"
              className="permission-preview-more"
              onClick={() => setPreviewExpanded(true)}
            >
              Show all {allPreviewLines.length} lines
            </button>
          ) : null}
          {previewExpanded && allPreviewLines.length > PREVIEW_MAX_LINES ? (
            <button
              type="button"
              className="permission-preview-more"
              onClick={() => setPreviewExpanded(false)}
            >
              Show fewer
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="card-actions perm-actions">
        <button
          type="button"
          ref={onceRef}
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
          title="Allow this for the rest of the session (A)"
        >
          Always <ActionKbd>A</ActionKbd>
        </button>
        <button
          type="button"
          className="chip"
          onClick={() => onDecide("always-project")}
          aria-keyshortcuts="Meta+p"
          title="Allow this for the project (⌘P)"
        >
          For project <ActionKbd>⌘P</ActionKbd>
        </button>
        <button
          type="button"
          className="chip danger"
          onClick={submitDeny}
          aria-keyshortcuts="n"
          aria-expanded={denyOpen}
        >
          {denyOpen ? "Confirm deny" : "Deny"} <ActionKbd>N</ActionKbd>
        </button>
      </div>

      {denyOpen ? (
        <label className="perm-deny-reason is-open">
          <span className="sr-only">Optional deny reason</span>
          <input
            ref={denyInputRef}
            type="text"
            value={denyReason}
            onChange={(event) => setDenyReason(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                onDecide("deny", denyReason.trim() || undefined);
              }
            }}
            placeholder="Why deny? Optional — press Enter to confirm"
            aria-label="Optional reason for denying"
          />
        </label>
      ) : null}

      <details className="decision-details">
        <summary>Technical details</summary>
        <pre className="decision-payload">{payload}</pre>
      </details>
    </div>
  );
}

export function PlanCard({
  plan,
  hasDraft,
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
  /** Whether the composer holds a revision in progress (honest Esc label, I36). */
  hasDraft?: boolean;
  onAccept: () => void;
  onAcceptYolo: () => void;
  onKeep: () => void;
}) {
  const hasEvidence =
    (plan.sources && plan.sources.length > 0) ||
    (plan.assumptions && plan.assumptions.length > 0);

  return (
    <div className="card plan" role="region" aria-labelledby="plan-card-title">
      <header className="card-head">
        <p className="card-eyebrow">Plan</p>
        <h3 id="plan-card-title">Plan approval</h3>
        <p className="perm-detail">Review the plan, then accept or send feedback below.</p>
      </header>

      {plan.ungrounded && (
        <div className="notice warn" role="status">
          This plan was presented without the research the request called for.
        </div>
      )}

      <div className="plan-text has-copy">
        {plan.text ? <CopyButton text={plan.text} label="Copy plan" /> : null}
        <div className="md">
          <MarkdownView>{plan.text}</MarkdownView>
        </div>
      </div>

      {hasEvidence ? (
        <div className="plan-evidence-stack">
          {plan.sources && plan.sources.length > 0 ? (
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
          ) : null}
          {plan.assumptions && plan.assumptions.length > 0 ? (
            <div className="plan-evidence assumptions">
              <h4>Assumptions to verify</h4>
              <ul>
                {plan.assumptions.map((assumption, index) => (
                  <li key={index}>{assumption}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="card-actions plan-actions">
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
          onClick={onKeep}
          aria-keyshortcuts="Escape"
          title={
            hasDraft
              ? "Esc clears your feedback, press again to keep planning"
              : "Keep planning without accepting"
          }
        >
          Keep planning <ActionKbd>Esc</ActionKbd>
          {hasDraft ? (
            <span className="action-hint-inline">clears draft first</span>
          ) : null}
        </button>
        <span className="card-actions-sep" aria-hidden />
        <button
          type="button"
          className="chip caution"
          onClick={onAcceptYolo}
          aria-keyshortcuts="Meta+y"
          title="Accept the plan and auto-approve all future tool calls this turn"
        >
          Accept + auto-approve <ActionKbd>⌘Y</ActionKbd>
        </button>
        <span className="action-hint">Type below to revise</span>
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
            <IconChevron open={expanded} size={13} />
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
