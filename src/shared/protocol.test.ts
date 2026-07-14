import { describe, expect, it } from "vitest";
import {
  decodeInbound,
  decodeOutbound,
  encodedEngineCommandBytes,
  HOST_INBOUND_SAFE_BYTES,
  listedEngineCommandTypes,
  listedUIEventTypes,
} from "./protocol";

describe("NDJSON protocol runtime validation", () => {
  it("rejects malformed inbound messages", () => {
    expect(decodeInbound(JSON.stringify({ op: "bootstrap", cwd: "/repo" }))).not.toBeNull();
    expect(decodeInbound(JSON.stringify({ op: "bootstrap", cwd: "" }))).toBeNull();
    expect(decodeInbound(JSON.stringify({ op: "rpc", id: 0, method: "snapshot" }))).toBeNull();
    expect(decodeInbound(JSON.stringify({ op: "send", command: { type: "bogus" } }))).toBeNull();
    expect(decodeInbound(JSON.stringify({ op: "send", command: { type: "submit-prompt", text: 7 } }))).toBeNull();
  });

  it("accepts bootstrap continue flag and rejects non-boolean continue", () => {
    const ok = decodeInbound(
      JSON.stringify({ op: "bootstrap", cwd: "/repo", continue: true }),
    );
    expect(ok).not.toBeNull();
    expect(ok && ok.op === "bootstrap" && ok.continue).toBe(true);
    expect(
      decodeInbound(JSON.stringify({ op: "bootstrap", cwd: "/repo", continue: "yes" })),
    ).toBeNull();
  });

  it("rejects rpc params with non-string name", () => {
    expect(
      decodeInbound(
        JSON.stringify({
          op: "rpc",
          id: 1,
          method: "renameProject",
          params: { cwd: "/r", name: 42 },
        }),
      ),
    ).toBeNull();
    expect(
      decodeInbound(
        JSON.stringify({
          op: "rpc",
          id: 1,
          method: "renameProject",
          params: { cwd: "/r", name: "Mine" },
        }),
      ),
    ).not.toBeNull();
  });

  it("rejects malformed host messages and UI events", () => {
    expect(decodeOutbound(JSON.stringify({ type: "ready", sessionId: "ses_1" }))).not.toBeNull();
    expect(decodeOutbound(JSON.stringify({ type: "ready", sessionId: 1 }))).toBeNull();
    expect(decodeOutbound(JSON.stringify({ type: "event", event: { type: "assistant-text-delta", delta: "missing session" } }))).toBeNull();
    expect(decodeOutbound(JSON.stringify({ type: "event", event: { type: "notice", level: "info", message: "ok" } }))).not.toBeNull();
    expect(decodeOutbound(JSON.stringify({ type: "event", event: { type: "jobs-changed", sessionId: "s", jobs: "bad" } }))).toBeNull();
    expect(decodeOutbound(JSON.stringify({ type: "event", event: { type: "permission-settled", sessionId: "s", ids: [3], reason: "aborted" } }))).toBeNull();
    expect(decodeOutbound(JSON.stringify({ type: "resp", id: 1, ok: false }))).toBeNull();
  });

  it("lists exhaustive UIEvent and EngineCommand allowlists", () => {
    const events = listedUIEventTypes();
    const commands = listedEngineCommandTypes();
    expect(events).toContain("engine-idle");
    expect(events).toContain("user-message");
    expect(events.length).toBeGreaterThanOrEqual(40);
    expect(commands).toContain("submit-prompt");
    expect(commands).toContain("resolve-permission");
    expect(new Set(events).size).toBe(events.length);
    expect(new Set(commands).size).toBe(commands.length);
  });

  it("measures encoded command bytes against the host-safe ceiling", () => {
    expect(encodedEngineCommandBytes({ type: "submit-prompt", text: "hello" }))
      .toBeLessThan(HOST_INBOUND_SAFE_BYTES);
    expect(encodedEngineCommandBytes({
      type: "submit-prompt",
      text: "😀".repeat(HOST_INBOUND_SAFE_BYTES),
    })).toBeGreaterThan(HOST_INBOUND_SAFE_BYTES);
  });
});
