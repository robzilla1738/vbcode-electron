import { describe, expect, it } from "vitest";
import type { UIEvent } from "../../shared/events";
import { initialChrome, reduceChrome } from "./session-state";

function event(state: ReturnType<typeof initialChrome>, value: UIEvent) {
  return reduceChrome(state, { type: "event", event: value });
}

describe("session chrome state", () => {
  it("stays busy across per-turn idle events until engine-idle", () => {
    let state = initialChrome("/repo");
    state = event(state, { type: "user-message", sessionId: "s", text: "work" });
    expect(state.busy).toBe(true);
    state = event(state, { type: "turn-finished", sessionId: "s" });
    expect(state.busy).toBe(true);
    state = event(state, { type: "session-idle", sessionId: "s" });
    expect(state.busy).toBe(true);
    state = event(state, { type: "engine-idle", sessionId: "s", gate: "green" });
    expect(state.busy).toBe(false);
    expect(state.lastGate).toBe("green");
  });

  it("queues and settles permission cards by engine id", () => {
    let state = initialChrome("/repo");
    state = event(state, {
      type: "permission-request",
      sessionId: "s",
      id: "p1",
      toolName: "bash",
      input: { command: "pwd" },
    });
    state = event(state, {
      type: "permission-request",
      sessionId: "s",
      id: "p2",
      toolName: "write",
      input: {},
    });
    expect(state.perms.map((item) => item.id)).toEqual(["p1", "p2"]);
    state = event(state, {
      type: "permission-settled",
      sessionId: "s",
      ids: ["p1"],
      reason: "aborted",
    });
    expect(state.perms.map((item) => item.id)).toEqual(["p2"]);
  });

  it("keeps plan evidence and clears it only when a new user turn begins", () => {
    let state = initialChrome("/repo");
    state = event(state, {
      type: "plan-presented",
      sessionId: "s",
      plan: "Ship safely",
      sources: [{ url: "https://example.com", title: "Reference" }],
      assumptions: ["CI is available"],
      ungrounded: true,
    });
    expect(state.plan).toMatchObject({
      text: "Ship safely",
      ungrounded: true,
      assumptions: ["CI is available"],
    });
    state = event(state, { type: "session-idle", sessionId: "s" });
    expect(state.plan?.text).toBe("Ship safely");
    state = event(state, { type: "user-message", sessionId: "s", text: "revise" });
    expect(state.plan).toBeNull();
  });

  it("resets every session-scoped overlay on clear", () => {
    const populated = {
      ...initialChrome("/repo"),
      busy: true,
      thinkingStream: "thinking",
      lastGate: "red" as const,
      tasks: [{ id: "t", title: "Task", status: "in_progress" as const }],
      checkpoints: [{ id: "c", label: "before" }],
    };
    const state = reduceChrome(populated, { type: "clear-session-overlays" });
    expect(state).toMatchObject({ busy: false, thinkingStream: "", tasks: [], lastGate: null });
    // Checkpoints belong to the session and must not survive /clear or /new.
    expect(state.checkpoints).toEqual([]);
  });
});

describe("mode-changed plan dismissal", () => {
  it("dismisses the plan card when leaving plan mode", () => {
    let state = initialChrome("/repo");
    state = event(state, {
      type: "plan-presented",
      sessionId: "s",
      plan: "Do work",
    });
    expect(state.plan).not.toBeNull();
    state = event(state, { type: "mode-changed", sessionId: "s", mode: "execute" });
    expect(state.plan).toBeNull();
  });

  it("keeps the plan card when staying in plan mode", () => {
    let state = initialChrome("/repo");
    state = event(state, {
      type: "plan-presented",
      sessionId: "s",
      plan: "Do work",
    });
    state = event(state, { type: "mode-changed", sessionId: "s", mode: "plan" });
    expect(state.plan).not.toBeNull();
  });
});

