import { describe, expect, it } from "vitest";
import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { EngineBridge } from "./engine-bridge";
import type { HostLaunch } from "./host-resolver";

function fixture(source: string): HostLaunch {
  return {
    executable: process.execPath,
    arguments: ["-e", source],
    workingDirectory: process.cwd(),
    description: "node protocol fixture",
  };
}

function bridgeFor(source: string): EngineBridge {
  return new EngineBridge({
    resolveLaunch: () => fixture(source),
    readyTimeoutMs: 800,
    rpcTimeoutMs: 800,
    stopTimeoutMs: 800,
  });
}

const snapshot = {
  sessionId: "fixture-session",
  model: "fixture",
  mode: "execute",
  goal: null,
  history: [],
  tasks: [],
  usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0, costUSD: 0 },
  busy: false,
  theme: "default",
  accentColor: "",
  details: "normal",
  mouse: false,
  approvalMode: "ask",
  commandNames: [],
};

describe("EngineBridge lifecycle", () => {
  it("bootstraps, forwards events, resolves RPC, and shuts down", async () => {
    const child = String.raw`
      const readline = require("node:readline");
      const rl = readline.createInterface({ input: process.stdin });
      rl.on("line", (line) => {
        const msg = JSON.parse(line);
        if (msg.op === "bootstrap") {
          process.stdout.write(JSON.stringify({ type: "ready", sessionId: "fixture-session" }) + "\n");
          process.stdout.write(JSON.stringify({ type: "event", event: { type: "notice", level: "info", message: "online" } }) + "\n");
        } else if (msg.op === "rpc") {
          process.stdout.write(JSON.stringify({ type: "resp", id: msg.id, ok: true, value: ${JSON.stringify(snapshot)} }) + "\n");
        } else if (msg.op === "shutdown") process.exit(0);
      });
    `;
    const bridge = bridgeFor(child);
    const events: unknown[] = [];
    bridge.onEvent = (event) => events.push(event);

    await expect(bridge.start({ cwd: process.cwd() })).resolves.toBe("fixture-session");
    await expect(bridge.rpc("snapshot")).resolves.toMatchObject({ model: "fixture" });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(events).toContainEqual({ type: "notice", level: "info", message: "online" });
    await bridge.stop();
    expect(bridge.isRunning).toBe(false);
  });

  it("surfaces malformed protocol output instead of silently desynchronizing", async () => {
    const bridge = bridgeFor(`process.stdin.resume(); process.stdout.write("not-json\\n")`);
    const fatals: string[] = [];
    bridge.onFatal = (message) => fatals.push(message);

    await expect(bridge.start({ cwd: process.cwd() })).rejects.toThrow("invalid protocol output");
    expect(fatals[0]).toContain("not-json");
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(bridge.isRunning).toBe(false);
  });

  it("kills a host that never reaches ready", async () => {
    const bridge = new EngineBridge({
      resolveLaunch: () => fixture("process.stdin.resume()"),
      readyTimeoutMs: 40,
      stopTimeoutMs: 100,
    });
    await expect(bridge.start({ cwd: process.cwd() })).rejects.toThrow("timed out waiting for ready");
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(bridge.isRunning).toBe(false);
  });

  it("reports an unexpected clean exit after ready as fatal", async () => {
    const bridge = bridgeFor(String.raw`
      const readline = require("node:readline");
      const rl = readline.createInterface({ input: process.stdin });
      rl.on("line", (line) => {
        const msg = JSON.parse(line);
        if (msg.op === "bootstrap") {
          process.stdout.write(JSON.stringify({ type: "ready", sessionId: "clean-exit" }) + "\n");
          setTimeout(() => process.exit(0), 10);
        }
      });
    `);
    const fatals: string[] = [];
    bridge.onFatal = (message) => fatals.push(message);

    await bridge.start({ cwd: process.cwd() });
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(fatals).toEqual(["Engine host exited"]);
    expect(bridge.isRunning).toBe(false);
  });

  it("terminates the host on malformed nested event payloads", async () => {
    const bridge = bridgeFor(String.raw`
      const readline = require("node:readline");
      const rl = readline.createInterface({ input: process.stdin });
      rl.on("line", (line) => {
        const msg = JSON.parse(line);
        if (msg.op === "bootstrap") {
          process.stdout.write(JSON.stringify({ type: "ready", sessionId: "nested-invalid" }) + "\n");
          setTimeout(() => process.stdout.write(JSON.stringify({
            type: "event",
            event: { type: "queue-changed", active: null, pending: [null] }
          }) + "\n"), 10);
        }
      });
    `);
    const fatals: string[] = [];
    bridge.onFatal = (message) => fatals.push(message);

    await bridge.start({ cwd: process.cwd() });
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(fatals).toEqual(["Engine host emitted an invalid nested event payload"]);
    expect(bridge.isRunning).toBe(false);
  });

  it("reports spawn failures through both the start result and fatal channel", async () => {
    const bridge = new EngineBridge({
      resolveLaunch: () => ({
        executable: "/definitely/missing/vibecodr-engine-host",
        arguments: [],
        workingDirectory: process.cwd(),
        description: "missing fixture",
      }),
      readyTimeoutMs: 500,
    });
    const fatals: string[] = [];
    bridge.onFatal = (message) => fatals.push(message);

    await expect(bridge.start({ cwd: process.cwd() })).rejects.toThrow("Could not start engine host");
    expect(fatals).toHaveLength(1);
  });

  it("retires a host that is still booting before starting its replacement", async () => {
    let launches = 0;
    const bridge = new EngineBridge({
      resolveLaunch: () => {
        launches += 1;
        return fixture(String.raw`
          const readline = require("node:readline");
          const rl = readline.createInterface({ input: process.stdin });
          rl.on("line", (line) => {
            const msg = JSON.parse(line);
            if (msg.op === "bootstrap") setTimeout(() => process.stdout.write(JSON.stringify({ type: "ready", sessionId: "session-${launches}" }) + "\n"), 100);
            if (msg.op === "shutdown") process.exit(0);
          });
        `);
      },
      readyTimeoutMs: 1_000,
      stopTimeoutMs: 500,
    });

    const first = bridge.start({ cwd: process.cwd() });
    await new Promise((resolve) => setTimeout(resolve, 20));
    const second = bridge.start({ cwd: process.cwd() });
    await expect(first).rejects.toThrow("stopped");
    await expect(second).resolves.toBe("session-2");
    expect(launches).toBe(2);
    await bridge.stop();
  });

  it("ignores ready and event output emitted by a retired host generation", async () => {
    let launches = 0;
    const bridge = new EngineBridge({
      resolveLaunch: () => {
        launches += 1;
        if (launches === 1) {
          return fixture(String.raw`
            const readline = require("node:readline");
            const rl = readline.createInterface({ input: process.stdin });
            rl.on("line", (line) => {
              const msg = JSON.parse(line);
              if (msg.op === "shutdown") {
                process.stdout.write(JSON.stringify({ type: "ready", sessionId: "stale-session" }) + "\n");
                process.stdout.write(JSON.stringify({ type: "event", event: { type: "notice", level: "warn", message: "stale" } }) + "\n");
                setTimeout(() => process.exit(0), 20);
              }
            });
          `);
        }
        return fixture(String.raw`
          const readline = require("node:readline");
          const rl = readline.createInterface({ input: process.stdin });
          rl.on("line", (line) => {
            const msg = JSON.parse(line);
            if (msg.op === "bootstrap") process.stdout.write(JSON.stringify({ type: "ready", sessionId: "current-session" }) + "\n");
            if (msg.op === "shutdown") process.exit(0);
          });
        `);
      },
      readyTimeoutMs: 1_000,
      stopTimeoutMs: 100,
    });
    const events: unknown[] = [];
    const readies: string[] = [];
    bridge.onEvent = (value) => events.push(value);
    bridge.onReady = (id) => readies.push(id);

    const first = bridge.start({ cwd: process.cwd() });
    await new Promise((resolve) => setTimeout(resolve, 20));
    const second = bridge.start({ cwd: process.cwd() });
    await expect(first).rejects.toThrow("stopped");
    await expect(second).resolves.toBe("current-session");
    expect(readies).toEqual(["current-session"]);
    expect(events).toEqual([]);
    await bridge.stop();
  });

  it("serializes three overlapping bootstraps so only the newest host survives", async () => {
    let launches = 0;
    const children: ChildProcessWithoutNullStreams[] = [];
    const bridge = new EngineBridge({
      resolveLaunch: () => {
        launches += 1;
        return fixture(String.raw`
          const readline = require("node:readline");
          const rl = readline.createInterface({ input: process.stdin });
          rl.on("line", (line) => {
            const msg = JSON.parse(line);
            if (msg.op === "bootstrap") setTimeout(() => process.stdout.write(JSON.stringify({ type: "ready", sessionId: "session-${launches}" }) + "\n"), 50);
            if (msg.op === "shutdown") setTimeout(() => process.exit(0), 10);
          });
        `);
      },
      readyTimeoutMs: 1_000,
      stopTimeoutMs: 200,
      onSpawn: (proc) => children.push(proc),
    });

    const first = bridge.start({ cwd: process.cwd() });
    await new Promise((resolve) => setTimeout(resolve, 10));
    const second = bridge.start({ cwd: process.cwd() });
    const third = bridge.start({ cwd: process.cwd() });
    await expect(first).rejects.toThrow("stopped");
    await expect(second).rejects.toThrow("stopped");
    await expect(third).resolves.toBe("session-2");
    expect(launches).toBe(2);
    expect(children.filter((child) => !child.killed && child.exitCode === null)).toHaveLength(1);
    await bridge.stop();
  });

  it("turns asynchronous child stdin failures into one fatal lifecycle error", async () => {
    let childProcess: ChildProcessWithoutNullStreams | null = null;
    const bridge = new EngineBridge({
      resolveLaunch: () => fixture(String.raw`
      const readline = require("node:readline");
      const rl = readline.createInterface({ input: process.stdin });
      rl.on("line", (line) => {
        const msg = JSON.parse(line);
        if (msg.op === "bootstrap") process.stdout.write(JSON.stringify({ type: "ready", sessionId: "pipe-session" }) + "\n");
        if (msg.op === "shutdown") process.exit(0);
      });
      `),
      readyTimeoutMs: 800,
      rpcTimeoutMs: 800,
      stopTimeoutMs: 800,
      onSpawn: (proc) => { childProcess = proc; },
    });
    const fatals: string[] = [];
    bridge.onFatal = (message) => fatals.push(message);
    await bridge.start({ cwd: process.cwd() });
    if (!childProcess) throw new Error("fixture child was not captured");
    (childProcess as ChildProcessWithoutNullStreams).stdin.emit("error", new Error("broken pipe"));
    await expect(bridge.rpc("snapshot")).rejects.toThrow();
    expect(fatals).toHaveLength(1);
    expect(fatals[0]).toContain("stdin failed");
    await bridge.stop();
  });
});
