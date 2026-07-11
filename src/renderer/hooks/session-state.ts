import type { UIEvent } from "../../shared/events";
import type {
  EngineSnapshot,
  GitInfo,
  GoalRunInfo,
  JobInfo,
  QueuedItem,
  SessionUsage,
  Task,
} from "../../shared/types";
import {
  dropSettledPerms,
  type PendingPerm,
  type Subagent,
} from "../../shared/reducer";
import { isTranscriptDensity, type TranscriptDensity } from "../../shared/density";
import { seedChromeFromSessionStart } from "../../shared/chrome-seed";

export interface OrchestrationRow {
  taskId: string;
  objective: string;
  status: "running" | "completed" | "failed" | "skipped";
  attempts?: number;
  durationMs?: number;
}

export interface SessionChrome {
  sessionId: string;
  model: string;
  /** Dedicated subagent model, or undefined when subagents inherit main. */
  subagentModel?: string;
  mode: "plan" | "execute";
  approvals: "ask" | "auto";
  goal: string | null;
  goalRun: GoalRunInfo | null;
  git: GitInfo | null;
  usage: SessionUsage;
  ctxUsed: number;
  ctxWindow: number;
  busy: boolean;
  theme: string;
  accent: string;
  density: TranscriptDensity;
  reasoning?: string;
  tasks: Task[];
  jobs: JobInfo[];
  queueActive: QueuedItem | null;
  queuePending: QueuedItem[];
  plan: {
    text: string;
    sources?: { url: string; title?: string }[];
    assumptions?: string[];
    ungrounded?: boolean;
  } | null;
  perms: PendingPerm[];
  subagents: Subagent[];
  thinkingStream: string;
  /** Accumulated reasoning trail (persists across bursts, survives past turn end). */
  thoughtLog: string[];
  commandNames: string[];
  cwd: string;
  lastGate: "green" | "red" | "unverified" | "aborted" | null;
  orchestration: OrchestrationRow[];
  checkpoints: { id: string; label: string }[];
}

const emptyUsage = (): SessionUsage => ({
  inputTokens: 0,
  outputTokens: 0,
  totalTokens: 0,
  costUSD: 0,
});

export function initialChrome(cwd: string): SessionChrome {
  return {
    sessionId: "",
    model: "",
    subagentModel: undefined,
    mode: "execute",
    approvals: "ask",
    goal: null,
    goalRun: null,
    git: null,
    usage: emptyUsage(),
    ctxUsed: 0,
    ctxWindow: 0,
    busy: false,
    theme: "default",
    accent: "",
    density: "normal",
    tasks: [],
    jobs: [],
    queueActive: null,
    queuePending: [],
    plan: null,
    perms: [],
    subagents: [],
    thinkingStream: "",
    thoughtLog: [],
    commandNames: [],
    cwd,
    lastGate: null,
    orchestration: [],
    checkpoints: [],
  };
}

export type ChromeAction =
  | { type: "reset"; cwd: string }
  | { type: "seed"; snap: EngineSnapshot; cwd: string }
  | { type: "event"; event: UIEvent }
  | { type: "optimistic-mode"; mode: "plan" | "execute"; approvals: "ask" | "auto" }
  | { type: "set-busy"; busy: boolean }
  | { type: "set-thinking"; text: string }
  | { type: "set-trail"; lines: string[] }
  | { type: "set-subagent-model"; model: string | undefined }
  | { type: "clear-plan" }
  | { type: "drop-perm"; id: string }
  | { type: "clear-session-overlays" }
  | { type: "seed-from-session-start"; event: Extract<UIEvent, { type: "session-start" }>; snap: EngineSnapshot | null };

export function reduceChrome(s: SessionChrome, a: ChromeAction): SessionChrome {
  switch (a.type) {
    case "reset":
      return initialChrome(a.cwd);
    case "seed": {
      const snap = a.snap;
      return {
        ...initialChrome(a.cwd),
        sessionId: snap.sessionId,
        model: snap.model,
        subagentModel: snap.subagentModel,
        mode: snap.mode,
        approvals: snap.approvalMode,
        goal: snap.goal,
        goalRun: snap.goalRun ?? null,
        git: snap.git ?? null,
        usage: snap.usage,
        busy: snap.busy,
        theme: snap.theme || "default",
        accent: snap.accentColor || "",
        density: isTranscriptDensity(snap.details) ? snap.details : "normal",
        reasoning: snap.reasoning,
        thoughtLog: [],
        tasks: snap.tasks ?? [],
        commandNames: snap.commandNames ?? [],
      };
    }
    case "seed-from-session-start": {
      const seeded = seedChromeFromSessionStart(a.event, a.snap);
      return {
        ...s,
        sessionId: a.event.sessionId,
        model: seeded.model,
        subagentModel: a.snap?.subagentModel ?? s.subagentModel,
        mode: seeded.mode,
        approvals: seeded.approvalMode,
        goal: seeded.goal,
        theme: seeded.theme,
        accent: seeded.accentColor,
        density: isTranscriptDensity(seeded.details) ? seeded.details : s.density,
      };
    }
    case "optimistic-mode":
      return { ...s, mode: a.mode, approvals: a.approvals };
    case "set-busy":
      return { ...s, busy: a.busy };
    case "set-thinking":
      return { ...s, thinkingStream: a.text };
    case "set-trail":
      return { ...s, thoughtLog: a.lines };
    case "set-subagent-model":
      return { ...s, subagentModel: a.model };
    case "clear-plan":
      return { ...s, plan: null };
    case "drop-perm":
      return { ...s, perms: s.perms.filter((p) => p.id !== a.id) };
    case "clear-session-overlays":
      return {
        ...s,
        plan: null,
        perms: [],
        subagents: [],
        queueActive: null,
        queuePending: [],
        tasks: [],
        thinkingStream: "",
        busy: false,
        lastGate: null,
        orchestration: [],
        checkpoints: [],
      };
    case "event":
      return applyEvent(s, a.event);
    default:
      return s;
  }
}

