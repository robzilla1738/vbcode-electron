import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createInterface } from "node:readline";
import type { EngineCommand } from "../shared/commands";
import {
  decodeOutbound,
  encodeInbound,
  type HostInbound,
  type RpcMethod,
} from "../shared/protocol";
import { enrichedEnv, resolveHostLaunch, type HostLaunch } from "./host-resolver";
import { isRenderableUIEvent, isRpcResult } from "../shared/runtime-guards";

const READY_TIMEOUT_MS = 45_000;
const RPC_TIMEOUT_MS = 20_000;
const STOP_TIMEOUT_MS = 2_000;

export type BridgeEventHandler = (event: unknown) => void;
export type BridgeFatalHandler = (message: string) => void;
export type BridgeReadyHandler = (sessionId: string) => void;

export interface EngineBridgeOptions {
  resolveLaunch?: () => HostLaunch;
  environment?: () => NodeJS.ProcessEnv;
  readyTimeoutMs?: number;
  rpcTimeoutMs?: number;
  stopTimeoutMs?: number;
  /** Test seam for deterministic stream/process failure injection. */
  onSpawn?: (proc: ChildProcessWithoutNullStreams) => void;
}

export interface EngineStartOptions {
  cwd: string;
  resume?: string;
  continueLatest?: boolean;
  model?: string;
  mode?: "plan" | "execute" | "yolo";
}

export class EngineBridge {
  private proc: ChildProcessWithoutNullStreams | null = null;
  private generation = 0;
  private startRequest = 0;
  private lifecycle: Promise<void> = Promise.resolve();
  private nextRpcId = 1;
  private rpcWaiters = new Map<
    number,
    { method: RpcMethod; resolve: (v: unknown) => void; reject: (e: Error) => void; timer: NodeJS.Timeout }
  >();
  private readyWaiters: Array<{
    resolve: (sessionId: string) => void;
    reject: (e: Error) => void;
  }> = [];
  private didReady = false;
  private sessionId = "";
  private stderrBuf = "";
  lastLaunchDescription = "";
  lastFatal: string | null = null;
  lastStderr = "";

  onEvent: BridgeEventHandler | null = null;
  onFatal: BridgeFatalHandler | null = null;
  onReady: BridgeReadyHandler | null = null;

  constructor(private readonly options: EngineBridgeOptions = {}) {}

  get isRunning(): boolean {
    return this.proc != null && !this.proc.killed;
  }

  start(opts: EngineStartOptions): Promise<string> {
    const request = ++this.startRequest;
    this.generation += 1;
    // Supersede a bootstrap that is waiting for ready immediately; its queued
    // lifecycle step then releases so the newest request can retire its child.
    this.failReady(new Error("Engine host stopped"));
    this.failAllRpc(new Error("Engine host stopped"));
    return this.schedule(async () => {
      if (request !== this.startRequest) throw new Error("Engine host stopped");
      if (this.proc) await this.stopCurrent();
      if (request !== this.startRequest) throw new Error("Engine host stopped");
      return this.startCurrent(opts);
    });
  }

