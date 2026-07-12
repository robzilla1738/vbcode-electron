import type { EngineSnapshot } from "./types";
import type { UIEvent } from "./events";
import type { ProjectSummary, RpcMethod } from "./protocol";

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function finite(value: unknown): boolean {
  return typeof value === "number" && Number.isFinite(value);
}

function recordsWithString(value: unknown, key: string): boolean {
  return Array.isArray(value) && value.every((item) => typeof record(item)?.[key] === "string");
}

function everyRecord(value: unknown, predicate: (item: Record<string, unknown>) => boolean): boolean {
  return Array.isArray(value) && value.every((item) => {
    const parsed = record(item);
    return !!parsed && predicate(parsed);
  });
}

function usage(value: unknown): boolean {
  const item = record(value);
  return !!item
    && (item.inputTokens === undefined || finite(item.inputTokens))
    && (item.outputTokens === undefined || finite(item.outputTokens))
    && (item.totalTokens === undefined || finite(item.totalTokens))
    && (item.cachedInputTokens === undefined || finite(item.cachedInputTokens));
}

function messagePart(value: unknown): boolean {
  const part = record(value);
  if (!part || typeof part.type !== "string") return false;
  if (part.type === "text" || part.type === "reasoning") return typeof part.text === "string";
  if (part.type === "tool-call") {
    return typeof part.toolCallId === "string" && typeof part.toolName === "string";
  }
  if (part.type === "tool-result") {
    return typeof part.toolCallId === "string"
      && typeof part.toolName === "string"
      && (part.isError === undefined || typeof part.isError === "boolean");
  }
  return false;
}

function message(value: unknown): boolean {
  const item = record(value);
  return !!item
    && typeof item.id === "string"
    && (item.role === "user" || item.role === "assistant" || item.role === "system" || item.role === "tool")
    && Array.isArray(item.parts)
    && item.parts.every(messagePart)
    && finite(item.createdAt)
    && (item.usage === undefined || usage(item.usage));
}

export function isEngineSnapshot(value: unknown): value is EngineSnapshot {
  const snap = record(value);
  const usage = record(snap?.usage);
  return !!snap
    && typeof snap.sessionId === "string" && !!snap.sessionId
    && typeof snap.model === "string"
    && (snap.mode === "plan" || snap.mode === "execute")
    && (snap.goal === null || typeof snap.goal === "string")
    && Array.isArray(snap.history) && snap.history.every(message)
    && Array.isArray(snap.tasks) && snap.tasks.every(task)
    && !!usage && finite(usage.inputTokens) && finite(usage.outputTokens)
    && finite(usage.totalTokens) && finite(usage.costUSD)
    && typeof snap.busy === "boolean"
    && typeof snap.theme === "string"
    && typeof snap.accentColor === "string"
    && (snap.details === "quiet" || snap.details === "normal" || snap.details === "verbose")
    && typeof snap.mouse === "boolean"
    && (snap.approvalMode === "ask" || snap.approvalMode === "auto")
    && (snap.git === undefined || gitInfo(snap.git))
    && (snap.goalRun === undefined || goalRun(snap.goalRun))
    && Array.isArray(snap.commandNames) && snap.commandNames.every((item) => typeof item === "string");
}

export function isProjectSummaryArray(value: unknown): value is ProjectSummary[] {
  return Array.isArray(value) && value.every((item) => {
    const project = record(item);
    if (!project || typeof project.cwd !== "string" || typeof project.name !== "string" || !finite(project.updatedAt) || !Array.isArray(project.sessions)) return false;
    return project.sessions.every((sessionValue) => {
      const session = record(sessionValue);
      return !!session
        && typeof session.id === "string"
        && typeof session.title === "string"
        && typeof session.model === "string"
        && (session.mode === "plan" || session.mode === "execute")
        && (session.goal === null || typeof session.goal === "string")
        && finite(session.createdAt)
        && finite(session.updatedAt);
    });
  });
}

