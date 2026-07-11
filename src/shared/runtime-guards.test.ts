import { describe, expect, it } from "vitest";
import { isEngineSnapshot, isProjectSummaryArray, isRpcResult } from "./runtime-guards";

const snapshot = {
  sessionId: "ses_1", model: "provider/model", mode: "execute", goal: null,
  history: [], tasks: [], usage: { inputTokens: 0, outputTokens: 0 }, busy: false,
  theme: "default", accentColor: "", details: "normal", mouse: false,
  approvalMode: "ask", commandNames: [],
};

describe("RPC runtime guards", () => {
  it("accepts complete snapshots and rejects partial payloads", () => {
    expect(isEngineSnapshot(snapshot)).toBe(true);
    expect(isEngineSnapshot({ ...snapshot, sessionId: 4 })).toBe(false);
    expect(isEngineSnapshot({ ...snapshot, history: null })).toBe(false);
    expect(isRpcResult("snapshot", snapshot)).toBe(true);
  });

  it("validates project and catalog result shapes", () => {
    const projects = [{ cwd: "/repo", name: "repo", updatedAt: 1, sessions: [{ id: "s", title: "T", model: "m", mode: "execute", goal: null, createdAt: 1, updatedAt: 2 }] }];
    expect(isProjectSummaryArray(projects)).toBe(true);
    expect(isProjectSummaryArray([{ cwd: "/repo", sessions: [] }])).toBe(false);
    expect(isRpcResult("listModels", [{ id: "m", providerId: "p", contextWindow: 1_000 }])).toBe(true);
    expect(isRpcResult("listModels", [{ id: "m", providerId: 4 }])).toBe(false);
    expect(isRpcResult("listProviders", [{ id: "p", configured: true, keyless: false, env: ["KEY"] }])).toBe(true);
    expect(isRpcResult("listProviders", [{ id: "p", configured: "yes", keyless: false, env: [] }])).toBe(false);
  });
});