  private async startCurrent(opts: EngineStartOptions): Promise<string> {
    // A second bootstrap can arrive while the prior host is still starting.
    // Always retire any existing child before spawning another; checking only
    // `didReady` leaks two hosts and lets both write into the same renderer.
    const generation = ++this.generation;

    this.lastFatal = null;
    this.lastStderr = "";
    this.stderrBuf = "";
    this.didReady = false;
    this.sessionId = "";

    let launch: HostLaunch;
    try {
      launch = (this.options.resolveLaunch ?? resolveHostLaunch)();
    } catch (e) {
      throw e instanceof Error ? e : new Error(String(e));
    }
    this.lastLaunchDescription = launch.description;
    console.log(`[bridge] launching: ${launch.description}`);

    const proc = spawn(launch.executable, launch.arguments, {
      cwd: launch.workingDirectory,
      env: (this.options.environment ?? enrichedEnv)(),
      stdio: ["pipe", "pipe", "pipe"],
    });
    this.proc = proc;

    const isCurrent = () => this.proc === proc && this.generation === generation;
    const rl = createInterface({ input: proc.stdout });
    rl.on("line", (line) => {
      if (isCurrent()) this.handleLine(line, proc, generation);
    });

    proc.stderr.on("data", (chunk: Buffer) => {
      if (!isCurrent()) return;
      this.stderrBuf += chunk.toString("utf8");
      if (this.stderrBuf.length > 64_000) {
        this.stderrBuf = this.stderrBuf.slice(-32_000);
      }
    });

    const streamFailure = (stream: string, error: Error) => {
      if (isCurrent()) this.terminateFatal(`Engine host ${stream} failed: ${error.message}`, proc, generation);
    };
    proc.stdin.on("error", (error) => streamFailure("stdin", error));
    proc.stdout.on("error", (error) => streamFailure("stdout", error));
    proc.stderr.on("error", (error) => streamFailure("stderr", error));
    this.options.onSpawn?.(proc);

    proc.on("exit", (code, signal) => {
      rl.close();
      if (!isCurrent()) return;
      this.proc = null;
      const errText = this.consumeStderr();
      if (errText) this.lastStderr = errText;
      const msg =
        signal
          ? errText || `Engine host exited on ${signal}`
          : code && code !== 0
          ? errText || `Engine host exited (${code})`
          : "Engine host exited";
      // Any exit from the current generation is unexpected. Planned stop/start
      // paths increment generation first, so their exit handlers fail isCurrent.
      if (!this.lastFatal) {
        this.lastFatal = msg;
        this.onFatal?.(msg);
      }
      this.failReady(new Error(msg));
      this.failAllRpc(new Error("Engine host not running"));
    });

    proc.on("error", (error) => {
      if (!isCurrent()) return;
      this.proc = null;
      const message = `Could not start engine host: ${error.message}`;
      this.lastFatal = message;
      this.onFatal?.(message);
      this.failReady(new Error(message));
      this.failAllRpc(new Error(message));
    });

    this.write({
      op: "bootstrap",
      cwd: opts.cwd,
      ...(opts.resume ? { resume: opts.resume } : {}),
      ...(opts.continueLatest ? { continue: true } : {}),
      ...(opts.model ? { model: opts.model } : {}),
      ...(opts.mode ? { mode: opts.mode } : {}),
    });

    return this.waitForReady(this.options.readyTimeoutMs ?? READY_TIMEOUT_MS);
  }

  stop(): Promise<void> {
    this.startRequest += 1;
    this.generation += 1;
    this.failReady(new Error("Engine host stopped"));
    this.failAllRpc(new Error("Engine host stopped"));
    return this.schedule(() => this.stopCurrent());
  }

  private async stopCurrent(): Promise<void> {
    this.generation += 1;
    this.failReady(new Error("Engine host stopped"));
    this.failAllRpc(new Error("Engine host stopped"));
    const proc = this.proc;
    if (proc && !proc.killed) {
      try {
        this.write({ op: "shutdown" });
      } catch {
        /* ignore */
      }
      await Promise.race([
        new Promise<void>((resolve) => proc.once("exit", () => resolve())),
        sleep(this.options.stopTimeoutMs ?? STOP_TIMEOUT_MS),
      ]);
    }
    if (this.proc === proc) {
      proc?.kill();
      this.proc = null;
    }
    this.didReady = false;
  }

  private schedule<T>(work: () => Promise<T>): Promise<T> {
    const run = this.lifecycle.then(work);
    this.lifecycle = run.then(() => undefined, () => undefined);
    return run;
  }

  send(command: EngineCommand): void {
    this.write({ op: "send", command });
  }

