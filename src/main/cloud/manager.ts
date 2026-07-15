import { createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdir, open, readFile, readdir, rename, unlink } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { app } from "electron";
import { isCloudSessionRemoteOwned } from "../../shared/cloud";
import type {
  CloudProviderId,
  CloudSessionCatalogEntry,
  CloudSessionStatus,
  CloudSettingsPublic,
  ProviderCredentials,
  SandboxProvider,
} from "../../shared/cloud";
import type { EngineSnapshot } from "../../shared/types";
import type { HandoffPreparation, PortableSessionArchiveV1 } from "../../shared/handoff";
import type { EngineTransportController } from "../engine-transport-controller";
import { CloudSessionCatalog } from "./catalog";
import { CloudCredentialStore } from "./credential-store";
import { E2BSandboxProvider, VercelSandboxProvider } from "./providers";
import {
  applyWorkspaceTransfer,
  assembleReturnTransfer,
  createWorkspaceTransfer,
  rollbackWorkspaceApplication,
  type RemoteWorkspaceSnapshotV1,
  type WorkspaceApplyResult,
} from "./workspace-transfer";

const CLOUD_PORT = 8787;
const MAX_READY_FILE_BYTES = 64 * 1024;
const MAX_RETURN_SNAPSHOT_BYTES = 256 * 1024 * 1024;
const DEFAULT_DOMAINS = [
  "registry.npmjs.org",
  "nodejs.org",
  "github.com",
  "objects.githubusercontent.com",
  "api.openai.com",
  "api.anthropic.com",
  "generativelanguage.googleapis.com",
];

interface HandoffRequest {
  cwd: string;
  provider: CloudProviderId;
  instruction?: string;
  additionalInclusions?: string[];
}

interface CloudSettingsFileV1 extends CloudSettingsPublic { schemaVersion: 1 }

export class CloudManager {
  readonly #catalog: CloudSessionCatalog;
  readonly #credentials: CloudCredentialStore;
  readonly #providers: Record<CloudProviderId, SandboxProvider>;
  readonly #settingsPath: string;
  #idleSessionId: string | null = null;
  #engineEventSequence = 0;
  #idleEventSequence = 0;
  #ownershipTransitionDepth = 0;
  #ownershipUnresolved = false;
  #idleWaiters = new Map<string, Set<() => void>>();
  #settingsMutationChain = Promise.resolve();

  onStatus: ((event: { sessionId?: string; status: CloudSessionStatus; message: string; progress?: number }) => void) | null = null;

  constructor(private readonly transport: EngineTransportController, userData = app.getPath("userData")) {
    this.#catalog = new CloudSessionCatalog(join(userData, "cloud", "sessions.json"));
    this.#credentials = new CloudCredentialStore(join(userData, "cloud", "credentials.enc.json"));
    this.#settingsPath = join(userData, "cloud", "settings.json");
    this.#providers = { e2b: new E2BSandboxProvider(), vercel: new VercelSandboxProvider() };
  }

  async settings(): Promise<CloudSettingsPublic> {
    const settings = await this.#readSettings();
    const readiness = await this.#credentials.readiness();
    return {
      ...settings,
      providers: {
        e2b: { ...settings.providers.e2b, configured: readiness.e2b },
        vercel: { ...settings.providers.vercel, configured: readiness.vercel },
      },
    };
  }

  async updateSettings(patch: Partial<Pick<CloudSettingsPublic, "experimentalEnabled" | "lastProvider" | "autoPauseMinutes" | "deleteOnReturn" | "allowedDomains" | "additionalExclusions">>): Promise<CloudSettingsPublic> {
    await this.#mutateSettings((current) => ({ ...current, ...patch, schemaVersion: 1 }));
    return this.settings();
  }