function applyEvent(s: SessionChrome, event: UIEvent): SessionChrome {
  switch (event.type) {
    case "session-start":
      return { ...s, sessionId: event.sessionId, model: event.model, mode: event.mode };
    case "mode-changed":
      // Leaving plan mode DISMISSES the plan card (TUI parity) — live approve
      // already spent #lastPlan engine-side; if the card survived, the next
      // typed message would be captured as a plan REVISION.
      return event.mode !== "plan"
        ? { ...s, mode: event.mode, plan: null }
        : { ...s, mode: event.mode };
    case "model-changed":
      return { ...s, model: event.model };
    case "goal-changed":
      return { ...s, goal: event.goal };
    case "goal-run":
      return { ...s, goalRun: event.run };
    case "theme-changed":
      return { ...s, theme: event.theme };
    case "accent-changed":
      return { ...s, accent: event.accent };
    case "details-changed":
      return {
        ...s,
        density: isTranscriptDensity(event.details) ? event.details : s.density,
      };
    case "git-updated":
      return { ...s, git: event.git };
    case "jobs-changed":
      return { ...s, jobs: event.jobs };
    case "approvals-changed":
      return { ...s, approvals: event.mode };
    case "usage-updated":
      return { ...s, usage: event.usage };
    case "context-updated":
      return { ...s, ctxUsed: event.usedTokens, ctxWindow: event.contextWindow };
    case "tasks-updated":
      return { ...s, tasks: event.tasks };
    case "queue-changed":
      return { ...s, queueActive: event.active, queuePending: event.pending };
    case "plan-presented":
      return {
        ...s,
        plan: {
          text: event.plan,
          sources: event.sources,
          assumptions: event.assumptions,
          ungrounded: event.ungrounded,
        },
      };
    case "permission-request":
      return {
        ...s,
        perms: [...s.perms, { id: event.id, toolName: event.toolName, input: event.input }],
      };
    case "permission-settled":
      return { ...s, perms: dropSettledPerms(s.perms, event.ids) };
    case "orchestration-task": {
      const row: OrchestrationRow = {
        taskId: event.taskId,
        objective: event.objective,
        status: event.status,
        attempts: event.attempts,
        durationMs: event.durationMs,
      };
      const rest = s.orchestration.filter((o) => o.taskId !== event.taskId);
      return { ...s, orchestration: [...rest, row] };
    }
    case "checkpoint-created":
      return {
        ...s,
        checkpoints: [...s.checkpoints, { id: event.id, label: event.label }].slice(-20),
      };
    case "subagent-started": {
      const subagents = [
        ...s.subagents.filter((x) => x.id !== event.subagentId),
        {
          id: event.subagentId,
          prompt: event.prompt,
          status: "running" as const,
          startedAt: Date.now(),
        },
      ];
      return { ...s, subagents };
    }
    case "subagent-activity": {
      // Attach activity only to the RUNNING child (TUI parity) so a stray
      // event arriving after it finished can't relight a done row's label.
      return {
        ...s,
        subagents: s.subagents.map((x) =>
          x.id === event.subagentId && x.status === "running"
            ? { ...x, activity: event.label }
            : x,
        ),
      };
    }
    case "subagent-finished": {
      return {
        ...s,
        subagents: s.subagents.map((x) =>
          x.id === event.subagentId
            ? {
                ...x,
                status: "done" as const,
                result: event.result,
                activity: undefined,
                elapsedMs:
                  x.startedAt !== undefined ? Date.now() - x.startedAt : undefined,
              }
            : x,
        ),
      };
    }
    case "turn-finished":
    case "session-idle":
      // Keep busy until engine-idle (TUI parity — follow-up turns).
      return { ...s, thinkingStream: "" };
    case "engine-idle":
      return {
        ...s,
        busy: false,
        thinkingStream: "",
        lastGate: event.gate ?? null,
      };
    case "user-message":
      // Subagents and the reasoning trail are per-turn — start each turn clean (TUI parity).
      return { ...s, busy: true, plan: null, subagents: [], thoughtLog: [] };
    case "engine-error":
      return { ...s, busy: false, thinkingStream: "" };
    default:
      return s;
  }
}