  async rpc(method: RpcMethod, params?: Record<string, unknown>): Promise<unknown> {
    if (!this.isRunning) throw new Error("Engine host not running");
    const id = this.nextRpcId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.rpcWaiters.delete(id);
        reject(new Error(`RPC ${method} timed out`));
      }, this.options.rpcTimeoutMs ?? RPC_TIMEOUT_MS);
      this.rpcWaiters.set(id, { method, resolve, reject, timer });
      try {
        this.write({
          op: "rpc",
          id,
          method,
          ...(params && Object.keys(params).length ? { params } : {}),
        } as HostInbound);
      } catch (e) {
        clearTimeout(timer);
        this.rpcWaiters.delete(id);
        reject(e instanceof Error ? e : new Error(String(e)));
      }
    });
  }

  private write(msg: HostInbound): void {
    if (!this.proc?.stdin.writable) throw new Error("Engine host stdin closed");
    this.proc.stdin.write(encodeInbound(msg));
  }

  private handleLine(
    line: string,
    proc: ChildProcessWithoutNullStreams,
    generation: number,
  ): void {
    if (this.proc !== proc || this.generation !== generation) return;
    const msg = decodeOutbound(line);
    if (!msg) {
      const excerpt = line.trim().slice(0, 160);
      const message = `Engine host emitted invalid protocol output${excerpt ? `: ${excerpt}` : ""}`;
      this.terminateFatal(message, proc, generation);
      return;
    }
    switch (msg.type) {
      case "ready":
        this.didReady = true;
        this.sessionId = msg.sessionId;
        this.onReady?.(msg.sessionId);
        for (const w of this.readyWaiters) w.resolve(msg.sessionId);
        this.readyWaiters = [];
        break;
      case "event":
        if (!isRenderableUIEvent(msg.event)) {
          this.terminateFatal("Engine host emitted an invalid nested event payload", proc, generation);
        } else {
          this.onEvent?.(msg.event);
        }
        break;
      case "resp": {
        const waiter = this.rpcWaiters.get(msg.id);
        if (!waiter) break;
        clearTimeout(waiter.timer);
        this.rpcWaiters.delete(msg.id);
        if (msg.ok) {
          if (!isRpcResult(waiter.method, msg.value)) {
            const message = `Engine host returned invalid ${waiter.method} response`;
            waiter.reject(new Error(message));
            this.terminateFatal(message, proc, generation);
          } else {
            waiter.resolve(msg.value);
          }
        } else waiter.reject(new Error(msg.error));
        break;
      }
      case "fatal":
        this.terminateFatal(msg.message, proc, generation);
        break;
    }
  }

  private waitForReady(timeoutMs: number): Promise<string> {
    if (this.didReady) return Promise.resolve(this.sessionId);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const idx = this.readyWaiters.findIndex((w) => w.reject === rejectReady);
        if (idx >= 0) this.readyWaiters.splice(idx, 1);
        const errTail = this.consumeStderr();
        if (errTail) this.lastStderr = errTail;
        const message = `Engine host timed out waiting for ready${errTail ? `\n${errTail}` : ""}`;
        // Mark lastFatal before kill so the exit handler does not emit a second
        // onFatal with a generic "exited on SIGTERM" (bootstrap already rejects).
        if (!this.lastFatal) this.lastFatal = message;
        // A host that never reaches ready cannot safely be reused. Terminate it
        // so a failed bootstrap does not leave an invisible background child.
        this.proc?.kill();
        reject(new Error(message));
      }, timeoutMs);
      const rejectReady = (e: Error) => {
        clearTimeout(timer);
        reject(e);
      };
      this.readyWaiters.push({
        resolve: (id) => {
          clearTimeout(timer);
          resolve(id);
        },
        reject: rejectReady,
      });
    });
  }

  private failReady(err: Error): void {
    const waiters = this.readyWaiters;
    this.readyWaiters = [];
    for (const w of waiters) w.reject(err);
  }

  private failAllRpc(err: Error): void {
    const waiters = [...this.rpcWaiters.entries()];
    this.rpcWaiters.clear();
    for (const [, w] of waiters) {
      clearTimeout(w.timer);
      w.reject(err);
    }
  }

  private consumeStderr(): string {
    const t = this.stderrBuf.trim();
    this.stderrBuf = "";
    return t;
  }

  private terminateFatal(
    message: string,
    proc: ChildProcessWithoutNullStreams | null = this.proc,
    generation = this.generation,
  ): void {
    if (!proc || this.proc !== proc || this.generation !== generation) return;
    if (this.lastFatal) return;
    this.lastFatal = message;
    this.onFatal?.(message);
    const error = new Error(message);
    this.failReady(error);
    this.failAllRpc(error);
    proc.kill();
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
