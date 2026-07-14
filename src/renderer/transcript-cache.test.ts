import { describe, expect, test } from "vitest";
import { initialTranscript, reduceTranscript } from "../shared/reducer";
import {
  transcriptCacheKeyBelongsToCwd,
  transcriptContentSignature,
  transcriptConversationSignature,
} from "./transcript-cache";

describe("transcriptContentSignature", () => {
  test("ignores presentation state but detects all authoritative content changes", () => {
    let state = reduceTranscript(initialTranscript(), { type: "user", text: "Build it" });
    state = reduceTranscript(state, { type: "delta", text: "Done" });
    state = reduceTranscript(state, { type: "finalize" });
    const baseline = transcriptContentSignature(state);
    const withThinking = reduceTranscript(state, { type: "thinking", text: "Reasoning" });
    expect(transcriptContentSignature(withThinking)).not.toBe(baseline);
    expect(transcriptContentSignature({
      ...state,
      blocks: state.blocks.map((block) => ({ ...block, id: block.id + 10 })),
    })).toBe(baseline);
    expect(transcriptContentSignature({
      ...withThinking,
      blocks: withThinking.blocks.map((block) =>
        block.kind === "thinking" ? { ...block, seconds: 42, collapsed: false } : block
      ),
    })).toBe(transcriptContentSignature(withThinking));
    const changed = reduceTranscript(state, { type: "delta", text: "More" });
    expect(transcriptContentSignature(changed)).not.toBe(baseline);
    expect(transcriptContentSignature({
      ...state,
      changedFiles: [{ path: "src/app.ts", added: 1, removed: 0, diff: "+new" }],
    })).not.toBe(baseline);
  });
});

describe("transcriptConversationSignature", () => {
  test("ignores non-reconstructible file chrome but validates authoritative tool content", () => {
    let authoritative = reduceTranscript(initialTranscript(), { type: "user", text: "Build it" });
    authoritative = reduceTranscript(authoritative, { type: "delta", text: "Done" });
    authoritative = reduceTranscript(authoritative, { type: "finalize" });
    const cached = reduceTranscript(authoritative, {
      type: "notice",
      text: "Checkpoint created",
      level: "info",
    });
    expect(transcriptConversationSignature(cached)).toBe(
      transcriptConversationSignature(authoritative),
    );
    expect(transcriptConversationSignature({
      ...cached,
      changedFiles: [{ path: "src/app.ts", added: 1, removed: 0, diff: "+new" }],
    })).toBe(transcriptConversationSignature(authoritative));
    let withTool = reduceTranscript(authoritative, {
      type: "tool-start",
      toolCallId: "call-1",
      toolName: "read",
      input: { path: "src/app.ts" },
    });
    withTool = reduceTranscript(withTool, {
      type: "tool-finish",
      toolCallId: "call-1",
      output: "original",
      isError: false,
    });
    const alteredTool = {
      ...withTool,
      blocks: withTool.blocks.map((block) =>
        block.kind === "tool" ? { ...block, output: ["altered"] } : block
      ),
    };
    expect(transcriptConversationSignature(alteredTool)).not.toBe(
      transcriptConversationSignature(withTool),
    );
    const foldedDiff = reduceTranscript(withTool, {
      type: "file-changed",
      toolCallId: "missing-call",
      path: "src/app.ts",
      action: "edit",
      added: 1,
      removed: 1,
      diff: "-old\n+new",
    });
    expect(transcriptConversationSignature(foldedDiff)).toBe(
      transcriptConversationSignature(withTool),
    );
    expect(
      transcriptConversationSignature(
        reduceTranscript(authoritative, { type: "delta", text: "Different" }),
      ),
    ).not.toBe(transcriptConversationSignature(authoritative));
  });
});

describe("transcript cache key ownership", () => {
  test("matches only session records for the exact cwd", () => {
    expect(transcriptCacheKeyBelongsToCwd("/repo\u0000ses_1", "/repo")).toBe(true);
    expect(transcriptCacheKeyBelongsToCwd("/repo-two\u0000ses_1", "/repo")).toBe(false);
  });
});
