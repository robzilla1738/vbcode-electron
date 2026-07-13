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
/** Hard ceiling after SIGKILL before we abandon waiting on a wedged OS process. */
const KILL_WAIT_MS = 1_000;
/** Finalize budget during app quit — must be well under the overall quit budget. */
const QUIT_FINALIZE_MS = 1_500;

export type BridgeEventHandler = (event: unknown) => void;
export type BridgeFatalHandler = (message: string) => void;
export type BridgeReadyHandler = (sessionId: string) => void;

export interface EngineBridgeOptions {
  resolveLaunch?: () => HostLaunch;
  environment?: () => NodeJS.ProcessEnv;
  readyTimeoutMs?: number;
  rpcTimeoutMs?: number;
  stopTimeoutMs?: number;
  quitFinalizeTimeoutMs?: number;
  killWaitMs?: number;
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

  /**
   * True while this bridge still owns a child that has not exited.
   * Uses exit/signal codes — NOT `proc.killed` — so a soft-killed host still
   * reports owned until reap completes (quit must never skip cleanup).
   */
  get isRunning(): boolean {
    return this.hasOwnedChild();
  }

  /** Host accepted bootstrap and can service RPC/send. */
  get isReady(): boolean {
    return this.didReady && this.hasOwnedChild() && !this.lastFatal;
  }

  private hasOwnedChild(): boolean {
    const proc = this.proc;
    if (!proc) return false;
    return proc.exitCode === null && proc.signalCode === null;
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
      if (this.hasOwnedChild()) await this.stopCurrent();
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
      this.didReady = false;
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
      this.didReady = false;
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

  /**
   * App-quit path: best-effort short finalize (only if ready), then always reap
   * the child with SIGTERM→SIGKILL. Never leave an orphan host.
   */
  disposeForQuit(): Promise<void> {
    return this.schedule(async () => {
      const finalizeMs = this.options.quitFinalizeTimeoutMs ?? QUIT_FINALIZE_MS;
      if (this.isReady) {
        try {
          await Promise.race([
            this.rpcUnlocked("finalize"),
            sleep(finalizeMs).then(() => {
              throw new Error("finalize timed out");
            }),
          ]);
        } catch {
          /* best-effort — stop still reaps */
        }
      }
      this.startRequest += 1;
      this.generation += 1;
      this.failReady(new Error("Engine host stopped"));
      this.failAllRpc(new Error("Engine host stopped"));
      await this.stopCurrent();
    });
  }

  private async stopCurrent(): Promise<void> {
    this.generation += 1;
    this.failReady(new Error("Engine host stopped"));
    this.failAllRpc(new Error("Engine host stopped"));
    const proc = this.proc;
    if (!proc) {
      this.didReady = false;
      return;
    }
    if (proc.exitCode !== null || proc.signalCode !== null) {
      this.proc = null;
      this.didReady = false;
      return;
    }

    // Graceful: ask host to exit, then escalate SIGTERM → SIGKILL.
    try {
      this.writeRaw(proc, { op: "shutdown" });
    } catch {
      /* stdin may already be closed */
    }

    const graceMs = this.options.stopTimeoutMs ?? STOP_TIMEOUT_MS;
    const killWait = this.options.killWaitMs ?? KILL_WAIT_MS;

    await this.waitForExit(proc, graceMs);

    if (proc.exitCode === null && proc.signalCode === null) {
      try {
        proc.kill("SIGTERM");
      } catch {
        /* ignore */
      }
      await this.waitForExit(proc, graceMs);
    }

    if (proc.exitCode === null && proc.signalCode === null) {
      try {
        proc.kill("SIGKILL");
      } catch {
        /* ignore */
      }
      await this.waitForExit(proc, killWait);
    }

    if (this.proc === proc) this.proc = null;
    this.didReady = false;
  }

  private waitForExit(proc: ChildProcessWithoutNullStreams, timeoutMs: number): Promise<void> {
    if (proc.exitCode !== null || proc.signalCode !== null) return Promise.resolve();
    return Promise.race([
      new Promise<void>((resolve) => {
        proc.once("exit", () => resolve());
      }),
      sleep(timeoutMs),
    ]);
  }

  private schedule<T>(work: () => Promise<T>): Promise<T> {
    const run = this.lifecycle.then(work);
    this.lifecycle = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  send(command: EngineCommand): void {
    if (!this.isReady) throw new Error("Engine host not ready");
    this.write({ op: "send", command });
  }

  async rpc(method: RpcMethod, params?: Record<string, unknown>): Promise<unknown> {
    if (!this.hasOwnedChild()) throw new Error("Engine host not running");
    if (!this.didReady) throw new Error("Engine host not ready");
    return this.rpcUnlocked(method, params);
  }

  /** RPC without the ready gate — used only for quit finalize after isReady check. */
  private rpcUnlocked(method: RpcMethod, params?: Record<string, unknown>): Promise<unknown> {
    if (!this.hasOwnedChild()) throw new Error("Engine host not running");
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
    const proc = this.proc;
    if (!proc?.stdin.writable) throw new Error("Engine host stdin closed");
    this.writeRaw(proc, msg);
  }

  private writeRaw(proc: ChildProcessWithoutNullStreams, msg: HostInbound): void {
    if (!proc.stdin.writable) throw new Error("Engine host stdin closed");
    const payload = encodeInbound(msg);
    // Respect backpressure: when write returns false, wait for drain before further
    // large writes would matter; for NDJSON control messages a single buffered
    // chunk is fine — Node retains the buffer until drain.
    proc.stdin.write(payload);
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
        // Reap the never-ready child so it cannot linger as an invisible process.
        void this.reapOwned(this.proc);
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

  /** Escalate kill without advancing generation (current host is still "current"). */
  private async reapOwned(proc: ChildProcessWithoutNullStreams | null): Promise<void> {
    if (!proc) return;
    if (proc.exitCode !== null || proc.signalCode !== null) {
      if (this.proc === proc) {
        this.proc = null;
        this.didReady = false;
      }
      return;
    }
    const graceMs = this.options.stopTimeoutMs ?? STOP_TIMEOUT_MS;
    const killWait = this.options.killWaitMs ?? KILL_WAIT_MS;
    try {
      proc.kill("SIGTERM");
    } catch {
      /* ignore */
    }
    await this.waitForExit(proc, graceMs);
    if (proc.exitCode === null && proc.signalCode === null) {
      try {
        proc.kill("SIGKILL");
      } catch {
        /* ignore */
      }
      await this.waitForExit(proc, killWait);
    }
    if (this.proc === proc) {
      this.proc = null;
      this.didReady = false;
    }
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
    // Escalate kill; keep ownership until exit so quit can still reap if needed.
    void this.reapOwned(proc);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