describe("user-message per-turn reset", () => {
  it("resets subagents on new user message", () => {
    let state = initialChrome("/repo");
    state = event(state, {
      type: "subagent-started",
      sessionId: "s",
      subagentId: "sub1",
      prompt: "review code",
    });
    expect(state.subagents).toHaveLength(1);
    state = event(state, { type: "user-message", sessionId: "s", text: "next" });
    expect(state.subagents).toHaveLength(0);
  });

  it("resets thoughtLog on new user message", () => {
    let state = initialChrome("/repo");
    state = reduceChrome(state, { type: "set-trail", lines: ["thought 1", "thought 2"] });
    expect(state.thoughtLog).toHaveLength(2);
    state = event(state, { type: "user-message", sessionId: "s", text: "next" });
    expect(state.thoughtLog).toHaveLength(0);
  });

  it("resets orchestration rows on new user message", () => {
    let state = initialChrome("/repo");
    state = event(state, {
      type: "orchestration-task",
      sessionId: "s",
      taskId: "dag_1",
      objective: "Recon existing structure",
      status: "completed",
      attempts: 1,
      durationMs: 4200,
    });
    expect(state.orchestration).toHaveLength(1);
    state = event(state, { type: "user-message", sessionId: "s", text: "next" });
    expect(state.orchestration).toHaveLength(0);
  });
});

describe("subagent-activity running-only", () => {
  it("only updates activity for running subagents", () => {
    let state = initialChrome("/repo");
    state = event(state, {
      type: "subagent-started",
      sessionId: "s",
      subagentId: "sub1",
      prompt: "task a",
    });
    state = event(state, {
      type: "subagent-finished",
      sessionId: "s",
      subagentId: "sub1",
      result: "done",
    });
    state = event(state, {
      type: "subagent-activity",
      sessionId: "s",
      subagentId: "sub1",
      label: "should not update",
    });
    expect(state.subagents[0]?.activity).toBeUndefined();
  });
});

describe("subagent-started deduplication", () => {
  it("updates an existing subagent in place (continue_subagent reuses id)", () => {
    let state = initialChrome("/repo");
    state = event(state, {
      type: "subagent-started",
      sessionId: "s",
      subagentId: "sub1",
      prompt: "first prompt",
    });
    expect(state.subagents).toHaveLength(1);
    expect(state.subagents[0]?.prompt).toBe("first prompt");

    state = event(state, {
      type: "subagent-finished",
      sessionId: "s",
      subagentId: "sub1",
      result: "first result",
    });
    expect(state.subagents[0]?.status).toBe("done");
    expect(state.subagents[0]?.result).toBe("first result");

    // continue_subagent reuses the same id — update in place, not append
    state = event(state, {
      type: "subagent-started",
      sessionId: "s",
      subagentId: "sub1",
      prompt: "second prompt",
    });
    expect(state.subagents).toHaveLength(1);
    expect(state.subagents[0]?.prompt).toBe("second prompt");
    expect(state.subagents[0]?.status).toBe("running");
    expect(state.subagents[0]?.result).toBeUndefined();
    expect(state.subagents[0]?.activity).toBeUndefined();
  });

  it("appends a new subagent when the id is fresh", () => {
    let state = initialChrome("/repo");
    state = event(state, {
      type: "subagent-started",
      sessionId: "s",
      subagentId: "sub1",
      prompt: "task a",
    });
    state = event(state, {
      type: "subagent-started",
      sessionId: "s",
      subagentId: "sub2",
      prompt: "task b",
    });
    expect(state.subagents).toHaveLength(2);
    expect(state.subagents[0]?.id).toBe("sub1");
    expect(state.subagents[1]?.id).toBe("sub2");
  });
});

describe("large agent payload retention", () => {
  it("caps plan and subagent result payloads with a visible omission marker", () => {
    let state = initialChrome("/repo");
    state = event(state, {
      type: "plan-presented",
      sessionId: "s",
      plan: "p".repeat(2 * 1024 * 1024 + 100),
    });
    expect(state.plan?.text).toHaveLength(2 * 1024 * 1024);
    expect(state.plan?.text).toContain("earlier content omitted");

    state = event(state, {
      type: "subagent-started",
      sessionId: "s",
      subagentId: "sub-large",
      prompt: "review",
    });
    state = event(state, {
      type: "subagent-finished",
      sessionId: "s",
      subagentId: "sub-large",
      result: `old${"x".repeat(256 * 1024)}new`,
    });
    expect(state.subagents[0]?.result).toHaveLength(256 * 1024);
    expect(state.subagents[0]?.result).toContain("earlier content omitted");
    expect(state.subagents[0]?.result?.endsWith("new")).toBe(true);
  });
});
