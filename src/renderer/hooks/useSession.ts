import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import type { EngineCommand } from "../../shared/commands";
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
  groupIntoTurns,
  initialTranscript,
  reduceTranscript,
  type PendingPerm,
  type Subagent,
  type TranscriptAction,
  type TranscriptState,
} from "../../shared/reducer";
import { getTheme } from "../../shared/themes";
import { applyPalette } from "../theme/applyPalette";
import { Trail, turnWindowStart, windowStartIndex } from "../../shared/trail";
import {
  cycleModeAction,
  deriveUiMode,
  modeColor,
  modeWord,
  type UiMode,
} from "../../shared/modes";
import type { TranscriptDensity } from "../../shared/density";
import { isTranscriptDensity } from "../../shared/density";
import { seedChromeFromSessionStart } from "../../shared/chrome-seed";
import { GLYPH } from "../../shared/glyphs";
import { firstLine } from "../../shared/reducer";
import { hydrateFromHistory } from "../../shared/history-hydrate";
import { hasUnfinishedTasks } from "../../shared/task-window";

type TxAction =
  | TranscriptAction
  | { type: "reset" }
  | { type: "replace"; state: TranscriptState };

function reduceTx(s: TranscriptState, a: TxAction): TranscriptState {
  if (a.type === "reset") return initialTranscript();
  if (a.type === "replace") return a.state;
  return reduceTranscript(s, a);
}

const WINDOW_TURNS = 40;
const REVEAL_PAGE = 20;
const TURN_ITEMS_MAX = 120;
const TURN_ITEMS_STEP = 24;
const TURN_ITEM_REVEAL_PAGE = TURN_ITEMS_STEP;
const SIDEBAR_MIN_PX = 1460;

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

type ChromeAction =
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