  async connect<P extends CloudProviderId>(provider: P, credentials: NonNullable<ProviderCredentials[P]>) {
    if (!this.#credentials.isAvailable()) throw new Error("Cloud setup requires OS-protected credential storage");
    await this.#providers[provider].connectAccount(credentials);
    const result = await this.#providers[provider].test();
    if (!result.ok) throw new Error(result.error);
    await this.#credentials.set(provider, credentials);
    await this.#mutateSettings((settings) => {
      settings.providers[provider] = { configured: true, lastTest: Date.now(), ...(result.account ? { account: result.account } : {}) };
      settings.lastProvider = provider;
      return settings;
    });
    return this.settings();
  }

  async disconnect(provider: CloudProviderId): Promise<CloudSettingsPublic> {
    const sessions = (await this.#catalog.list()).filter((entry) => entry.provider === provider);
    if (sessions.length) {
      throw new Error(`Return or delete all ${provider === "e2b" ? "E2B" : "Vercel"} cloud sessions before removing these credentials`);
    }
    await this.#credentials.remove(provider);
    await this.#mutateSettings((settings) => {
      settings.providers[provider] = { configured: false };
      return settings;
    });
    return this.settings();
  }

  async test(provider: CloudProviderId) {
    await this.#loadProvider(provider);
    const result = await this.#providers[provider].test();
    await this.#mutateSettings((settings) => {
      settings.providers[provider] = result.ok
        ? { configured: true, lastTest: Date.now(), ...(result.account ? { account: result.account } : {}) }
        : { configured: true, lastTest: Date.now(), error: result.error };
      return settings;
    });
    return result;
  }

  async listSessions(): Promise<CloudSessionCatalogEntry[]> {
    await this.#recoverInterruptedOutboundHandoffs();
    const sessions = await this.#catalog.list();
    this.#ownershipUnresolved = sessions.some((entry) =>
      entry.status === "handoff-interrupted" && entry.handoffTransition !== undefined);
    return sessions;
  }

  get ownershipTransitioning(): boolean { return this.#ownershipTransitionDepth > 0 || this.#ownershipUnresolved; }
  get ownershipTransitionActive(): boolean { return this.#ownershipTransitionDepth > 0; }

  async saveCredentialBinding(input: { id?: string; label: string; kind: "environment" | "file" | "brokered"; value: string }): Promise<CloudSettingsPublic> {
    if (!this.#credentials.isAvailable()) throw new Error("Cloud credential bindings require OS-protected storage");
    const label = input.label.trim();
    if (!label || !input.value) throw new Error("Credential label and value are required");
    if (input.kind === "environment" && !/^[A-Za-z_][A-Za-z0-9_]*$/.test(label)) throw new Error("Environment binding label must be an environment variable name");
    const id = input.id?.trim() || randomUUID();
    await this.#credentials.setBinding(id, input.value);
    await this.#mutateSettings((settings) => {
      settings.credentialBindings = [...settings.credentialBindings.filter((item) => item.id !== id), { id, label, kind: input.kind, ready: true }];
      return settings;
    });
    return this.settings();
  }

  async removeCredentialBinding(id: string): Promise<CloudSettingsPublic> {
    await this.#credentials.removeBinding(id);
    await this.#mutateSettings((settings) => {
      settings.credentialBindings = settings.credentialBindings.filter((item) => item.id !== id);
      return settings;
    });
    return this.settings();
  }

  observeEngineEvent(event: unknown): void {
    if (!event || typeof event !== "object" || !("type" in event)) return;
    const typed = event as { type?: unknown; sessionId?: unknown };
    const type = typed.type;
    const sessionId = typeof typed.sessionId === "string" ? typed.sessionId : null;
    if (sessionId) this.#engineEventSequence += 1;
    if (type === "external-capability-pending" && sessionId) {
      const request = (event as { request?: { integration?: unknown; toolName?: unknown } }).request;
      const label = typeof request?.integration === "string" ? request.integration : "a local integration";
      void this.#catalog.patch(sessionId, {
        status: "needs-local",
        error: `Needs your Mac for ${label}${typeof request?.toolName === "string" ? ` · ${request.toolName}` : ""}`,
      }).then(() => this.#emit(sessionId, "needs-local", `Needs your Mac for ${label}`)).catch(() => undefined);
      return;
    }
    if (type === "external-capability-resolved" && sessionId) {
      void this.#catalog.patch(sessionId, { status: "running", error: undefined })
        .then(() => this.#emit(sessionId, "running", "Cloud session resumed after local capability resolution"))
        .catch(() => undefined);
      return;
    }
    if (type === "engine-idle") {
      if (!sessionId) return;
      this.#idleSessionId = sessionId;
      this.#idleEventSequence = this.#engineEventSequence;
      for (const resolve of this.#idleWaiters.get(sessionId) ?? []) resolve();
      this.#idleWaiters.delete(sessionId);
      return;
    }
    if (type === "user-message" || type === "assistant-text-delta" || type === "tool-call-started" || type === "reasoning-delta") {
      if (!sessionId || this.#idleSessionId === sessionId) this.#idleSessionId = null;
    }
  }

  handoffToCloud(request: HandoffRequest): Promise<CloudSessionCatalogEntry> {
    return this.#withOwnershipTransition(() => this.#handoffToCloud(request));
  }

  async #handoffToCloud(request: HandoffRequest): Promise<CloudSessionCatalogEntry> {
    const settings = await this.settings();
    if (!settings.experimentalEnabled) throw new Error("Cloud sessions are still disabled in Settings");
    if (!this.#credentials.isAvailable()) throw new Error("Cloud handoff requires OS-protected credential storage");
    await this.#loadProvider(request.provider);
    const provider = this.#providers[request.provider];
    const revision = await engineRevision();
    const eventSequence = this.#engineEventSequence;
    const snapshot = await this.transport.local.rpc("snapshot") as EngineSnapshot;
    await this.#waitForEngineIdle(snapshot, eventSequence);
    const prior = await this.#catalog.get(snapshot.sessionId);
    if (prior) {
      const action = isCloudSessionRemoteOwned(prior.status) ? "reconnect or resume it locally" : "delete the retained cloud copy";
      throw new Error(`This session already has a cloud record; ${action} before starting another handoff`);
    }
    let preparation: HandoffPreparation | undefined;
    let sandboxId: string | undefined;
    let accessToken: string | undefined;
    let catalogPersisted = false;
    let ownershipCommitted = false;
    let commitAttempted = false;
    try {
      this.#emit(snapshot.sessionId, "preparing", "Waiting for a safe engine boundary", 0.05);
      await this.#catalog.put({
        sessionId: snapshot.sessionId,
        workspaceId: createHash("sha256").update(resolve(request.cwd)).digest("hex").slice(0, 24),
        sourceRoot: request.cwd,
        provider: request.provider,
        sandboxId: "",
        sandboxName: "",
        ownershipGeneration: 0,
        status: "preparing",
        baseFingerprint: "",
        handoffTransition: {
          direction: "local-to-cloud",
          target: { kind: "cloud", provider: request.provider },
          phase: "intent",
          startedAt: Date.now(),
        },
        updatedAt: Date.now(),
      });
      catalogPersisted = true;
      preparation = await this.transport.local.rpc("prepareHandoff", {
        target: { kind: "cloud", provider: request.provider },
      }) as HandoffPreparation;
      await this.#catalog.patch(snapshot.sessionId, {
        ownershipGeneration: preparation.ownershipGeneration,
        handoffTransition: {
          direction: "local-to-cloud",
          target: { kind: "cloud", provider: request.provider },
          phase: "prepared",
          nonce: preparation.nonce,
          ownershipGeneration: preparation.ownershipGeneration,
          startedAt: Date.now(),
        },
      });
      const engine = await this.transport.local.rpc("exportPortableSession", {
        engineRevision: revision,
        ownershipGeneration: preparation.ownershipGeneration,
      }) as PortableSessionArchiveV1;
      if (engine.sessionId !== snapshot.sessionId || resolve(engine.sourceRoot) !== resolve(request.cwd)) {
        throw new Error("The active engine session does not belong to the selected workspace");
      }
      this.#emit(snapshot.sessionId, "transferring", "Building a verified workspace package", 0.18);
      const transfer = await createWorkspaceTransfer({
        cwd: request.cwd,
        sessionId: snapshot.sessionId,
        ownershipGeneration: preparation.ownershipGeneration,
        engineRevision: revision,
        engine,
        portableCapabilities: ["git", "terminal", "jobs", "skills", "plugins", "hooks", "http-mcp", "portable-stdio-mcp"],
        relayOnlyCapabilities: ["macos-apps", "local-browser", "ollama", "lm-studio", "local-mcp"],
        additionalExclusions: settings.additionalExclusions,
      });
      const runtime = await findRuntimeArtifact(revision);
      const sandboxName = `vibe-${transfer.manifest.workspaceId}-${snapshot.sessionId.slice(-8)}`;
      await this.#catalog.patch(snapshot.sessionId, { sandboxName });
      const sandbox = await provider.findByName(sandboxName) ?? await provider.create({
        name: sandboxName,
        workspaceId: transfer.manifest.workspaceId,
        sessionId: snapshot.sessionId,
        timeoutMs: settings.autoPauseMinutes * 60 * 1_000,
        allowedDomains: [...new Set([...DEFAULT_DOMAINS, ...settings.allowedDomains])],
      });
      sandboxId = sandbox.id;
      await this.#catalog.patch(snapshot.sessionId, { sandboxId: sandbox.id, sandboxName: sandbox.name });
      const base = request.provider === "e2b" ? "/home/user/vibe" : "/vercel/sandbox/vibe";
      this.#emit(snapshot.sessionId, "transferring", `Uploading to ${request.provider === "e2b" ? "E2B" : "Vercel"}`, 0.38);
      await provider.upload(sandbox.id, `${base}/runtime.tar.gz`, runtime.data);
      await provider.upload(sandbox.id, `${base}/handoff.json`, Buffer.from(JSON.stringify(transfer)));
      accessToken = randomBytes(36).toString("base64url");
      await this.#credentials.setSessionSecret(snapshot.sessionId, accessToken);
      const script = [
        `set -eu`,
        `mkdir -p '${base}/runtime'`,
        `tar -xzf '${base}/runtime.tar.gz' -C '${base}/runtime'`,
        `cd '${base}/runtime'`,
        `sh install-runtime.sh`,
        `node vibe-cloud-bootstrap.mjs '${base}/handoff.json' '${base}/project' '${revision}'`,
        `printf '%s' '{"ok":true}' > '${base}/ready.json'`,
        `exec sh start.sh`,
      ].join("\n");
      this.#emit(snapshot.sessionId, "starting", "Starting the cloud engine", 0.58);
      await provider.start(sandbox.id, "sh", ["-lc", script], {
        ...await this.#boundEnvironment(settings),
        VIBE_CLOUD_ACCESS_TOKEN: accessToken,
        VIBE_CLOUD_PROVIDER: request.provider,
        VIBE_WORKSPACE_ROOT: `${base}/project`,
        VIBE_CLOUD_AGENT_PORT: String(CLOUD_PORT),
        VIBE_STATE_DIR: `${base}/state`,
      }, { privileged: true });
      await waitForRemoteFile(provider, sandbox.id, `${base}/ready.json`, 120_000, MAX_READY_FILE_BYTES);
      const endpoint = await provider.domain(sandbox.id, CLOUD_PORT);
      await waitForCloudAgent(endpoint.url, accessToken, endpoint.headers);
      const url = endpoint.url.replace(/^http:/, "ws:").replace(/^https:/, "wss:");
      this.#emit(snapshot.sessionId, "starting", "Restoring the same session in cloud", 0.78);
      await this.transport.switchToRemote(
        { url, accessToken, ...(endpoint.headers ? { headers: endpoint.headers } : {}) },
        { cwd: `${base}/project`, resume: snapshot.sessionId },
        { preserveLocal: true },
      );
      const entry: CloudSessionCatalogEntry = {
        sessionId: snapshot.sessionId,
        workspaceId: transfer.manifest.workspaceId,
        sourceRoot: request.cwd,
        provider: request.provider,
        sandboxId: sandbox.id,
        sandboxName: sandbox.name,
        ownershipGeneration: preparation.ownershipGeneration,
        status: "starting",
        baseFingerprint: transfer.manifest.sourceRootFingerprint,
        baseHead: transfer.manifest.git.head,
        exclusionRules: transfer.manifest.exclusionRules,
        excludedPaths: transfer.manifest.excludedPaths,
        remoteUrl: url,
        handoffTransition: {
          direction: "local-to-cloud",
          target: { kind: "cloud", provider: request.provider },
          phase: "prepared",
          nonce: preparation.nonce,
          ownershipGeneration: preparation.ownershipGeneration,
          startedAt: Date.now(),
        },
        updatedAt: Date.now(),
      };
      // Persist the recovery pointer before crossing the commit boundary. If
      // the app exits after this write, startup reconnects to the provisional
      // cloud owner while the local ownership record remains fail-closed.
      await this.#catalog.put(entry);
      commitAttempted = true;
      await this.transport.local.rpc("commitHandoff", {
        cwd: request.cwd,
        sessionId: snapshot.sessionId,
        nonce: preparation.nonce,
      });
      ownershipCommitted = true;
      await this.transport.completeLocalHandoff();
      if (request.instruction?.trim()) {
        this.transport.send({ type: "submit-prompt", text: request.instruction.trim() });
      }
      const running = await this.#catalog.patch(snapshot.sessionId, { status: "running", error: undefined, handoffTransition: undefined });
      this.#emit(snapshot.sessionId, "running", "Cloud session is ready", 1);
      return running;
    } catch (error) {
      if (ownershipCommitted) {
        // The cloud side is authoritative now. Never destroy it or roll the
        // generation back because a late UI/catalog operation failed.
        await this.transport.completeLocalHandoff().catch(() => undefined);
        if (catalogPersisted) {
          await this.#catalog.patch(snapshot.sessionId, { status: "recoverable-error", error: message(error) }).catch(() => undefined);
        }
      } else if (!commitAttempted) {
        let preparationAborted = !preparation;
        if (preparation) {
          try {
            await this.transport.local.rpc("abortHandoff", {
              cwd: request.cwd,
              sessionId: snapshot.sessionId,
              nonce: preparation.nonce,
            });
            preparationAborted = true;
          } catch {
            try {
              const recovery = await this.transport.abortInterruptedLocalHandoff(
                request.cwd,
                snapshot.sessionId,
                { kind: "cloud", provider: request.provider },
                preparation.ownershipGeneration,
              );
              preparationAborted = recovery.outcome === "aborted";
            } catch { /* preserve both sides for startup recovery */ }
          }
        }
        if (preparationAborted) {
          if (this.transport.isRemote) await this.transport.stop().catch(() => undefined);
          let sandboxDestroyed = !sandboxId;
          if (sandboxId) {
            try { await provider.destroy(sandboxId); sandboxDestroyed = true; }
            catch (cleanupError) {
              if (catalogPersisted) {
                await this.#catalog.patch(snapshot.sessionId, {
                  status: "cleanup-pending",
                  handoffTransition: undefined,
                  error: `Provisional sandbox cleanup needs retry: ${message(cleanupError)}`,
                }).catch(() => undefined);
              }
            }
          }
          if (sandboxDestroyed) {
            if (catalogPersisted) await this.#catalog.remove(snapshot.sessionId).catch(() => undefined);
            if (accessToken) await this.#credentials.removeSessionSecret(snapshot.sessionId).catch(() => undefined);
          }
        } else if (catalogPersisted) {
          this.#ownershipUnresolved = true;
          await this.#catalog.patch(snapshot.sessionId, {
            status: "handoff-interrupted",
            error: `Local ownership preparation needs recovery: ${message(error)}`,
          }).catch(() => undefined);
        }
      } else {
        // The commit request crossed the ownership boundary but its response
        // was lost. Preserve both sides and let startup recovery determine the
        // authoritative owner instead of destroying a possibly committed cloud owner.
        if (catalogPersisted) {
          await this.#catalog.patch(snapshot.sessionId, {
            status: "handoff-interrupted",
            error: `Cloud ownership commit needs recovery: ${message(error)}`,
          }).catch(() => undefined);
        }
        this.#ownershipUnresolved = true;
        await this.#recoverInterruptedOutboundHandoffs(true).catch(() => undefined);
        const unresolved = await this.#catalog.get(snapshot.sessionId).catch(() => null);
        this.#ownershipUnresolved = unresolved?.handoffTransition !== undefined;
        if (!unresolved && this.transport.isRemote) await this.transport.stop().catch(() => undefined);
      }
      this.#emit(snapshot.sessionId, "recoverable-error", message(error));
      throw error;
    }
  }

  reconnect(sessionId: string): Promise<string> {
    return this.#withOwnershipTransition(() => this.#reconnect(sessionId), true);
  }

  async #reconnect(sessionId: string): Promise<string> {
    await this.#recoverInterruptedOutboundHandoffs(true);
    const entry = await this.#catalog.get(sessionId);
    if (!entry) throw new Error("Cloud session is not in this desktop's catalog");
    const token = await this.#credentials.getSessionSecret(sessionId);
    if (!token) throw new Error("Cloud session access token is unavailable");
    await this.#loadProvider(entry.provider);
    const provider = this.#providers[entry.provider];
    const settings = await this.#readSettings();
    const sandbox = await provider.resume(entry.sandboxId, settings.autoPauseMinutes * 60 * 1_000);
    if (!sandbox) {
      const error = "Cloud sandbox no longer exists. Recover the last local base from Settings → Cloud.";
      await this.#catalog.patch(sessionId, { status: "lost", error });
      this.#emit(sessionId, "lost", error);
      throw new Error(error);
    }
    const base = entry.provider === "e2b" ? "/home/user/vibe" : "/vercel/sandbox/vibe";
    if (sandbox.needsDaemonRestart) {
      await provider.start(entry.sandboxId, "sh", ["-lc", `cd '${base}/runtime' && exec sh start.sh`], {
        ...await this.#boundEnvironment(settings),
        VIBE_CLOUD_ACCESS_TOKEN: token,
        VIBE_CLOUD_PROVIDER: entry.provider,
        VIBE_WORKSPACE_ROOT: `${base}/project`,
        VIBE_CLOUD_AGENT_PORT: String(CLOUD_PORT),
        VIBE_STATE_DIR: `${base}/state`,
      }, { privileged: true });
    }
    const endpoint = await provider.domain(entry.sandboxId, CLOUD_PORT);
    if (sandbox.needsDaemonRestart) {
      await waitForCloudAgent(endpoint.url, token, endpoint.headers);
    }
    const url = endpoint.url.replace(/^http:/, "ws:").replace(/^https:/, "wss:");
    const id = await this.transport.switchToRemote(
      { url, accessToken: token, ...(endpoint.headers ? { headers: endpoint.headers } : {}) },
      { cwd: `${base}/project`, resume: sessionId },
      { preserveLocal: entry.handoffTransition?.direction === "cloud-to-local" },
    );
    if (entry.handoffTransition?.direction === "cloud-to-local") {
      const recovered = await this.#recoverInterruptedReturn(entry, id);
      this.#ownershipUnresolved = false;
      return recovered;
    }
    await this.#catalog.patch(sessionId, { remoteUrl: url });
    await this.#catalog.patch(sessionId, { status: "running" });
    return id;
  }

  resumeLocally(sessionId: string, keepCloudCopy = false): Promise<{ sessionId: string; cwd: string; divergent: boolean; recoveryPath?: string }> {
    return this.#withOwnershipTransition(() => this.#resumeLocally(sessionId, keepCloudCopy));
  }

  async #resumeLocally(sessionId: string, keepCloudCopy = false): Promise<{ sessionId: string; cwd: string; divergent: boolean; recoveryPath?: string }> {
    const entry = await this.#catalog.get(sessionId);
    if (!entry) throw new Error("Cloud session is not in this desktop's catalog");
    const settings = await this.#readSettings();
    const preserveCloudCopy = keepCloudCopy || !settings.deleteOnReturn;
    if (!this.transport.isRemote || !this.transport.isReady) await this.#reconnect(sessionId);
    await this.#loadProvider(entry.provider);
    const provider = this.#providers[entry.provider];
    const revision = await engineRevision();
    let preparation: HandoffPreparation | undefined;
    let provisionalLocal = false;
    let portableImported = false;
    let remoteOwnershipCommitted = false;
    let remoteCommitAttempted = false;
    let localImportPending = false;
    let applied: WorkspaceApplyResult | undefined;
    let cwd = entry.sourceRoot;
    let postCommitWarning: string | undefined;
    try {
      this.#emit(sessionId, "syncing-back", "Waiting for cloud engine-idle", 0.05);
      const eventSequence = this.#engineEventSequence;
      const snapshot = await this.transport.rpc("snapshot") as EngineSnapshot;
      await this.#waitForEngineIdle(snapshot, eventSequence);
      await this.#catalog.patch(sessionId, {
        status: "syncing-back",
        handoffTransition: {
          direction: "cloud-to-local",
          target: { kind: "local" },
          phase: "intent",
          startedAt: Date.now(),
        },
      });
      preparation = await this.transport.rpc("prepareHandoff", {
        target: { kind: "local" },
        expectedGeneration: entry.ownershipGeneration,
      }) as HandoffPreparation;
      await this.#catalog.patch(sessionId, {
        status: "syncing-back",
        handoffTransition: {
          direction: "cloud-to-local",
          target: { kind: "local" },
          phase: "prepared",
          nonce: preparation.nonce,
          ownershipGeneration: preparation.ownershipGeneration,
          startedAt: Date.now(),
        },
      });
      const engine = await this.transport.rpc("exportPortableSession", {
        engineRevision: revision,
        ownershipGeneration: preparation.ownershipGeneration,
      }) as PortableSessionArchiveV1;
      const base = entry.provider === "e2b" ? "/home/user/vibe" : "/vercel/sandbox/vibe";
      if (
        engine.sessionId !== sessionId
        || engine.ownershipGeneration !== preparation.ownershipGeneration
        || engine.executionTarget.kind !== "local"
        || engine.engineRevision !== revision
        || resolve(engine.sourceRoot) !== resolve(`${base}/project`)
      ) {
        throw new Error("The cloud engine returned portable state for a different session, generation, target, root, or revision");
      }
      const output = `${base}/return-${preparation.ownershipGeneration}.json`;
      this.#emit(sessionId, "syncing-back", "Packaging cloud workspace changes", 0.22);
      await provider.start(entry.sandboxId, "sh", ["-lc", `cd '${base}/runtime' && node vibe-cloud-export.mjs '${base}/project' '${base}/handoff.json' '${output}'`]);
      const data = await waitForRemoteFile(provider, entry.sandboxId, output, 120_000, MAX_RETURN_SNAPSHOT_BYTES);
      const remote = JSON.parse(Buffer.from(data).toString("utf8")) as RemoteWorkspaceSnapshotV1;
      const transfer = assembleReturnTransfer({
        snapshot: remote,
        engine,
        workspaceId: entry.workspaceId,
        sessionId,
        ownershipGeneration: preparation.ownershipGeneration,
        engineRevision: revision,
        sourceRoot: entry.sourceRoot,
        baseFingerprint: entry.baseFingerprint,
        exclusionRules: entry.exclusionRules,
        excludedPaths: entry.excludedPaths,
      });
      this.#emit(sessionId, "syncing-back", "Verifying and staging local return", 0.48);
      applied = await applyWorkspaceTransfer(
        entry.sourceRoot,
        transfer,
        [...(entry.exclusionRules ?? []), ...settings.additionalExclusions],
        async (preparedApply) => {
          const preparedCwd = preparedApply.kind === "diverged" ? preparedApply.worktreePath : entry.sourceRoot;
          await this.#catalog.patch(sessionId, {
            handoffTransition: {
              direction: "cloud-to-local",
              target: { kind: "local" },
              phase: "prepared",
              nonce: preparation!.nonce,
              ownershipGeneration: preparation!.ownershipGeneration,
              localCwd: preparedCwd,
              applied: {
                kind: preparedApply.kind,
                path: preparedApply.kind === "applied" ? preparedApply.recoveryPath : preparedApply.worktreePath,
              },
              startedAt: Date.now(),
            },
          });
        },
      );
      cwd = applied.kind === "diverged" ? applied.worktreePath : entry.sourceRoot;
      await this.#catalog.patch(sessionId, {
        handoffTransition: {
          direction: "cloud-to-local",
          target: { kind: "local" },
          phase: "prepared",
          nonce: preparation.nonce,
          ownershipGeneration: preparation.ownershipGeneration,
          localCwd: cwd,
          portableImported: true,
          applied: { kind: applied.kind, path: applied.kind === "applied" ? applied.recoveryPath : applied.worktreePath },
          startedAt: Date.now(),
        },
      });
      await this.transport.importPortableSession(cwd, engine, revision, true);
      portableImported = true;
      await this.#catalog.patch(sessionId, {
        handoffTransition: {
          direction: "cloud-to-local",
          target: { kind: "local" },
          phase: "committing",
          nonce: preparation.nonce,
          ownershipGeneration: preparation.ownershipGeneration,
          localCwd: cwd,
          portableImported: true,
          applied: { kind: applied.kind, path: applied.kind === "applied" ? applied.recoveryPath : applied.worktreePath },
          startedAt: Date.now(),
        },
      });
      await this.transport.startProvisionalLocal({ cwd, resume: sessionId });
      provisionalLocal = true;
      remoteCommitAttempted = true;
      await this.transport.rpc("commitHandoff", {
        cwd: `${base}/project`,
        sessionId,
        nonce: preparation.nonce,
      });
      remoteOwnershipCommitted = true;
      try {
        await this.transport.commitPortableImport(cwd, sessionId, preparation.ownershipGeneration);
      } catch (error) {
        localImportPending = true;
        postCommitWarning = `Local recovery backup cleanup is pending: ${message(error)}`;
      }
      portableImported = false;
      await this.transport.completeRemoteHandoff();
      provisionalLocal = false;
    } catch (error) {
      if (remoteOwnershipCommitted) {
        postCommitWarning = `Cloud ownership returned locally, but final detach needs recovery: ${message(error)}`;
        await this.transport.completeRemoteHandoff().catch(() => undefined);
        provisionalLocal = false;
      } else if (remoteCommitAttempted) {
        // The commit request may have won even though its response was lost.
        // Preserve the journaled workspace, portable import, and both engines;
        // reconnect recovery resolves the authoritative generation first.
        this.#ownershipUnresolved = true;
        await this.#catalog.patch(sessionId, {
          status: "handoff-interrupted",
          error: `Local ownership commit needs recovery: ${message(error)}`,
        }).catch(() => undefined);
        this.#emit(sessionId, "recoverable-error", message(error));
        throw error;
      } else {
        if (provisionalLocal) await this.transport.local.detachForHandoff().catch(() => undefined);
        if (portableImported && preparation) {
          await this.transport.abortPortableImport(cwd, sessionId, preparation.ownershipGeneration).catch(() => undefined);
        }
        if (applied) await rollbackWorkspaceApplication(entry.sourceRoot, applied).catch(() => undefined);
      }
      let remoteAbortConfirmed = preparation === undefined;
      if (!remoteOwnershipCommitted && !remoteCommitAttempted && preparation && this.transport.isRemote) {
        try {
          await this.transport.rpc("abortHandoff", {
            sessionId,
            nonce: preparation.nonce,
          });
          remoteAbortConfirmed = true;
        } catch (abortError) {
          this.#ownershipUnresolved = true;
          await this.#catalog.patch(sessionId, {
            status: "handoff-interrupted",
            error: `Return rollback needs ownership recovery: ${message(abortError)}`,
          }).catch(() => undefined);
          this.#emit(sessionId, "recoverable-error", "Return ownership needs recovery before continuing");
          throw error;
        }
      }
      if (!remoteOwnershipCommitted && !remoteCommitAttempted) {
        if (preparation && !remoteAbortConfirmed) {
          this.#ownershipUnresolved = true;
          await this.#catalog.patch(sessionId, {
            status: "handoff-interrupted",
            error: "Return rollback could not prove that remote ownership was aborted.",
          }).catch(() => undefined);
          throw error;
        }
        await this.#catalog.patch(sessionId, {
          status: "running",
          handoffTransition: undefined,
          error: `Return was rolled back safely: ${message(error)}`,
        }).catch(() => undefined);
        this.#emit(sessionId, "recoverable-error", message(error));
        throw error;
      }
    }
    if (!applied || !preparation) throw new Error("Cloud return completed without a verified local workspace");
    if (localImportPending) {
      try { await provider.suspend(entry.sandboxId); }
      catch (error) { postCommitWarning = `${postCommitWarning ?? "Local import cleanup is pending"}; cloud suspend also failed: ${message(error)}`; }
      await this.#catalog.patch(sessionId, {
        status: "cleanup-pending",
        ownershipGeneration: preparation.ownershipGeneration,
        localRecoveryCwd: cwd,
        localImportPending: true,
        error: postCommitWarning,
        handoffTransition: undefined,
      });
    } else try {
      if (preserveCloudCopy) {
        await provider.suspend(entry.sandboxId);
        await this.#catalog.patch(sessionId, {
          status: "suspended",
          ownershipGeneration: preparation.ownershipGeneration,
          localRecoveryCwd: cwd,
          localImportPending: false,
          handoffTransition: undefined,
        });
      } else {
        await provider.destroy(entry.sandboxId);
        await this.#credentials.removeSessionSecret(sessionId);
        await this.#catalog.remove(sessionId);
      }
    } catch (error) {
      postCommitWarning = `Resumed locally; cloud cleanup needs attention: ${message(error)}`;
      await this.#catalog.patch(sessionId, {
        status: "cleanup-pending",
        ownershipGeneration: preparation.ownershipGeneration,
        localRecoveryCwd: cwd,
        localImportPending: false,
        error: message(error),
        handoffTransition: undefined,
      }).catch(() => undefined);
    }
    const resumedMessage = applied.kind === "diverged" ? "Resumed locally in a safe review worktree" : "Resumed locally";
    this.#emit(sessionId, "running", postCommitWarning ? `${resumedMessage}. ${postCommitWarning}` : resumedMessage, 1);
    return {
      sessionId,
      cwd,
      divergent: applied.kind === "diverged",
      ...(applied.kind === "applied" ? { recoveryPath: applied.recoveryPath } : {}),
    };
  }

  async deleteCloudCopy(sessionId: string): Promise<void> {
    const entry = await this.#catalog.get(sessionId);
    if (!entry) return;
    if (entry.status === "lost") throw new Error("Recover the last local base before clearing this missing sandbox record");
    if (entry.handoffTransition) {
      throw new Error("Resolve the interrupted handoff before deleting its cloud copy");
    }
    if (entry.status !== "suspended" && entry.status !== "cleanup-pending") {
      throw new Error("Resume this cloud session locally before deleting its cloud copy");
    }
    if (entry.localImportPending) {
      await this.transport.commitPortableImport(
        entry.localRecoveryCwd ?? entry.sourceRoot,
        sessionId,
        entry.ownershipGeneration,
      );
      await this.#catalog.patch(sessionId, { localImportPending: false, error: undefined });
    }
    await this.#loadProvider(entry.provider);
    try {
      await this.#providers[entry.provider].destroy(entry.sandboxId);
    } catch (error) {
      if (!/not.found|404|no longer exists/i.test(message(error))) throw error;
    }
    await this.#credentials.removeSessionSecret(sessionId);
    await this.#catalog.remove(sessionId);
  }

  async recoverLostSession(sessionId: string): Promise<{ sessionId: string; cwd: string }> {
    const entry = await this.#catalog.get(sessionId);
    if (entry?.status !== "lost") throw new Error("This session does not have a provider-confirmed missing sandbox");
    await this.transport.recoverLostCloudOwnership(
      entry.sourceRoot,
      sessionId,
      entry.provider,
      entry.ownershipGeneration,
    );
    await this.#credentials.removeSessionSecret(sessionId);
    await this.#catalog.remove(sessionId);
    return { sessionId, cwd: entry.sourceRoot };
  }

  async #recoverInterruptedOutboundHandoffs(allowDuringTransition = false): Promise<void> {
    if (this.#ownershipTransitionDepth > 0 && !allowDuringTransition) return;
    const interrupted = (await this.#catalog.list()).filter(
      (entry) => entry.handoffTransition?.direction === "local-to-cloud",
    );
    for (const entry of interrupted) {
      const transition = entry.handoffTransition!;
      let ownershipAborted = false;
      try {
        const recovery = await this.transport.abortInterruptedLocalHandoff(
          entry.sourceRoot,
          entry.sessionId,
          transition.target,
          transition.ownershipGeneration,
        );
        if (recovery.outcome === "already-committed") {
          await this.#catalog.patch(entry.sessionId, {
            status: "recoverable-error",
            ownershipGeneration: recovery.generation,
            handoffTransition: undefined,
            error: "Cloud ownership completed while the desktop was interrupted. Reconnect to continue.",
          });
          continue;
        }
        ownershipAborted = true;
        let sandboxId = entry.sandboxId;
        if (!sandboxId && entry.sandboxName) {
          await this.#loadProvider(entry.provider);
          const discovered = await this.#providers[entry.provider].findByName(entry.sandboxName);
          if (discovered) {
            sandboxId = discovered.id;
            await this.#catalog.patch(entry.sessionId, { sandboxId, sandboxName: discovered.name });
          }
        }
        await this.#catalog.patch(entry.sessionId, {
          status: "cleanup-pending",
          handoffTransition: undefined,
          error: sandboxId ? "Removing the provisional cloud sandbox after an interrupted handoff." : undefined,
        });
        if (sandboxId) {
          await this.#loadProvider(entry.provider);
          await this.#providers[entry.provider].destroy(sandboxId);
        }
        await this.#credentials.removeSessionSecret(entry.sessionId).catch(() => undefined);
        await this.#catalog.remove(entry.sessionId);
      } catch (error) {
        if (ownershipAborted) {
          await this.#catalog.patch(entry.sessionId, {
            status: "cleanup-pending",
            handoffTransition: undefined,
            error: `Provisional sandbox cleanup needs retry: ${message(error)}`,
          });
          continue;
        }
        let recoverableSandboxId = entry.sandboxId;
        let sandboxLookupCompleted = false;
        if (!recoverableSandboxId && entry.sandboxName) {
          try {
            await this.#loadProvider(entry.provider);
            const discovered = await this.#providers[entry.provider].findByName(entry.sandboxName);
            sandboxLookupCompleted = true;
            if (discovered) {
              recoverableSandboxId = discovered.id;
              await this.#catalog.patch(entry.sessionId, { sandboxId: discovered.id, sandboxName: discovered.name });
            }
          } catch { /* preserve the transition for another recovery attempt */ }
        }
        if (!recoverableSandboxId && transition.phase === "intent" && (!entry.sandboxName || sandboxLookupCompleted)) {
          // No sandbox means the commit boundary was unreachable. A mismatch
          // here means prepare itself never completed, so the intent is stale.
          await this.#catalog.remove(entry.sessionId);
        } else {
          await this.#catalog.patch(entry.sessionId, {
            status: "handoff-interrupted",
            error: `Interrupted handoff needs recovery: ${message(error)}`,
          });
        }
      }
    }
    const remaining = await this.#catalog.list();
    this.#ownershipUnresolved = remaining.some((entry) =>
      entry.status === "handoff-interrupted" && entry.handoffTransition !== undefined);
  }

  async #recoverInterruptedReturn(entry: CloudSessionCatalogEntry, connectedSessionId: string): Promise<string> {
    const transition = entry.handoffTransition;
    if (transition?.direction !== "cloud-to-local") return connectedSessionId;
    let aborted = false;
    try {
      if (transition.nonce) {
        await this.transport.rpc("abortHandoff", {
          cwd: entry.provider === "e2b" ? "/home/user/vibe/project" : "/vercel/sandbox/vibe/project",
          sessionId: entry.sessionId,
          nonce: transition.nonce,
        });
      } else {
        await this.transport.rpc("abortInterruptedHandoff", {
          sessionId: entry.sessionId,
          target: transition.target,
          ...(transition.ownershipGeneration === undefined ? {} : { expectedGeneration: transition.ownershipGeneration }),
        });
      }
      aborted = true;
    } catch (error) {
      if (transition.phase === "intent") {
        // The intent may have been persisted before prepare ran at all.
        aborted = true;
      } else if (transition.phase !== "committing" || !transition.portableImported || !transition.localCwd || transition.ownershipGeneration === undefined) {
        await this.#catalog.patch(entry.sessionId, {
          status: "recoverable-error",
          error: `Interrupted return could not be resolved safely: ${message(error)}`,
        });
        throw error;
      }
    }
    if (aborted) {
      if (transition.portableImported && transition.localCwd && transition.ownershipGeneration !== undefined) {
        await this.transport.abortPortableImport(
          transition.localCwd,
          entry.sessionId,
          transition.ownershipGeneration,
        );
      }
      let preservedRecoveryPath: string | undefined;
      if (transition.applied) {
        preservedRecoveryPath = await rollbackWorkspaceApplication(
          entry.sourceRoot,
          transition.applied.kind === "applied"
            ? { kind: "applied", recoveryPath: transition.applied.path }
            : { kind: "diverged", worktreePath: transition.applied.path },
        );
      }
      await this.#catalog.patch(entry.sessionId, {
        status: "running",
        handoffTransition: undefined,
        error: preservedRecoveryPath
          ? `Local changes made after the interruption were preserved at ${preservedRecoveryPath}; the return was rolled back safely.`
          : "An interrupted local return was rolled back safely.",
      });
      return connectedSessionId;
    }

    // The remote commit won the race: finish the already-journaled local
    // import and make the local engine authoritative without modifying files.
    await this.transport.commitPortableImport(
      transition.localCwd!,
      entry.sessionId,
      transition.ownershipGeneration!,
    );
    await this.transport.completeRemoteHandoff();
    const localId = await this.transport.start({ cwd: transition.localCwd!, resume: entry.sessionId });
    await this.#loadProvider(entry.provider);
    await this.#providers[entry.provider].suspend(entry.sandboxId).catch(() => undefined);
    await this.#catalog.patch(entry.sessionId, {
      status: "cleanup-pending",
      handoffTransition: undefined,
      localRecoveryCwd: transition.localCwd,
      localImportPending: false,
      error: "The interrupted return completed locally. The retained cloud copy can now be deleted.",
    });
    return localId;
  }

  async #waitForEngineIdle(snapshot: EngineSnapshot, eventSequenceBeforeSnapshot: number): Promise<void> {
    if (!snapshot.busy) {
      this.#idleSessionId = snapshot.sessionId;
      return;
    }
    // An idle event can arrive after the host produced the busy snapshot but
    // before the RPC continuation runs. Preserve that exact-session wakeup.
    if (this.#idleEventSequence > eventSequenceBeforeSnapshot && this.#idleSessionId === snapshot.sessionId) return;
    // Otherwise ignore an idle observation retained from before this request.
    this.#idleSessionId = null;
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        const waiters = this.#idleWaiters.get(snapshot.sessionId);
        waiters?.delete(done);
        if (waiters?.size === 0) this.#idleWaiters.delete(snapshot.sessionId);
        reject(new Error("Timed out waiting for engine-idle"));
      }, 30 * 60_000);
      const done = () => { clearTimeout(timeout); resolve(); };
      const waiters = this.#idleWaiters.get(snapshot.sessionId) ?? new Set<() => void>();
      waiters.add(done);
      this.#idleWaiters.set(snapshot.sessionId, waiters);
    });
  }

  async #withOwnershipTransition<T>(operation: () => Promise<T>, allowUnresolved = false): Promise<T> {
    if (this.#ownershipTransitionDepth > 0 || this.#ownershipUnresolved && !allowUnresolved) {
      throw new Error(this.#ownershipUnresolved
        ? "Session ownership recovery is required before continuing"
        : "A session handoff is already in progress");
    }
    this.#ownershipTransitionDepth += 1;
    try { return await operation(); }
    finally { this.#ownershipTransitionDepth -= 1; }
  }

  async #loadProvider(provider: CloudProviderId): Promise<void> {
    const credentials = await this.#credentials.get(provider);
    if (!credentials) throw new Error(`${provider === "e2b" ? "E2B" : "Vercel"} is not connected`);
    await this.#providers[provider].connectAccount(credentials as never);
  }

  async #mutateSettings(mutation: (settings: CloudSettingsFileV1) => CloudSettingsFileV1): Promise<void> {
    const run = this.#settingsMutationChain.then(async () => {
      const settings = await this.#readSettings();
      await this.#writeSettings(mutation(settings));
    });
    this.#settingsMutationChain = run.catch(() => undefined);
    await run;
  }

  async #boundEnvironment(settings: CloudSettingsPublic): Promise<Record<string, string>> {
    const environment: Record<string, string> = {};
    for (const binding of settings.credentialBindings) {
      if (binding.kind !== "environment") continue;
      const value = await this.#credentials.getBinding(binding.id);
      if (value) environment[binding.label] = value;
    }
    return environment;
  }

  #emit(sessionId: string, status: CloudSessionStatus, messageText: string, progress?: number): void {
    this.onStatus?.({ sessionId, status, message: messageText, ...(progress === undefined ? {} : { progress }) });
  }

  async #readSettings(): Promise<CloudSettingsFileV1> {
    try {
      const value = JSON.parse(await readFile(this.#settingsPath, "utf8")) as CloudSettingsFileV1;
      if (value.schemaVersion !== 1) throw new Error();
      return value;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw new Error("Cloud settings are corrupt");
      return {
        schemaVersion: 1,
        experimentalEnabled: false,
        lastProvider: "e2b",
        autoPauseMinutes: 10,
        deleteOnReturn: true,
        providers: { e2b: { configured: false }, vercel: { configured: false } },
        credentialBindings: [],
        allowedDomains: [],
        additionalExclusions: [],
      };
    }
  }

  async #writeSettings(value: CloudSettingsFileV1): Promise<void> {
    const parent = dirname(this.#settingsPath);
    await mkdir(parent, { recursive: true });
    const tmp = `${this.#settingsPath}.${process.pid}.${randomUUID()}.tmp`;
    let renamed = false;
    try {
      const file = await open(tmp, "wx", 0o600);
      try {
        await file.writeFile(`${JSON.stringify(value, null, 2)}\n`, "utf8");
        await file.sync();
      } finally {
        await file.close();
      }
      await rename(tmp, this.#settingsPath);
      renamed = true;
      let directory: Awaited<ReturnType<typeof open>> | undefined;
      try {
        directory = await open(parent, "r");
        await directory.sync();
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code !== "EINVAL" && code !== "ENOTSUP" && code !== "EISDIR") throw error;
      } finally {
        await directory?.close();
      }
    } finally {
      if (!renamed) await unlink(tmp).catch(() => undefined);
    }
  }
}

