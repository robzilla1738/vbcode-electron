import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import type { EngineCommand } from "../../shared/commands";
import type { UIEvent } from "../../shared/events";
import { GLYPH } from "../../shared/glyphs";
import { hydrateFromHistory } from "../../shared/history-hydrate";
import {
  cycleModeAction,
  deriveUiMode,
  modeColor,
  modeWord,
  selectModeAction,
  type UiMode,
} from "../../shared/modes";
import { isUIEvent } from "../../shared/protocol";
import {firstLine, 
  groupIntoTurns,
  initialTranscript,
  reduceTranscript,
  type TranscriptAction,
  type TranscriptState
} from "../../shared/reducer";
import { isEngineSnapshot, isRenderableUIEvent } from "../../shared/runtime-guards";
import { getTheme } from "../../shared/themes";
import { Trail, turnWindowStart, windowStartIndex } from "../../shared/trail";
import type { EngineSnapshot } from "../../shared/types";
import { applyPalette } from "../theme/applyPalette";
import { RequestGate } from "./request-gate";
import { initialChrome, reduceChrome } from "./session-state";

export type { OrchestrationRow, SessionChrome } from "./session-state";

type TxAction =
  | TranscriptAction
  | { type: "reset" }
  | { type: "replace"; state: TranscriptState };

function reduceTx(s: TranscriptState, a: TxAction): TranscriptState {
  if (a.type === "reset") return initialTranscript();
  if (a.type === "replace") return a.state;
  return reduceTranscript(s, a);
}

export type ToastSeverity = "info" | "warn" | "error";

export interface ToastState {
  message: string;
  severity: ToastSeverity;
}

/** Auto-dismiss delay by severity. Errors stay long enough to read (I55). */
const TOAST_TTL: Record<ToastSeverity, number> = {
  info: 3000,
  warn: 4500,
  error: 6000,
};

const WINDOW_TURNS = 40;
const REVEAL_PAGE = 20;
const TURN_ITEMS_MAX = 120;
const TURN_ITEMS_STEP = 24;
const TURN_ITEM_REVEAL_PAGE = TURN_ITEMS_STEP;