export function isRpcResult(method: RpcMethod, value: unknown): boolean {
  switch (method) {
    case "snapshot": return isEngineSnapshot(value);
    case "listProjects": return isProjectSummaryArray(value);
    case "listModels": return everyRecord(value, (item) => typeof item.id === "string" && typeof item.providerId === "string" && optionalFinite(item.contextWindow));
    case "listProviders": return everyRecord(value, (item) => typeof item.id === "string" && typeof item.configured === "boolean" && typeof item.keyless === "boolean" && stringList(item.env));
    case "listAgents": return everyRecord(value, (item) => typeof item.name === "string" && typeof item.description === "string" && optionalStringOrNull(item.model) && (item.mode === "plan" || item.mode === "execute"));
    case "listSkills": return everyRecord(value, (item) => typeof item.name === "string" && typeof item.description === "string");
    case "listMcp": return everyRecord(value, (item) => typeof item.name === "string" && typeof item.connected === "boolean" && typeof item.configured === "boolean" && finite(item.toolCount) && finite(item.resourceCount) && finite(item.promptCount));
    case "listSessions": return recordsWithString(value, "id");
    case "renameProject": return typeof record(value)?.name === "string";
    case "archiveProject":
    case "deleteProject": return typeof record(value)?.cwd === "string";
    case "renameSession":
    case "deleteSession":
    case "archiveSession": return typeof record(value)?.id === "string";
    case "finalize": return value === null;
  }
}

function optionalFinite(value: unknown): boolean {
  return value === undefined || finite(value);
}

function optionalStringOrNull(value: unknown): boolean {
  return value === undefined || value === null || typeof value === "string";
}

function stringList(value: unknown): boolean {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function task(value: unknown): boolean {
  const item = record(value);
  return !!item
    && typeof item.id === "string"
    && typeof item.title === "string"
    && (item.status === "pending" || item.status === "in_progress" || item.status === "completed");
}

function queuedItem(value: unknown): boolean {
  const item = record(value);
  return !!item && typeof item.id === "string" && typeof item.label === "string";
}

function gitInfo(value: unknown): boolean {
  const git = record(value);
  return !!git
    && typeof git.branch === "string"
    && finite(git.dirty)
    && finite(git.ahead)
    && finite(git.behind)
    && typeof git.worktree === "boolean";
}

function goalRun(value: unknown): boolean {
  const run = record(value);
  return !!run
    && typeof run.active === "boolean"
    && (run.phase === null || run.phase === "plan" || run.phase === "execute")
    && finite(run.round)
    && finite(run.max)
    && (run.pausedReason === null || typeof run.pausedReason === "string")
    && typeof run.met === "boolean";
}

function job(value: unknown): boolean {
  const item = record(value);
  return !!item
    && typeof item.id === "string"
    && typeof item.command === "string"
    && (item.status === "running" || item.status === "exited" || item.status === "killed")
    && (item.exitCode === null || finite(item.exitCode))
    && (item.pid === undefined || finite(item.pid))
    && stringList(item.servers)
    && typeof item.outputTail === "string";
}

function planSource(value: unknown): boolean {
  const source = record(value);
  return !!source
    && typeof source.url === "string"
    && (source.title === undefined || typeof source.title === "string");
}

/** Deep validation for event payloads that renderer components dereference. */
export function isRenderableUIEvent(value: UIEvent): boolean {
  switch (value.type) {
    case "git-updated":
      return gitInfo(value.git);
    case "goal-run":
      return goalRun(value.run);
    case "jobs-changed":
      return value.jobs.every(job);
    case "tasks-updated":
      return value.tasks.every(task);
    case "queue-changed":
      return (value.active === null || queuedItem(value.active)) && value.pending.every(queuedItem);
    case "plan-presented":
      return value.sources === undefined || value.sources.every(planSource);
    default:
      return true;
  }
}