async function waitForRemoteFile(provider: SandboxProvider, id: string, path: string, timeoutMs: number, maxBytes: number): Promise<Uint8Array> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const size = await provider.size(id, path);
      if (size > maxBytes) throw new Error(`Remote file exceeds the ${Math.floor(maxBytes / (1024 * 1024)) || 1} MiB safety limit`);
      const data = await provider.download(id, path);
      if (data.byteLength !== size || data.byteLength > maxBytes) throw new Error("Remote file changed while downloading");
      return data;
    } catch (error) {
      if (error instanceof Error && /safety limit|changed while downloading/.test(error.message)) throw error;
      await new Promise((resolve) => setTimeout(resolve, 1_000));
    }
  }
  throw new Error("Cloud runtime did not become ready in time");
}

async function waitForCloudAgent(
  endpoint: string,
  accessToken: string,
  providerHeaders: Record<string, string> = {},
): Promise<void> {
  const health = new URL("/health", endpoint);
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(health, {
        headers: { ...providerHeaders, authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(5_000),
      });
      if (response.ok) return;
    } catch { /* daemon is still cold-starting */ }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  throw new Error("Cloud agent did not restart after sandbox resume");
}

async function findRuntimeArtifact(revision: string): Promise<{ path: string; data: Buffer }> {
  const roots = app.isPackaged
    ? [join(process.resourcesPath, "cloud-runtime")]
    : [resolve(app.getAppPath(), "..", "vibe-codr", "dist", "cloud-runtime")];
  for (const root of roots) {
    try {
      const name = (await readdir(root)).find((file) => file === `vibe-cloud-runtime-${revision.slice(0, 12)}.tar.gz`);
      if (!name) continue;
      const path = join(root, name);
      const data = await readFile(path);
      const expected = (await readFile(`${path}.sha256`, "utf8")).trim().split(/\s+/)[0];
      const actual = createHash("sha256").update(data).digest("hex");
      if (actual !== expected) throw new Error("Cloud runtime checksum mismatch");
      return { path, data };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  throw new Error("The revision-locked cloud runtime is missing. Run npm run build:cloud-runtime in vibe-codr.");
}

async function engineRevision(): Promise<string> {
  const paths = app.isPackaged
    ? [join(process.resourcesPath, "app.asar", "ENGINE_COMMIT"), join(process.resourcesPath, "ENGINE_COMMIT")]
    : [resolve(app.getAppPath(), "ENGINE_COMMIT")];
  for (const path of paths) {
    try { return (await readFile(path, "utf8")).trim(); } catch { /* next */ }
  }
  throw new Error("ENGINE_COMMIT is missing from the desktop package");
}

function message(error: unknown): string { return error instanceof Error ? error.message : String(error); }