export function useSession(cwd: string | null) {
  const [chrome, dispatchChrome] = useReducer(reduceChrome, cwd ?? "", (c) =>
    initialChrome(c || ""),
  );
  const [transcript, dispatchTranscript] = useReducer(reduceTx, undefined, initialTranscript);
  const [foldedTurns, setFoldedTurns] = useState<Set<number>>(new Set());
  const [revealTurns, setRevealTurns] = useState(0);
  const [revealedTurnItems, setRevealedTurnItems] = useState<Map<number, number>>(() => new Map());
  const [jobsView, setJobsView] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [bootError, setBootError] = useState<string | null>(null);
  const [booting, setBooting] = useState(false);
  const [ready, setReady] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [selectedSubagent, setSelectedSubagent] = useState<string | null>(null);
  const deltaBuf = useRef("");
  const progressBuf = useRef<Map<string, string>>(new Map());
  const reasoningBuf = useRef("");
  const reasoningStarted = useRef<number | null>(null);
  const flushTimer = useRef<number | null>(null);
  const suppressAfterClear = useRef(false);
  const lastSnap = useRef<EngineSnapshot | null>(null);
  const subagentTranscripts = useRef<Record<string, string>>({});
  const trail = useRef(new Trail());
  const bootstrapGate = useRef(new RequestGate());
  const activeSessionId = useRef("");
  const toastTimer = useRef<number | null>(null);
  const bootstrapContext = useRef<{ usedTokens: number; contextWindow: number } | null>(null);

  const uiMode: UiMode = deriveUiMode(chrome.mode, chrome.approvals);

  useEffect(() => {
    applyPalette(getTheme(chrome.theme), chrome.accent || undefined, chrome.theme);
    document.documentElement.style.setProperty("--mode", modeColor(uiMode));
  }, [chrome.theme, chrome.accent, uiMode]);

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
    // Flush buffered tool progress chunks first (TUI parity: landPending order).
    if (progressBuf.current.size) {
      for (const [toolCallId, chunk] of progressBuf.current) {
        dispatchTranscript({ type: "tool-progress", toolCallId, chunk });
      }
      progressBuf.current.clear();
    }
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
      if (!isUIEvent(raw) || !isRenderableUIEvent(raw)) {
        dispatchTranscript({ type: "notice", text: "Engine emitted an invalid UI event", level: "error" });
        return;
      }
      const event: UIEvent = raw;
      if ("sessionId" in event && activeSessionId.current && event.sessionId !== activeSessionId.current) return;
      // A throwing handler must not kill the event loop (TUI parity: try/catch
      // around the per-event switch that surfaces errors as transcript notices).
      try {

      if (event.type === "context-updated") {
        // The host starts its event pump before snapshot RPC completes. Keep the
        // newest pre-seed context sample so snapshot seeding cannot erase it.
        bootstrapContext.current = {
          usedTokens: event.usedTokens,
          contextWindow: event.contextWindow,
        };
      }

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
            flushTimer.current = window.setTimeout(flushDeltas, 24);
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
          // Buffer progress chunks and flush on the same timer as text deltas
          // (TUI parity: coalesce chatty tool output to avoid per-chunk re-renders).
          {
            const prev = progressBuf.current.get(event.toolCallId) ?? "";
            progressBuf.current.set(event.toolCallId, prev + event.chunk);
            if (flushTimer.current == null) {
              flushTimer.current = window.setTimeout(flushDeltas, 24);
            }
          }
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
    progressBuf.current.clear();
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
      const request = bootstrapGate.current.begin();
      activeSessionId.current = "";
      bootstrapContext.current = null;
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
      progressBuf.current.clear();
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
      if (!bootstrapGate.current.isCurrent(request)) return false;
      if (!res.ok) {
        setBootError(res.error + (res.stderr ? `\n${res.stderr}` : ""));
        setBooting(false);
        return false;
      }
      const snapRes = await window.vibe.rpc("snapshot");
      if (!bootstrapGate.current.isCurrent(request)) return false;
      if (!snapRes.ok) {
        await window.vibe.stop().catch(() => undefined);
        setBootError(`Engine snapshot failed: ${snapRes.error}`);
        setBooting(false);
        return false;
      }
      if (!isEngineSnapshot(snapRes.value)) {
        await window.vibe.stop().catch(() => undefined);
        setBootError("Engine snapshot failed validation");
        setBooting(false);
        return false;
      }
      const snap: EngineSnapshot = snapRes.value;
      activeSessionId.current = snap.sessionId;
      lastSnap.current = snap;
      dispatchChrome({ type: "seed", snap, cwd: opts.cwd });
      const context = bootstrapContext.current as {
        usedTokens: number;
        contextWindow: number;
      } | null;
      if (context) {
        dispatchChrome({
          type: "event",
          event: {
            type: "context-updated",
            sessionId: snap.sessionId,
            usedTokens: context.usedTokens,
            contextWindow: context.contextWindow,
          },
        });
      }
      bootstrapContext.current = null;
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
      if (flushTimer.current != null) window.clearTimeout(flushTimer.current);
      if (toastTimer.current != null) window.clearTimeout(toastTimer.current);
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
    } else if (chrome.plan) {
      // Silent no-op felt broken — surface why the chip didn't move (TUI parity).
      dispatchTranscript({
        type: "notice",
        text: "Approve or revise the plan first (Enter / type / Esc) — mode stays PLAN.",
        level: "info",
      });
    }
  }, [uiMode, chrome.plan, sendMany]);

  const selectMode = useCallback(
    (target: UiMode) => {
      const action = selectModeAction(uiMode, target, { planPending: !!chrome.plan });
      if (action.commands.length === 0 && !action.optimistic) return;
      void sendMany(action.commands);
      if (action.optimistic) {
        dispatchChrome({
          type: "optimistic-mode",
          mode: action.optimistic.mode,
          approvals: action.optimistic.approvals,
        });
      } else if (chrome.plan && target !== "plan") {
        dispatchTranscript({
          type: "notice",
          text: "Approve or revise the plan first (Enter / type / Esc) — mode stays PLAN.",
          level: "info",
        });
      }
    },
    [uiMode, chrome.plan, sendMany],
  );

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

  const dismissToast = useCallback(() => {
    if (toastTimer.current != null) {
      window.clearTimeout(toastTimer.current);
      toastTimer.current = null;
    }
    setToast(null);
  }, []);

  const showToast = useCallback((msg: string, severity: ToastSeverity = "info") => {
    if (toastTimer.current != null) window.clearTimeout(toastTimer.current);
    setToast({ message: msg, severity });
    toastTimer.current = window.setTimeout(() => {
      toastTimer.current = null;
      setToast(null);
    }, TOAST_TTL[severity]);
  }, []);

  // Clear any pending toast on unmount.
  useEffect(() => () => {
    if (toastTimer.current != null) window.clearTimeout(toastTimer.current);
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
    dismissToast,
    bootError,
    setBootError,
    booting,
    ready,
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
    selectMode,
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
