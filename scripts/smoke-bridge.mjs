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

function finishIfReady() {
  if (!snapshotOk || !projectsOk) return;
  proc.stdin.write(JSON.stringify({ op: "shutdown" }) + "\n");
  setTimeout(() => process.exit(0), 300);
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
    proc.stdin.write(JSON.stringify({ op: "rpc", id: 1, method: "snapshot" }) + "\n");
    proc.stdin.write(JSON.stringify({ op: "rpc", id: 2, method: "listProjects" }) + "\n");
  }
  if (msg.type === "resp" && msg.id === 1) {
    if (!msg.ok) {
      console.error("snapshot failed", msg.error);
      proc.kill();
      process.exit(1);
    }
    console.log("snapshot ok session=", msg.value?.sessionId);
    snapshotOk = true;
    finishIfReady();
  }
  if (msg.type === "resp" && msg.id === 2) {
    if (!msg.ok || !Array.isArray(msg.value)) {
      console.error("project index failed", msg.error || "invalid response");
      proc.kill();
      process.exit(1);
    }
    const active = msg.value.find((project) => project?.cwd === cwd);
    if (!active || !Array.isArray(active.sessions)) {
      console.error("project index missing active cwd", cwd);
      proc.kill();
      process.exit(1);
    }
    console.log("project index ok projects=", msg.value.length);
    projectsOk = true;
    finishIfReady();
  }
});

proc.stderr.on("data", (d) => process.stderr.write(d));
proc.stdin.write(JSON.stringify({ op: "bootstrap", cwd }) + "\n");

setTimeout(() => {
  if (!ready) {
    console.error("timeout waiting for ready");
    proc.kill();
    process.exit(1);
  }
}, 45000);
