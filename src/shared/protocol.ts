import type { EngineCommand } from "./commands";
import type { UIEvent } from "./events";

// Re-export for exhaustiveness tests that compare against the type unions.
export type { EngineCommand, UIEvent };

/** Electron main → vibecodr-engine-host (mirrors macos-bridge protocol). */
export type HostInbound =
  | {
      op: "bootstrap";
      cwd: string;
      resume?: string;
      continue?: boolean;
      model?: string;
      mode?: "plan" | "execute" | "yolo";
    }
  | { op: "send"; command: EngineCommand }
  | {
      op: "rpc";
      id: number;
      method:
        | "snapshot"
        | "listModels"
        | "listProviders"
        | "listAgents"
        | "listSkills"
        | "listMcp"
        | "finalize"
        | "listSessions"
        | "listProjects"
        | "renameProject"
        | "archiveProject"
        | "deleteProject"
        | "renameSession"
        | "deleteSession"
        | "archiveSession";
      params?: {
        cwd?: string;
        id?: string;
        name?: string;
        title?: string;
      };
    }
  | { op: "shutdown" };

/** Host → Electron main. */
export type HostOutbound =
  | { type: "ready"; sessionId: string }
  | { type: "event"; event: UIEvent }
  | { type: "resp"; id: number; ok: true; value: unknown }
  | { type: "resp"; id: number; ok: false; error: string }
  | { type: "fatal"; message: string };

