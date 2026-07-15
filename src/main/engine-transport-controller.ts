import type { EngineCommand } from "../shared/commands";
import type { HostRpcParams, RpcMethod } from "../shared/protocol";
import { estimateJsonUtf8Bytes } from "../shared/json-size";
import { EngineBridge, type EngineStartOptions } from "./engine-bridge";
import type { EngineTransport } from "./engine-transport";
import { RemoteEngineTransport } from "./remote-engine-transport";

export class EngineTransportController implements EngineTransport {
  readonly local = new EngineBridge();
  #active: EngineTransport = this.local;
  #remote: RemoteEngineTransport | null = null;
  #remoteActivationEvents: Array<{ event: unknown; bytes: number }> | null = null;
  #remoteActivationBytes = 0;

  onEvent: ((event: unknown) => void) | null = null;
  onFatal: ((message: string) => void) | null = null;
  onReady: ((sessionId: string) => void) | null = null;

  constructor() { this.#wire(this.local); }

  get isRunning(): boolean { return this.#active.isRunning || this.local.isRunning || this.#remote?.isRunning === true; }
  get isReady(): boolean { return this.#active.isReady; }
  get isRemote(): boolean { return this.#active !== this.local; }
  get lastLaunchDescription(): string { return this.isRemote ? "Cloud agent" : this.local.lastLaunchDescription; }
  get lastStderr(): string { return this.isRemote ? "" : this.local.lastStderr; }

  async start(options: EngineStartOptions): Promise<string> {
    // A project/session switch only detaches this desktop. The cloud owner,
    // its PTYs, and jobs continue until an explicit return or destroy action.
    if (this.#remote) await this.#remote.disposeForQuit();
    this.#remote = null;
    this.#remoteActivationEvents = null;
    this.#remoteActivationBytes = 0;
    this.#active = this.local;
    this.#wire(this.local);
    return this.local.start(options);
  }

  async switchToRemote(
    connection: { url: string; accessToken: string; headers?: Record<string, string> },
    options: EngineStartOptions,
    handoff: { preserveLocal?: boolean } = {},
  ): Promise<string> {
    if (this.#remote) {
      await this.#remote.disposeForQuit();
      this.#remote = null;
    }
    if (!handoff.preserveLocal && this.local.isRunning) await this.local.stop();
    const remote = new RemoteEngineTransport(connection);
    this.#remote = remote;
    this.#active = remote;
    this.#remoteActivationEvents = [];
    this.#remoteActivationBytes = 0;
    this.#wire(remote);
    try {
      return await remote.start(options);
    } catch (error) {
      await remote.disposeForQuit().catch(() => undefined);
      this.#remoteActivationEvents = null;
      this.#remoteActivationBytes = 0;
      if (this.#remote === remote) this.#remote = null;
      if (this.#active === remote) {
        this.#active = this.local;
        this.#wire(this.local);
      }
      throw error;
    }
  }

  async completeLocalHandoff(): Promise<void> {
    await this.local.detachForHandoff();
  }

  async completeRemoteHandoff(): Promise<void> {
    const remote = this.#remote;
    if (!remote) throw new Error("Cloud transport is unavailable for ownership detach");
    await remote.detachForHandoff();
    if (this.#remote === remote) this.#remote = null;
    this.#remoteActivationEvents = null;
    this.#remoteActivationBytes = 0;
    this.#active = this.local;
    this.#wire(this.local);
  }

  startProvisionalLocal(options: EngineStartOptions): Promise<string> {
    this.#wire(this.local);
    return this.local.start(options);
  }

  importPortableSession(cwd: string, archive: import("../shared/handoff").PortableSessionArchiveV1, revision: string, provisional = false): Promise<void> {
    return this.local.importPortableSession(cwd, archive, revision, provisional);
  }

  commitPortableImport(cwd: string, sessionId: string, generation: number): Promise<void> {
    return this.local.commitPortableImport(cwd, sessionId, generation);
  }

  abortPortableImport(cwd: string, sessionId: string, generation: number): Promise<void> {
    return this.local.abortPortableImport(cwd, sessionId, generation);
  }

  async recoverLostCloudOwnership(cwd: string, sessionId: string, provider: "e2b" | "vercel", generation: number): Promise<number> {
    const helper = new EngineBridge();
    try { return await helper.recoverLostCloudOwnership(cwd, sessionId, provider, generation); }
    finally { await helper.disposeForQuit().catch(() => undefined); }
  }

  async abortInterruptedLocalHandoff(
    cwd: string,
    sessionId: string,
    target: import("../shared/cloud").ExecutionTarget,
    expectedGeneration?: number,
  ): Promise<{ outcome: "aborted" | "already-committed"; generation: number }> {
    const helper = new EngineBridge();
    try { return await helper.abortInterruptedHandoff(cwd, sessionId, target, expectedGeneration); }
    finally { await helper.disposeForQuit().catch(() => undefined); }
  }

  async stop(): Promise<void> {
    await this.#active.stop();
    if (this.#active !== this.local) this.#remote = null;
    this.#remoteActivationEvents = null;
    this.#remoteActivationBytes = 0;
    this.#active = this.local;
    this.#wire(this.local);
  }

  async disposeForQuit(): Promise<void> {
    await Promise.allSettled([this.#active.disposeForQuit(), this.#active === this.local ? Promise.resolve() : this.local.detachForHandoff()]);
  }

  send(command: EngineCommand): void { this.#active.send(command); }
  async rpc(method: RpcMethod, params?: HostRpcParams): Promise<unknown> {
    const transport = this.#active;
    const value = await transport.rpc(method, params);
    if (method === "snapshot" && transport === this.#remote && this.#remoteActivationEvents) {
      // Renderer attach installs its own bounded hydration queue before asking
      // for this snapshot. Releasing here makes the snapshot authoritative and
      // lets every event observed during remote startup replay after hydration.
      const events = this.#remoteActivationEvents;
      this.#remoteActivationEvents = null;
      this.#remoteActivationBytes = 0;
      for (const { event } of events) this.onEvent?.(event);
    }
    return value;
  }
  listProjectsForIndex(): Promise<unknown> { return this.local.listProjectsForIndex(); }

  #wire(transport: EngineTransport): void {
    transport.onEvent = (event) => {
      if (!(this.#active === transport || transport === this.local && this.#active === this.local)) return;
      if (transport === this.#remote && this.#remoteActivationEvents) {
        // The remote protocol already bounds every frame. Bound this short
        // activation window as well, retaining the newest events; the snapshot
        // supplies durable history for anything older.
        const limit = 4 * 1024 * 1024;
        const bytes = estimateJsonUtf8Bytes(event, limit + 1);
        if (bytes > limit) return;
        while (this.#remoteActivationEvents.length >= 512 || this.#remoteActivationBytes + bytes > limit) {
          const removed = this.#remoteActivationEvents.shift();
          if (!removed) break;
          this.#remoteActivationBytes -= removed.bytes;
        }
        this.#remoteActivationEvents.push({ event, bytes });
        this.#remoteActivationBytes += bytes;
        return;
      }
      this.onEvent?.(event);
    };
    transport.onFatal = (message) => { if (this.#active === transport) this.onFatal?.(message); };
    transport.onReady = (sessionId) => { if (this.#active === transport || !this.#active.isReady) this.onReady?.(sessionId); };
  }
}