export function useSession(cwd: string | null) {
  const [chrome, dispatchChrome] = useReducer(reduceChrome, cwd ?? "", (c) =>
    initialChrome(c || ""),
  );
  const [transcript, dispatchTranscript] = useReducer(reduceTx, undefined, initialTranscript);
  const [foldedTurns, setFoldedTurns] = useState<Set<number>>(new Set());
  const [revealTurns, setRevealTurns] = useState(0);
  const [revealedTurnItems, setRevealedTurnItems] = useState<Map<number, number>>(() => new Map());
  const [jobsView, setJobsView] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [bootError, setBootError] = useState<string | null>(null);
  const [booting, setBooting] = useState(false);
  const [ready, setReady] = useState(false);
  const [wide, setWide] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [selectedSubagent, setSelectedSubagent] = useState<string | null>(null);
  const deltaBuf = useRef("");
  const reasoningBuf = useRef("");
  const reasoningStarted = useRef<number | null>(null);
  const flushTimer = useRef<number | null>(null);
  const suppressAfterClear = useRef(false);
  const lastSnap = useRef<EngineSnapshot | null>(null);
  const subagentTranscripts = useRef<Record<string, string>>({});
  const trail = useRef(new Trail());

  const uiMode: UiMode = deriveUiMode(chrome.mode, chrome.approvals);

  useEffect(() => {
    applyPalette(getTheme(chrome.theme), chrome.accent || undefined, chrome.theme);
    document.documentElement.style.setProperty("--mode", modeColor(uiMode));
  }, [chrome.theme, chrome.accent, uiMode]);

  useEffect(() => {
    const measure = () => {
      setWide(window.innerWidth >= SIDEBAR_MIN_PX);
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  // Events suppressed while the clear-gate is active (TUI parity:
  // clearScopedEventTypes).  Stale stream/notice/subagent/checkpoint/verify
  // events from the pre-clear turn must not bleed into the freshly reset view.
  const CLEAR_SCOPED_TYPES = new Set<string>([
    "assistant-text-delta",
    "reasoning-delta",
    "tool-call-started",
    "tool-call-progress",
    "tool-call-finished",
    "file-changed",
    "permission-request",
    "plan-presented",
    "subagent-started",
    "subagent-activity",
    "subagent-finished",
    "notice",
    "compacted",
    "loop-stopped",
    "loop-tick",
    "checkpoint-restored",
    "verify-started",
    "verify-finished",
    "engine-error",
  ]);

  const flushDeltas = useCallback(() => {
    flushTimer.current = null;
    if (deltaBuf.current) {
      const text = deltaBuf.current;
      deltaBuf.current = "";
      dispatchTranscript({ type: "delta", text });
    }
  }, []);

  const landReasoning = useCallback(() => {
    const text = reasoningBuf.current.trim();
    if (!text) {
      reasoningBuf.current = "";
      reasoningStarted.current = null;
      dispatchChrome({ type: "set-thinking", text: "" });
      return;
    }
    const seconds =
      reasoningStarted.current != null
        ? Math.max(1, Math.round((Date.now() - reasoningStarted.current) / 1000))
        : undefined;
    dispatchTranscript({ type: "thinking", text, seconds });
    reasoningBuf.current = "";
    reasoningStarted.current = null;
    dispatchChrome({ type: "set-thinking", text: "" });
  }, []);

  const endTurn = useCallback(
    (opts: { stopWorking: boolean }) => {
      landReasoning();
      flushDeltas();
      dispatchTranscript({ type: "clear-turn" });
      if (opts.stopWorking) dispatchChrome({ type: "set-busy", busy: false });
    },
    [flushDeltas, landReasoning],
  );

  const handleEvent = useCallback(
    (raw: unknown) => {
      const event = raw as UIEvent;
      // A throwing handler must not kill the event loop (TUI parity: try/catch
      // around the per-event switch that surfaces errors as transcript notices).
      try {

      // After /clear|/new, drop stale stream until the next user-message.
      // Stale events from the pre-clear turn are suppressed (streaming deltas,
      // tool activity, notices, subagent events, etc.) until the next
      // user-message arrives — mirroring the TUI's clearScopedEventTypes gate.
      // turn-finished / session-idle are suppressed AND clear the gate so a
      // late idle from the old turn doesn't bleed into the new session.
      if (suppressAfterClear.current) {
        if (event.type === "user-message") {
          suppressAfterClear.current = false;
        } else if (event.type === "turn-finished" || event.type === "session-idle") {
          suppressAfterClear.current = false;
          return;
        } else if (CLEAR_SCOPED_TYPES.has(event.type)) {
          return;
        }
      }

      if (event.type === "session-start") {
        dispatchChrome({
          type: "seed-from-session-start",
          event,
          snap: lastSnap.current,
        });
      } else {
        dispatchChrome({ type: "event", event });
      }

      switch (event.type) {
        case "user-message":
          landReasoning();
          dispatchTranscript({ type: "user", text: event.text });
          break;
        case "plan-presented":
          // Finalize the streaming assistant reply before the plan card appears
          // (TUI parity: finalizeAssistant() in plan-presented handler).
          landReasoning();
          flushDeltas();
          dispatchTranscript({ type: "finalize" });
          break;
        case "assistant-text-delta":
          if (event.subagentId) {
            const prev = subagentTranscripts.current[event.subagentId] ?? "";
            subagentTranscripts.current[event.subagentId] = (prev + event.delta).slice(-64_000);
            break;
          }
          landReasoning();
          deltaBuf.current += event.delta;
          if (flushTimer.current == null) {
            flushTimer.current = window.setTimeout(flushDeltas, 32);
          }
          break;
        case "reasoning-delta":
          if (event.subagentId) break;
          if (reasoningStarted.current == null) reasoningStarted.current = Date.now();
          reasoningBuf.current += event.delta;
          // Append to the persistent trail (TUI parity: accumulates across bursts,
          // survives past turn end — reset only on the next user-message).
          trail.current.append(event.delta);
          dispatchChrome({ type: "set-thinking", text: reasoningBuf.current });
          dispatchChrome({ type: "set-trail", lines: trail.current.snapshot() });
          break;
        case "tool-call-started":
          if (event.subagentId) break;
          landReasoning();
          flushDeltas();
          dispatchTranscript({
            type: "tool-start",
            toolCallId: event.toolCallId,
            toolName: event.toolName,
            input: event.input,
            at: Date.now(),
          });
          break;
        case "tool-call-progress":
          if (event.subagentId) break;
          dispatchTranscript({
            type: "tool-progress",
            toolCallId: event.toolCallId,
            chunk: event.chunk,
          });
          break;
        case "tool-call-finished":
          if (event.subagentId) break;
          flushDeltas();
          dispatchTranscript({
            type: "tool-finish",
            toolCallId: event.toolCallId,
            output: event.output,
            isError: event.isError,
            at: Date.now(),
          });
          break;
        case "file-changed":
          flushDeltas();
          dispatchTranscript({
            type: "file-changed",
            toolCallId: event.toolCallId,
            path: event.path,
            action: event.action,
            added: event.added,
            removed: event.removed,
            diff: event.diff,
            at: Date.now(),
          });
          break;
        case "notice":
          dispatchTranscript({
            type: "notice",
            text: event.message,
            level: event.level,
          });
          break;
        case "engine-error":
          endTurn({ stopWorking: true });
          dispatchTranscript({
            type: "notice",
            text: `error: ${event.message}`,
            level: "error",
          });
          break;
        case "checkpoint-created":
          dispatchTranscript({
            type: "notice",
            text: `checkpoint ${event.label}`,
            level: "info",
          });
          break;
        case "checkpoint-restored":
          dispatchTranscript({
            type: "notice",
            text: `${GLYPH.revert} reverted: ${event.label}`,
            level: "info",
          });
          break;
        case "verify-started":
          dispatchTranscript({
            type: "notice",
            text: `verifying: ${event.command}`,
            level: "info",
          });
          break;
        case "verify-finished": {
          const detail =
            !event.ok && event.output
              ? ` — ${firstLine(event.output) ?? ""}`.slice(0, 120)
              : "";
          dispatchTranscript({
            type: "notice",
            text: event.ok ? "verification passed" : `verification failed${detail}`,
            level: event.ok ? "info" : "error",
          });
          break;
        }
        case "compacted":
          dispatchTranscript({
            type: "notice",
            text: `Compacted history · freed ~${event.freedTokens} tokens`,
            level: "info",
          });
          break;
        case "loop-tick":
          dispatchTranscript({
            type: "notice",
            text: `${GLYPH.loopTick} loop iteration ${event.iteration}`,
            level: "info",
          });
          break;
        case "loop-stopped":
          dispatchTranscript({
            type: "notice",
            text: `Loop stopped — ${event.reason}`,
            level: "info",
          });
          break;
        case "turn-finished":
        case "session-idle":
          endTurn({ stopWorking: false });
          break;
        case "engine-idle":
          endTurn({ stopWorking: true });
          if (event.gate === "red") {
            dispatchTranscript({
              type: "notice",
              text: "STILL RED — green-gate did not pass",
              level: "warn",
            });
          }
          break;
        case "subagent-finished":
          // Retain the bounded stream for Inspector drill-in after completion.
          // It is cleared when the session changes or /clear|/new resets locally.
          break;
        default:
          break;
      }
      } catch (err) {
        dispatchTranscript({
          type: "notice",
          text: `ui error handling "${event.type}": ${err instanceof Error ? err.message : String(err)}`,
          level: "error",
        });
      }
    },
    [endTurn, flushDeltas, landReasoning],
  );

  const send = useCallback(async (command: EngineCommand): Promise<boolean> => {
    const res = await window.vibe.send(command);
    if (!res.ok) {
      dispatchTranscript({ type: "notice", text: res.error, level: "error" });
      dispatchChrome({ type: "set-busy", busy: false });
      return false;
    }
    return true;
  }, []);

  const sendMany = useCallback(
    async (commands: EngineCommand[]): Promise<boolean> => {
      for (const c of commands) {
        if (!(await send(c))) return false;
      }
      return true;
    },
    [send],
  );

  const clearSessionLocal = useCallback(() => {
    suppressAfterClear.current = true;
    deltaBuf.current = "";
    reasoningBuf.current = "";
    reasoningStarted.current = null;
    trail.current.reset();
    if (flushTimer.current != null) {
      window.clearTimeout(flushTimer.current);
      flushTimer.current = null;
    }
    dispatchTranscript({ type: "reset" });
    dispatchChrome({ type: "clear-session-overlays" });
    setFoldedTurns(new Set());
    setRevealTurns(0);
    setRevealedTurnItems(new Map());
    setSelectedSubagent(null);
    subagentTranscripts.current = {};
  }, []);

  const bootstrap = useCallback(
    async (opts: {
      cwd: string;
      resume?: string;
      continueLatest?: boolean;
    }) => {
      setBooting(true);
      setBootError(null);
      setReady(false);
      setJobsView(false);
      setFoldedTurns(new Set());
      setRevealTurns(0);
      setRevealedTurnItems(new Map());
      setInspectorOpen(false);
      setSelectedSubagent(null);
      suppressAfterClear.current = false;
      lastSnap.current = null;
      deltaBuf.current = "";
      reasoningBuf.current = "";
      reasoningStarted.current = null;
      subagentTranscripts.current = {};
      if (flushTimer.current != null) {
        window.clearTimeout(flushTimer.current);
        flushTimer.current = null;
      }
      dispatchChrome({ type: "reset", cwd: opts.cwd });
      dispatchTranscript({ type: "reset" });
      try {
        localStorage.setItem("vibe.lastCwd", opts.cwd);
      } catch {
        /* ignore */
      }
      const res = await window.vibe.bootstrap(opts);
      if (!res.ok) {
        setBootError(res.error + (res.stderr ? `\n${res.stderr}` : ""));
        setBooting(false);
        return false;
      }
      const snapRes = await window.vibe.rpc("snapshot");
      if (!snapRes.ok) {
        await window.vibe.stop().catch(() => undefined);
        setBootError(`Engine snapshot failed: ${snapRes.error}`);
        setBooting(false);
        return false;
      }
      const snap = snapRes.value as EngineSnapshot;
      lastSnap.current = snap;
      dispatchChrome({ type: "seed", snap, cwd: opts.cwd });
      if (snap.history?.length) {
        dispatchTranscript({ type: "replace", state: hydrateFromHistory(snap.history) });
      }
      setReady(true);
      setBooting(false);
      return true;
    },
    [],
  );

  useEffect(() => {
    const offEvent = window.vibe.onEvent(handleEvent);
    const offFatal = window.vibe.onFatal((message) => {
      setBootError(message);
      setReady(false);
      setBooting(false);
      dispatchTranscript({ type: "notice", text: message, level: "error" });
      dispatchChrome({ type: "set-busy", busy: false });
    });
    return () => {
      offEvent();
      offFatal();
    };
  }, [handleEvent]);

  const cycleMode = useCallback(() => {
    const action = cycleModeAction(uiMode, { planPending: !!chrome.plan });
    void sendMany(action.commands);
    if (action.optimistic) {
      dispatchChrome({
        type: "optimistic-mode",
        mode: action.optimistic.mode,
        approvals: action.optimistic.approvals,
      });
    }
  }, [uiMode, chrome.plan, sendMany]);

  const foldAllTurns = useCallback(() => {
    setFoldedTurns((prev) => {
      const turns = groupIntoTurns(transcript.blocks);
      const foldable = turns.filter((t) => t.user && t.items.length > 0);
      const anyFolded = foldable.some((t) => prev.has(t.key));
      if (anyFolded) return new Set();
      return new Set(foldable.map((t) => t.key));
    });
  }, [transcript.blocks]);

  const turns = useMemo(() => groupIntoTurns(transcript.blocks), [transcript.blocks]);
  const windowStart = useMemo(
    () => windowStartIndex(turns.length, WINDOW_TURNS, revealTurns),
    [turns.length, revealTurns],
  );
  const visibleTurns = useMemo(() => turns.slice(windowStart), [turns, windowStart]);
  const hiddenCount = windowStart;

  const revealEarlier = useCallback(() => {
    setRevealTurns((current) => current + Math.min(REVEAL_PAGE, Math.max(0, turns.length - WINDOW_TURNS - current)));
  }, [turns.length]);

  const revealTurnItems = useCallback((turnKey: number, hidden: number) => {
    if (hidden <= 0) return;
    setRevealedTurnItems((prev) => {
      const next = new Map(prev);
      next.set(turnKey, (next.get(turnKey) ?? 0) + Math.min(TURN_ITEM_REVEAL_PAGE, hidden));
      return next;
    });
  }, []);

  const itemWindowFor = useCallback(
    (turnKey: number, itemCount: number) => {
      const revealed = revealedTurnItems.get(turnKey) ?? 0;
      const start = turnWindowStart(itemCount, TURN_ITEMS_MAX, TURN_ITEMS_STEP, revealed);
      return {
        start,
        hidden: start,
        revealPage: Math.min(TURN_ITEM_REVEAL_PAGE, start),
      };
    },
    [revealedTurnItems],
  );

  const liveSidebar =
    wide &&
    (chrome.busy ||
      hasUnfinishedTasks(chrome.tasks) ||
      chrome.subagents.some((s) => s.status === "running") ||
      chrome.orchestration.some((o) => o.status === "running") ||
      !!chrome.thinkingStream);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 1600);
  }, []);

  const getSubagentStream = useCallback(
    (id: string) => subagentTranscripts.current[id] ?? "",
    [],
  );

  return {
    chrome,
    transcript,
    dispatchTranscript,
    foldedTurns,
    setFoldedTurns,
    foldAllTurns,
    revealEarlier,
    revealTurnItems,
    itemWindowFor,
    jobsView,
    setJobsView,
    toast,
    showToast,
    bootError,
    setBootError,
    booting,
    ready,
    wide,
    liveSidebar,
    uiMode,
    modeLabel: modeWord(uiMode),
    turns: visibleTurns,
    hiddenCount,
    revealPage: Math.min(REVEAL_PAGE, hiddenCount),
    totalTurns: turns.length,
    send,
    sendMany,
    bootstrap,
    cycleMode,
    dispatchChrome,
    clearSessionLocal,
    setBusy: (busy: boolean) => dispatchChrome({ type: "set-busy", busy }),
    setSubagentModel: (model: string | undefined) =>
      dispatchChrome({ type: "set-subagent-model", model }),
    inspectorOpen,
    setInspectorOpen,
    selectedSubagent,
    setSelectedSubagent,
    getSubagentStream,
  };
}

export type SessionApi = ReturnType<typeof useSession>;