export interface ProjectSessionSummary {
  id: string;
  title: string;
  model: string;
  mode: "plan" | "execute";
  goal: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface ProjectSummary {
  cwd: string;
  name: string;
  updatedAt: number;
  sessions: ProjectSessionSummary[];
}

export type RpcMethod = Extract<HostInbound, { op: "rpc" }>["method"];

const RPC_METHODS = new Set<RpcMethod>([
  "snapshot", "listModels", "listProviders", "listAgents", "listSkills", "listMcp",
  "finalize", "listSessions", "listProjects", "renameProject", "archiveProject", "deleteProject", "renameSession", "deleteSession", "archiveSession",
]);

/** Exhaustive map — TypeScript fails compile if a command type is missing. */
const ENGINE_COMMAND_TYPE_MAP = {
  "submit-prompt": 1,
  "run-slash": 1,
  "set-mode": 1,
  "set-approvals": 1,
  "set-model": 1,
  "set-subagent-model": 1,
  "set-agent-model": 1,
  "create-agent": 1,
  "set-goal": 1,
  "resume-goal": 1,
  abort: 1,
  dequeue: 1,
  steer: 1,
  compact: 1,
  "resolve-permission": 1,
  "resolve-plan": 1,
  shutdown: 1,
} as const satisfies Record<EngineCommand["type"], 1>;

const ENGINE_COMMAND_TYPES = new Set<string>(Object.keys(ENGINE_COMMAND_TYPE_MAP));

/** Exhaustive map — TypeScript fails compile if a UIEvent type is missing. */
const UI_EVENT_TYPE_MAP = {
  "session-start": 1,
  "user-message": 1,
  "assistant-text-delta": 1,
  "reasoning-delta": 1,
  "tool-call-started": 1,
  "tool-call-progress": 1,
  "tool-call-finished": 1,
  "step-finished": 1,
  "usage-updated": 1,
  "context-updated": 1,
  "mode-changed": 1,
  "model-changed": 1,
  "goal-changed": 1,
  "goal-run": 1,
  "theme-changed": 1,
  "accent-changed": 1,
  "details-changed": 1,
  "mouse-changed": 1,
  "git-updated": 1,
  "jobs-changed": 1,
  "approvals-changed": 1,
  "plan-presented": 1,
  "permission-request": 1,
  "permission-settled": 1,
  "tasks-updated": 1,
  "orchestration-task": 1,
  "queue-changed": 1,
  "file-changed": 1,
  "checkpoint-created": 1,
  "checkpoint-restored": 1,
  "verify-started": 1,
  "verify-finished": 1,
  compacted: 1,
  "subagent-started": 1,
  "subagent-activity": 1,
  "subagent-finished": 1,
  "loop-tick": 1,
  "loop-stopped": 1,
  notice: 1,
  "engine-error": 1,
  "turn-finished": 1,
  "session-idle": 1,
  "engine-idle": 1,
} as const satisfies Record<UIEvent["type"], 1>;

const UI_EVENT_TYPES = new Set<UIEvent["type"]>(
  Object.keys(UI_EVENT_TYPE_MAP) as UIEvent["type"][],
);

/** For unit tests: every UIEvent type is registered. */
export function listedUIEventTypes(): readonly UIEvent["type"][] {
  return Object.keys(UI_EVENT_TYPE_MAP) as UIEvent["type"][];
}

/** For unit tests: every EngineCommand type is registered. */
export function listedEngineCommandTypes(): readonly string[] {
  return Object.keys(ENGINE_COMMAND_TYPE_MAP);
}

const SESSION_EVENT_TYPES = new Set<UIEvent["type"]>([
  "session-start", "user-message", "assistant-text-delta", "reasoning-delta",
  "tool-call-started", "tool-call-progress", "tool-call-finished", "step-finished",
  "usage-updated", "context-updated", "mode-changed", "model-changed", "goal-changed",
  "goal-run", "git-updated", "jobs-changed", "plan-presented", "permission-request",
  "permission-settled", "tasks-updated", "orchestration-task", "file-changed", "compacted",
  "subagent-started", "subagent-activity", "subagent-finished", "turn-finished",
  "session-idle", "engine-idle",
]);

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function optionalString(value: unknown): boolean {
  return value === undefined || typeof value === "string";
}

function optionalBoolean(value: unknown): boolean {
  return value === undefined || typeof value === "boolean";
}

function optionalNumber(value: unknown): boolean {
  return value === undefined || Number.isFinite(value);
}

function stringArray(value: unknown): boolean {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

/** Deep nested UI payload checks (folded into isUIEvent so decodeOutbound is strict). */
function uiGitInfo(value: unknown): boolean {
  const git = record(value);
  return !!git
    && typeof git.branch === "string"
    && Number.isFinite(git.dirty)
    && Number.isFinite(git.ahead)
    && Number.isFinite(git.behind)
    && typeof git.worktree === "boolean";
}

function uiGoalRun(value: unknown): boolean {
  const run = record(value);
  return !!run
    && typeof run.active === "boolean"
    && (run.phase === null || run.phase === "plan" || run.phase === "execute")
    && Number.isFinite(run.round)
    && Number.isFinite(run.max)
    && (run.pausedReason === null || typeof run.pausedReason === "string")
    && typeof run.met === "boolean";
}

function uiJob(value: unknown): boolean {
  const item = record(value);
  return !!item
    && typeof item.id === "string"
    && typeof item.command === "string"
    && (item.status === "running" || item.status === "exited" || item.status === "killed")
    && (item.exitCode === null || Number.isFinite(item.exitCode))
    && (item.pid === undefined || Number.isFinite(item.pid))
    && stringArray(item.servers)
    && typeof item.outputTail === "string";
}

function uiTask(value: unknown): boolean {
  const item = record(value);
  return !!item
    && typeof item.id === "string"
    && typeof item.title === "string"
    && (item.status === "pending" || item.status === "in_progress" || item.status === "completed");
}

function uiQueuedItem(value: unknown): boolean {
  const item = record(value);
  return !!item && typeof item.id === "string" && typeof item.label === "string";
}

function uiPlanSource(value: unknown): boolean {
  const source = record(value);
  return !!source
    && typeof source.url === "string"
    && (source.title === undefined || typeof source.title === "string");
}

function sessionUsage(value: unknown): boolean {
  const usage = record(value);
  return !!usage && Number.isFinite(usage.inputTokens) && Number.isFinite(usage.outputTokens)
    && Number.isFinite(usage.totalTokens) && Number.isFinite(usage.costUSD)
    && optionalBoolean(usage.costEstimated)
    && optionalNumber(usage.cachedInputTokens);
}

function stepUsage(value: unknown): boolean {
  const usage = record(value);
  return !!usage
    && optionalNumber(usage.inputTokens)
    && optionalNumber(usage.outputTokens)
    && optionalNumber(usage.totalTokens)
    && optionalNumber(usage.cachedInputTokens);
}

function engineCommand(value: unknown): value is EngineCommand {
  const command = record(value);
  if (!command || typeof command.type !== "string" || !ENGINE_COMMAND_TYPES.has(command.type)) return false;
  switch (command.type) {
    case "submit-prompt": return typeof command.text === "string";
    case "run-slash": return typeof command.name === "string" && typeof command.args === "string";
    case "set-mode": return (command.mode === "plan" || command.mode === "execute") && optionalBoolean(command.start);
    case "set-approvals": return (command.mode === "ask" || command.mode === "auto") && optionalBoolean(command.quiet);
    case "set-model": return typeof command.model === "string";
    case "set-subagent-model": return command.model === null || typeof command.model === "string";
    case "set-agent-model": return typeof command.name === "string" && (command.model === null || typeof command.model === "string");
    case "create-agent": return typeof command.name === "string";
    case "set-goal": return command.goal === null || typeof command.goal === "string";
    case "dequeue":
    case "steer": return typeof command.id === "string";
    case "resolve-permission": return typeof command.id === "string" && ["once", "always", "always-project", "deny"].includes(String(command.decision)) && optionalString(command.feedback);
    case "resolve-plan": return ["accept", "edit", "keep-planning"].includes(String(command.decision)) && optionalString(command.edit) && (command.approvals === undefined || command.approvals === "auto");
    default: return true;
  }
}

export function isUIEvent(value: unknown): value is UIEvent {
  const event = record(value);
  if (!event || typeof event.type !== "string" || !UI_EVENT_TYPES.has(event.type as UIEvent["type"])) return false;
  if (SESSION_EVENT_TYPES.has(event.type as UIEvent["type"]) && typeof event.sessionId !== "string") return false;
  switch (event.type) {
    case "session-start": return typeof event.model === "string" && (event.mode === "plan" || event.mode === "execute");
    case "user-message":
      return typeof event.text === "string"
        && (event.origin === undefined || event.origin === "user" || event.origin === "engine")
        && optionalString(event.label);
    case "assistant-text-delta":
    case "reasoning-delta": return typeof event.delta === "string" && optionalString(event.subagentId);
    case "tool-call-started": return typeof event.toolCallId === "string" && typeof event.toolName === "string" && optionalString(event.subagentId);
    case "tool-call-progress": return typeof event.toolCallId === "string" && typeof event.chunk === "string" && optionalString(event.subagentId);
    case "tool-call-finished": return typeof event.toolCallId === "string" && typeof event.toolName === "string" && typeof event.isError === "boolean" && optionalString(event.subagentId);
    case "step-finished": return event.usage === undefined || stepUsage(event.usage);
    case "usage-updated": return sessionUsage(event.usage);
    case "context-updated": return Number.isFinite(event.usedTokens) && Number.isFinite(event.contextWindow);
    case "mode-changed": return event.mode === "plan" || event.mode === "execute";
    case "model-changed": return typeof event.model === "string";
    case "goal-changed": return event.goal === null || typeof event.goal === "string";
    case "goal-run": return uiGoalRun(event.run);
    case "theme-changed": return typeof event.theme === "string";
    case "accent-changed": return typeof event.accent === "string";
    case "details-changed": return event.details === "quiet" || event.details === "normal" || event.details === "verbose";
    case "mouse-changed": return typeof event.mouse === "boolean";
    case "git-updated": return uiGitInfo(event.git);
    case "jobs-changed": return Array.isArray(event.jobs) && event.jobs.every(uiJob);
    case "approvals-changed": return event.mode === "ask" || event.mode === "auto";
    case "plan-presented":
      return typeof event.plan === "string"
        && (event.sources === undefined || (Array.isArray(event.sources) && event.sources.every(uiPlanSource)))
        && (event.assumptions === undefined || stringArray(event.assumptions))
        && optionalBoolean(event.ungrounded);
    case "permission-request": return typeof event.id === "string" && typeof event.toolName === "string";
    case "permission-settled": return stringArray(event.ids) && (event.reason === "aborted" || event.reason === "shutdown");
    case "tasks-updated": return Array.isArray(event.tasks) && event.tasks.every(uiTask);
    case "orchestration-task": return typeof event.taskId === "string" && typeof event.objective === "string" && ["running", "completed", "failed", "skipped"].includes(String(event.status)) && optionalNumber(event.attempts) && optionalNumber(event.durationMs);
    case "queue-changed":
      return (event.active === null || uiQueuedItem(event.active))
        && Array.isArray(event.pending)
        && event.pending.every(uiQueuedItem);
    case "notice": return (event.level === "info" || event.level === "warn" || event.level === "error") && typeof event.message === "string";
    case "engine-error": return typeof event.message === "string" && optionalString(event.sessionId);
    case "file-changed": return typeof event.toolCallId === "string" && typeof event.path === "string" && (event.action === "edit" || event.action === "write") && typeof event.diff === "string" && Number.isFinite(event.added) && Number.isFinite(event.removed);
    case "checkpoint-created":
    case "checkpoint-restored": return typeof event.id === "string" && typeof event.label === "string";
    case "verify-started": return typeof event.command === "string";
    case "verify-finished": return typeof event.ok === "boolean" && typeof event.output === "string";
    case "compacted": return Number.isFinite(event.freedTokens);
    case "subagent-started": return typeof event.subagentId === "string" && typeof event.prompt === "string";
    case "subagent-activity": return typeof event.subagentId === "string" && typeof event.label === "string";
    case "subagent-finished": return typeof event.subagentId === "string" && typeof event.result === "string";
    case "loop-tick": return typeof event.loopId === "string" && Number.isFinite(event.iteration);
    case "loop-stopped": return typeof event.loopId === "string" && typeof event.reason === "string";
    case "engine-idle": return event.gate === undefined || ["green", "red", "unverified", "aborted"].includes(String(event.gate));
    default: return true;
  }
}

export function decodeInbound(line: string): HostInbound | null {
  let value: unknown;
  try { value = JSON.parse(line); } catch { return null; }
  const msg = record(value);
  if (!msg || typeof msg.op !== "string") return null;
  if (msg.op === "shutdown") return { op: "shutdown" };
  if (msg.op === "bootstrap") {
    if (typeof msg.cwd !== "string" || !msg.cwd.trim() || !optionalString(msg.resume) || !optionalString(msg.model)) return null;
    if (msg.continue !== undefined && typeof msg.continue !== "boolean") return null;
    if (msg.mode !== undefined && msg.mode !== "plan" && msg.mode !== "execute" && msg.mode !== "yolo") return null;
    return value as HostInbound;
  }
  if (msg.op === "send") {
    return engineCommand(msg.command)
      ? value as HostInbound
      : null;
  }
  if (msg.op === "rpc") {
    if (!Number.isSafeInteger(msg.id) || (msg.id as number) < 1 || typeof msg.method !== "string" || !RPC_METHODS.has(msg.method as RpcMethod)) return null;
    const params = msg.params === undefined ? null : record(msg.params);
    if (msg.params !== undefined && !params) return null;
    if (
      params &&
      (!optionalString(params.cwd) ||
        !optionalString(params.id) ||
        !optionalString(params.title) ||
        !optionalString(params.name))
    ) {
      return null;
    }
    return value as HostInbound;
  }
  return null;
}

export function encodeInbound(msg: HostInbound): string {
  return `${JSON.stringify(msg)}\n`;
}

export function decodeOutbound(line: string): HostOutbound | null {
  let value: unknown;
  try { value = JSON.parse(line); } catch { return null; }
  const msg = record(value);
  if (!msg || typeof msg.type !== "string") return null;
  if (msg.type === "ready") return typeof msg.sessionId === "string" && msg.sessionId ? value as HostOutbound : null;
  if (msg.type === "event") return isUIEvent(msg.event) ? value as HostOutbound : null;
  if (msg.type === "fatal") return typeof msg.message === "string" ? value as HostOutbound : null;
  if (msg.type === "resp") {
    if (!Number.isSafeInteger(msg.id) || (msg.id as number) < 1 || typeof msg.ok !== "boolean") return null;
    return msg.ok || typeof msg.error === "string" ? value as HostOutbound : null;
  }
  return null;
}
