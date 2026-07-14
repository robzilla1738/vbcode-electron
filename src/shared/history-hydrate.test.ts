import { describe, expect, it } from "vitest";
import { hydrateFromHistory } from "./history-hydrate";
import type { Message } from "./types";

describe("hydrateFromHistory", () => {
  it("rebuilds changedFiles from edit/write tool pairs on resume", () => {
    const history: Message[] = [
      {
        id: "u1",
        role: "user",
        createdAt: 1,
        parts: [{ type: "text", text: "edit the file" }],
      },
      {
        id: "a1",
        role: "assistant",
        createdAt: 2,
        parts: [
          {
            type: "tool-call",
            toolCallId: "c1",
            toolName: "edit",
            input: { path: "src/app.ts" },
          },
        ],
      },
      {
        id: "t1",
        role: "tool",
        createdAt: 3,
        parts: [
          {
            type: "tool-result",
            toolCallId: "c1",
            toolName: "edit",
            output: "updated",
            isError: false,
          },
        ],
      },
    ];
    const state = hydrateFromHistory(history);
    expect(state.changedFiles.some((f) => f.path === "src/app.ts")).toBe(true);
  });

  it("hydrates user and assistant text", () => {
    const history: Message[] = [
      {
        id: "u1",
        role: "user",
        createdAt: 1,
        parts: [{ type: "text", text: "hello" }],
      },
      {
        id: "a1",
        role: "assistant",
        createdAt: 2,
        parts: [{ type: "text", text: "hi there" }],
      },
    ];
    const state = hydrateFromHistory(history);
    expect(state.blocks.some((b) => b.kind === "user" && b.text === "hello")).toBe(true);
    expect(state.blocks.some((b) => b.kind === "assistant" && b.text.includes("hi"))).toBe(true);
  });

  it("preserves engine-authored follow-up attribution on resume", () => {
    const state = hydrateFromHistory([
      {
        id: "internal-1",
        role: "user",
        createdAt: 1,
        parts: [{ type: "text", text: "Fix the flagged review issues." }],
        metadata: { origin: "engine", label: "Automatic review follow-up" },
      },
    ]);

    expect(state.blocks[0]).toMatchObject({
      kind: "user",
      origin: "engine",
      label: "Automatic review follow-up",
    });
  });

  it("preserves reasoning order relative to tool calls", () => {
    const state = hydrateFromHistory([
      {
        id: "a1",
        role: "assistant",
        createdAt: 1,
        parts: [
          { type: "reasoning", text: "Inspect first" },
          {
            type: "tool-call",
            toolCallId: "call-1",
            toolName: "read",
            input: { path: "src/app.ts" },
          },
        ],
      },
    ]);
    expect(state.blocks.map((block) => block.kind)).toEqual(["thinking", "tool"]);
  });
});
