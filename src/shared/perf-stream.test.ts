import { describe, expect, it } from "vitest";
import { initialTranscript, reduceTranscript } from "./reducer";

describe("long-session memory bounds", () => {
  it("caps retained tool output lines in the reducer", () => {
    let state = initialTranscript();
    state = reduceTranscript(state, {
      type: "tool-start",
      toolCallId: "t1",
      toolName: "bash",
      input: { command: "yes" },
    });
    const huge = Array.from({ length: 8_000 }, (_, i) => `line ${i}`).join("\n");
    state = reduceTranscript(state, {
      type: "tool-finish",
      toolCallId: "t1",
      output: huge,
      isError: false,
    });
    const tool = state.blocks.find((b) => b.kind === "tool");
    expect(tool?.kind).toBe("tool");
    if (tool?.kind !== "tool") throw new Error("expected tool block");
    expect(tool.output.length).toBeLessThanOrEqual(4_001);
    expect(tool.output[0]).toMatch(/omitted/);
  });
});
