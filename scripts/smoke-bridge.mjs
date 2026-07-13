#!/usr/bin/env node
/**
 * Smoke: spawn vibecodr-engine-host, bootstrap cwd, snapshot + project index, shutdown.
 * Usage: node scripts/smoke-bridge.mjs [cwd]
 */
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const cwd = process.argv[2] || process.cwd();
const root =
  process.env.VIBE_CODR_ROOT || join(homedir(), "Code", "vibe-codr");
const bin = join(root, "dist", "vibecodr-engine-host");
if (!existsSync(bin)) {
  console.error("missing host:", bin);
  process.exit(1);
}

const proc = spawn(bin, [], { stdio: ["pipe", "pipe", "pipe"], cwd: root });
const rl = createInterface({ input: proc.stdout });

let ready = false;
let snapshotOk = false;
let projectsOk = false;
let finishing = false;

// Overall wall-clock so a hung RPC after ready cannot leave the smoke script stuck forever.
const overallTimer = setTimeout(() => {
  finish(1, ready
    ? "smoke-bridge timed out waiting for snapshot/listProjects after ready"
    : "smoke-bridge timed out waiting for ready");
}, 60_000);
overallTimer.unref();

function finish(code, error) {
  if (finishing) return;
  finishing = true;
  clearTimeout(overallTimer);
  if (error) console.error(error);

  const forceTimer = setTimeout(() => {
    proc.kill("SIGKILL");
  }, 2_000);
  forceTimer.unref();

  proc.once("exit", () => {
    clearTimeout(forceTimer);
    process.exit(code);
  });

  if (proc.exitCode !== null) process.exit(code);
  if (code === 0 && proc.stdin.writable) {
    proc.stdin.end(`${JSON.stringify({ op: "shutdown" })}\n`);
  } else {
    proc.kill();
  }
}

function finishIfReady() {
  if (!snapshotOk || !projectsOk) return;
  finish(0);
}

rl.on("line", (line) => {
  console.log("←", line.slice(0, 200));
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    return;
  }
  if (msg.type === "ready") {
    ready = true;
    proc.stdin.write(`${JSON.stringify({ op: "rpc", id: 1, method: "snapshot" })}\n`);
    proc.stdin.write(`${JSON.stringify({ op: "rpc", id: 2, method: "listProjects" })}\n`);
  }
  if (msg.type === "resp" && msg.id === 1) {
    if (!msg.ok) {
      finish(1, `snapshot failed: ${msg.error ?? "unknown error"}`);
      return;
    }
    console.log("snapshot ok session=", msg.value?.sessionId);
    snapshotOk = true;
    finishIfReady();
  }
  if (msg.type === "resp" && msg.id === 2) {
    if (!msg.ok || !Array.isArray(msg.value)) {
      finish(1, `project index failed: ${msg.error || "invalid response"}`);
      return;
    }
    const active = msg.value.find((project) => project?.cwd === cwd);
    if (!active || !Array.isArray(active.sessions)) {
      finish(1, `project index missing active cwd: ${cwd}`);
      return;
    }
    console.log("project index ok projects=", msg.value.length);
    projectsOk = true;
    finishIfReady();
  }
});

proc.stderr.on("data", (d) => process.stderr.write(d));
proc.stdin.write(`${JSON.stringify({ op: "bootstrap", cwd })}\n`);

setTimeout(() => {
  if (!ready) {
    finish(1, "timeout waiting for ready");
  }
}, 45000);

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => finish(1, `interrupted by ${signal}`));
}
