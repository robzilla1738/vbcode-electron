import type { Message } from "./types";
import { initialTranscript, reduceTranscript, type TranscriptState } from "./reducer";

/** Hydrate transcript blocks from snapshot history (resume UX). */
export function hydrateFromHistory(history: Message[]): TranscriptState {
  let s = initialTranscript();
  for (const msg of history) {
    if (msg.role === "user") {
      const text = msg.parts
        .filter((p): p is { type: "text"; text: string } => p.type === "text")
        .map((p) => p.text)
        .join("\n");
      if (text) s = reduceTranscript(s, { type: "user", text, timestamp: msg.createdAt });
    } else if (msg.role === "assistant" || msg.role === "tool") {
      for (const part of msg.parts) {
        if (msg.role === "assistant" && part.type === "text" && part.text) {
          s = reduceTranscript(s, { type: "delta", text: part.text, timestamp: msg.createdAt });
          s = reduceTranscript(s, { type: "finalize" });
        } else if (msg.role === "assistant" && part.type === "reasoning" && part.text) {
          s = reduceTranscript(s, { type: "thinking", text: part.text });
        } else if (msg.role === "assistant" && part.type === "tool-call") {
          s = reduceTranscript(s, {
            type: "tool-start",
            toolCallId: part.toolCallId,
            toolName: part.toolName,
            input: part.input,
          });
        } else if (part.type === "tool-result") {
          s = reduceTranscript(s, {
            type: "tool-finish",
            toolCallId: part.toolCallId,
            output: part.output,
            isError: !!part.isError,
          });
        }
      }
    }
  }
  return s;
}
