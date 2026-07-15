import { ALL_TRAFFIC, Sandbox as E2BSandbox } from "e2b";
import { Sandbox as VercelSandbox } from "@vercel/sandbox";
import type {
  CloudSandboxCreateOptions,
  CloudSandboxRecord,
  ProviderCredentials,
  SandboxProvider,
} from "../../shared/cloud";

const DEFAULT_TIMEOUT_MS = 10 * 60 * 1_000;

export class E2BSandboxProvider implements SandboxProvider {
  readonly id = "e2b" as const;
  #credentials: ProviderCredentials["e2b"] | undefined;
  #handles = new Map<string, E2BSandbox>();
  #timeouts = new Map<string, number>();

  async connectAccount(credentials: ProviderCredentials["e2b"]): Promise<void> {
    if (!credentials?.apiKey.trim()) throw new Error("E2B API key is required");
    this.#credentials = { apiKey: credentials.apiKey.trim() };
  }

  async test() {
    try {
      const paginator = E2BSandbox.list({ apiKey: this.#key(), limit: 1 });
      await paginator.nextItems();
      return { ok: true as const };
    } catch (error) {
      return { ok: false as const, error: message(error) };
    }
  }

  async create(options: CloudSandboxCreateOptions): Promise<CloudSandboxRecord> {
    const sandbox = await E2BSandbox.create({
      apiKey: this.#key(),
      secure: true,
      network: {
        allowPublicTraffic: false,
        ...(options.allowedDomains?.length
          ? { allowOut: options.allowedDomains, denyOut: [ALL_TRAFFIC] }
          : { denyOut: [ALL_TRAFFIC] }),
      },
      timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      lifecycle: { onTimeout: "pause", autoResume: true },
      metadata: {
        "vibe.workspace": options.workspaceId,
        "vibe.session": options.sessionId,
        "vibe.name": options.name,
      },
    });
    this.#handles.set(sandbox.sandboxId, sandbox);
    this.#timeouts.set(sandbox.sandboxId, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    return this.#record(sandbox, "running", undefined, options.name);
  }

  async get(id: string): Promise<CloudSandboxRecord | null> {
    try {
      const info = await E2BSandbox.getInfo(id, { apiKey: this.#key() });
      return this.#recordInfo(info);
    } catch (error) {
      if (/not found/i.test(message(error))) return null;
      throw error;
    }
  }

  async findByName(name: string): Promise<CloudSandboxRecord | null> {
    const paginator = E2BSandbox.list({
      apiKey: this.#key(),
      limit: 2,
      query: { metadata: { "vibe.name": name } },
    });
    const matches = await paginator.nextItems();
    const info = matches.find((item) => item.metadata["vibe.name"] === name);
    if (!info) return null;
    return this.#recordInfo(info, name);
  }

  async resume(id: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<CloudSandboxRecord | null> {
    this.#handles.delete(id);
    this.#timeouts.set(id, timeoutMs);
    try {
      const sandbox = await this.#handle(id);
      const info = await sandbox.getInfo();
      return this.#record(sandbox, info.state === "paused" ? "paused" : "running", info.startedAt.getTime());
    } catch (error) {
      if (/not found/i.test(message(error))) return null;
      throw error;
    }
  }

  async upload(id: string, remotePath: string, data: Uint8Array): Promise<void> {
    const bytes = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
    await (await this.#handle(id)).files.write(remotePath, bytes);
  }

  async download(id: string, remotePath: string): Promise<Uint8Array> {
    return (await this.#handle(id)).files.read(remotePath, { format: "bytes" });
  }

  async size(id: string, remotePath: string): Promise<number> {
    return (await this.#handle(id)).files.getInfo(remotePath).then((info) => info.size);
  }

  async start(id: string, command: string, args: string[], env?: Record<string, string>, options?: { privileged?: boolean }): Promise<void> {
    const line = [command, ...args].map(shellQuote).join(" ");
    await (await this.#handle(id)).commands.run(line, {
      envs: env,
      user: options?.privileged ? "root" : undefined,
      background: true,
      timeoutMs: 0,
    });
  }

  async suspend(id: string): Promise<void> {
    await (await this.#handle(id)).pause({ keepMemory: true });
  }

  async destroy(id: string): Promise<void> {
    await E2BSandbox.kill(id, { apiKey: this.#key() });
    this.#handles.delete(id);
    this.#timeouts.delete(id);
  }

  async domain(id: string, port: number) {
    const sandbox = await this.#handle(id);
    if (!sandbox.trafficAccessToken) throw new Error("E2B did not return a restricted-traffic access token");
    return {
      url: `https://${sandbox.getHost(port)}`,
      headers: { "e2b-traffic-access-token": sandbox.trafficAccessToken },
    };
  }

  observe(id: string, listener: (record: CloudSandboxRecord) => void): () => void {
    const timer = setInterval(() => void this.get(id).then((record) => record && listener(record)).catch(() => undefined), 5_000);
    timer.unref();
    return () => clearInterval(timer);
  }

  async #handle(id: string): Promise<E2BSandbox> {
    const cached = this.#handles.get(id);
    if (cached) return cached;
    const sandbox = await E2BSandbox.connect(id, {
      apiKey: this.#key(),
      timeoutMs: this.#timeouts.get(id) ?? DEFAULT_TIMEOUT_MS,
    });
    this.#handles.set(id, sandbox);
    return sandbox;
  }

  #recordInfo(
    info: Awaited<ReturnType<typeof E2BSandbox.getInfo>>,
    name = info.metadata["vibe.name"] || info.sandboxId,
  ): CloudSandboxRecord {
    return {
      provider: "e2b",
      id: info.sandboxId,
      name,
      status: info.state === "paused" ? "paused" : "running",
      createdAt: info.startedAt.getTime(),
      ...(info.sandboxDomain ? { domain: info.sandboxDomain } : {}),
    };
  }

  #record(sandbox: E2BSandbox, status: CloudSandboxRecord["status"], createdAt?: number, name = sandbox.sandboxId): CloudSandboxRecord {
    return {
      provider: "e2b",
      id: sandbox.sandboxId,
      name,
      status,
      ...(createdAt ? { createdAt } : {}),
      domain: sandbox.sandboxDomain,
    };
  }

  #key(): string {
    if (!this.#credentials) throw new Error("E2B is not connected");
    return this.#credentials.apiKey;
  }
}

export class VercelSandboxProvider implements SandboxProvider {
  readonly id = "vercel" as const;
  #credentials: ProviderCredentials["vercel"] | undefined;
  #handles = new Map<string, VercelSandbox>();

  async connectAccount(credentials: ProviderCredentials["vercel"]): Promise<void> {
    if (!credentials?.token.trim() || !credentials.teamId.trim() || !credentials.projectId.trim()) {
      throw new Error("Vercel token, team ID, and project ID are required");
    }
    this.#credentials = {
      token: credentials.token.trim(),
      teamId: credentials.teamId.trim(),
      projectId: credentials.projectId.trim(),
    };
  }

  async test() {
    try {
      const list = await VercelSandbox.list({ ...this.#auth(), limit: 1 });
      await list.toArray();
      return { ok: true as const };
    } catch (error) {
      return { ok: false as const, error: message(error) };
    }
  }

  async create(options: CloudSandboxCreateOptions): Promise<CloudSandboxRecord> {
    const name = normalizeName(options.name);
    const networkPolicy = options.allowedDomains?.length
      ? { allow: options.allowedDomains }
      : "deny-all" as const;
    const sandbox = await VercelSandbox.getOrCreate({
      ...this.#auth(),
      name,
      runtime: "node24",
      persistent: true,
      resume: true,
      timeout: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      resources: options.vcpus ? { vcpus: options.vcpus } : undefined,
      networkPolicy,
      ports: [8787],
      keepLastSnapshots: { count: 1, deleteEvicted: true },
      snapshotExpiration: 7 * 24 * 60 * 60 * 1_000,
      tags: { "vibe-workspace": options.workspaceId, "vibe-session": options.sessionId },
    });
    this.#handles.set(name, sandbox);
    return this.#record(sandbox);
  }

  async get(id: string): Promise<CloudSandboxRecord | null> {
    try {
      const sandbox = await this.#handle(id, true);
      return this.#record(sandbox);
    } catch (error) {
      if (/not.found|404/i.test(message(error))) return null;
      throw error;
    }
  }

  async findByName(name: string): Promise<CloudSandboxRecord | null> {
    try {
      const normalized = normalizeName(name);
      const sandbox = await this.#handle(normalized, false);
      return this.#record(sandbox);
    } catch (error) {
      if (/not.found|404/i.test(message(error))) return null;
      throw error;
    }
  }

  async resume(id: string, _timeoutMs?: number): Promise<CloudSandboxRecord | null> {
    this.#handles.delete(id);
    let existing: VercelSandbox;
    try { existing = await this.#handle(id, false); }
    catch (error) {
      if (/not.found|404/i.test(message(error))) return null;
      throw error;
    }
    const needsDaemonRestart = existing.status !== "running";
    if (!needsDaemonRestart) return this.#record(existing);
    this.#handles.delete(id);
    const resumed = await this.#handle(id, true);
    return { ...this.#record(resumed), needsDaemonRestart: true };
  }

  async upload(id: string, remotePath: string, data: Uint8Array): Promise<void> {
    await (await this.#handle(id)).writeFiles([{ path: remotePath, content: data }]);
  }

  async download(id: string, remotePath: string): Promise<Uint8Array> {
    const data = await (await this.#handle(id)).readFileToBuffer({ path: remotePath });
    if (!data) throw new Error(`Remote file not found: ${remotePath}`);
    return data;
  }

  async size(id: string, remotePath: string): Promise<number> {
    const command = await (await this.#handle(id)).runCommand({ cmd: "stat", args: ["-c", "%s", remotePath] });
    const value = Number((await command.stdout()).trim());
    if (!Number.isSafeInteger(value) || value < 0) throw new Error(`Could not determine remote file size: ${remotePath}`);
    return value;
  }

  async start(id: string, command: string, args: string[], env?: Record<string, string>, options?: { privileged?: boolean }): Promise<void> {
    await (await this.#handle(id)).runCommand({ cmd: command, args, env, detached: true, sudo: options?.privileged === true });
  }

  async suspend(id: string): Promise<void> {
    await (await this.#handle(id)).stop();
    this.#handles.delete(id);
  }

  async destroy(id: string): Promise<void> {
    await (await this.#handle(id, false)).delete();
    this.#handles.delete(id);
  }

  async domain(id: string, port: number) {
    return { url: (await this.#handle(id)).domain(port) };
  }

  observe(id: string, listener: (record: CloudSandboxRecord) => void): () => void {
    const timer = setInterval(() => void this.get(id).then((record) => record && listener(record)).catch(() => undefined), 5_000);
    timer.unref();
    return () => clearInterval(timer);
  }

  async #handle(name: string, resume = true): Promise<VercelSandbox> {
    const cached = this.#handles.get(name);
    if (cached) return cached;
    const sandbox = await VercelSandbox.get({ ...this.#auth(), name, resume });
    this.#handles.set(name, sandbox);
    return sandbox;
  }

  #record(sandbox: VercelSandbox): CloudSandboxRecord {
    const status = sandbox.status === "running" ? "running" : sandbox.status === "stopped" ? "stopped" : "unknown";
    return { provider: "vercel", id: sandbox.name, name: sandbox.name, status, createdAt: sandbox.createdAt.getTime() };
  }

  #auth() {
    if (!this.#credentials) throw new Error("Vercel is not connected");
    return this.#credentials;
  }
}

function normalizeName(value: string): string {
  const clean = value.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 63);
  return clean || `vibe-${Date.now()}`;
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'"'"'`)}'`;
}
