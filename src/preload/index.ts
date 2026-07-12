import { contextBridge, ipcRenderer, webUtils } from "electron";
import type { EngineCommand } from "../shared/commands";
import type {
  ConfigReadResult,
  ConfigScope,
  ConfigWriteRequest,
  MemoryFileRequest,
  MemoryFileResult,
  MemoryWriteRequest,
} from "../shared/config-schema";
import type {
  GhPrCreateRequest,
  GhPrCreateResult,
  GhPrListResult,
  GitCheckoutRequest,
  GitCommitRequest,
  GitCreateBranchRequest,
  GitDeleteBranchRequest,
  GitFullStatus,
  GitMergeRequest,
  GitPullRequest,
  GitPushRequest,
} from "../shared/git-types";
import type { RpcMethod } from "../shared/protocol";
import type { ProjectSummary } from "../shared/protocol";

export interface BootstrapOpts {
  cwd: string;
  resume?: string;
  continueLatest?: boolean;
  model?: string;
  mode?: "plan" | "execute" | "yolo";
}

export interface GitOperationResult {
  ok: boolean;
  message?: string;
  error?: string;
}

export interface VibeApi {
  bootstrap(opts: BootstrapOpts): Promise<
    | { ok: true; sessionId: string; launch: string }
    | { ok: false; error: string; stderr?: string; launch?: string }
  >;
  send(command: EngineCommand): Promise<{ ok: true } | { ok: false; error: string }>;
  rpc(method: RpcMethod, params?: Record<string, unknown>): Promise<{ ok: true; value: unknown } | { ok: false; error: string }>;
  listProjects(): Promise<
    { ok: true; value: ProjectSummary[] } | { ok: false; error: string }
  >;
  renameProject(opts: { cwd: string; name: string }): Promise<{ ok: true } | { ok: false; error: string }>;
  archiveProject(opts: { cwd: string }): Promise<{ ok: true } | { ok: false; error: string }>;
  deleteProject(opts: { cwd: string }): Promise<{ ok: true } | { ok: false; error: string }>;
  renameSession(opts: { cwd: string; id: string; title: string }): Promise<{ ok: true } | { ok: false; error: string }>;
  deleteSession(opts: { cwd: string; id: string }): Promise<{ ok: true } | { ok: false; error: string }>;
  archiveSession(opts: { cwd: string; id: string }): Promise<{ ok: true } | { ok: false; error: string }>;
  stop(): Promise<{ ok: true }>;
  quit(): void;
  onEvent(cb: (event: unknown) => void): () => void;
  onReady(cb: (sessionId: string) => void): () => void;
  onFatal(cb: (message: string) => void): () => void;
  onMenuAction(cb: (action: string) => void): () => void;
  openProject(): Promise<string | null>;
  openExternal(url: string): Promise<void>;
  showItem(path: string): Promise<void>;
  readTextFile(opts: {
    cwd: string;
    path: string;
    maxBytes?: number;
  }): Promise<
    | { ok: true; text: string; truncated: boolean }
    | { ok: false; error: string }
  >;
  composeInEditor(draft: string): Promise<{ ok: boolean; text?: string; reason?: "failed" | "no-editor" | "kept"; error?: string }>;
  getPath(name: "home" | "userData"): Promise<string>;
  getPathForFile(file: File): string;
  listFiles(opts: { cwd: string; query: string; limit?: number }): Promise<string[]>;
  pasteClipboard(cwd?: string): Promise<
    | { kind: "image"; path: string }
    | { kind: "text"; text: string }
    | { kind: "none" }
    | { kind: "error"; error: string }
  >;
  globalConfigPath(): Promise<string>;

  // ── Config (settings) ────────────────────────────────────────────────
  readConfig(opts: { scope: ConfigScope; cwd?: string }): Promise<ConfigReadResult | { ok: false; error: string }>;
  writeConfig(req: ConfigWriteRequest): Promise<{ ok: true; path: string } | { ok: false; error: string }>;
  projectConfigPath(cwd: string): Promise<string>;
  readMemory(opts: MemoryFileRequest): Promise<MemoryFileResult | { ok: false; error: string }>;
  writeMemory(req: MemoryWriteRequest): Promise<{ ok: true; path: string } | { ok: false; error: string }>;

  // ── Git / GitHub ──────────────────────────────────────────────────────
  gitStatus(cwd: string): Promise<{ ok: true; status: GitFullStatus | null } | { ok: false; error: string }>;
  gitCreateBranch(req: GitCreateBranchRequest): Promise<GitOperationResult>;
  gitCheckout(req: GitCheckoutRequest): Promise<GitOperationResult>;
  gitDeleteBranch(req: GitDeleteBranchRequest): Promise<GitOperationResult>;
  gitStage(opts: { cwd: string; paths?: string[]; all?: boolean; allIncludingUntracked?: boolean }): Promise<GitOperationResult>;
  gitCommit(req: GitCommitRequest): Promise<GitOperationResult>;
  gitMerge(req: GitMergeRequest): Promise<GitOperationResult>;
  gitPush(req: GitPushRequest): Promise<GitOperationResult>;
  gitPull(req: GitPullRequest): Promise<GitOperationResult>;
  gitFetch(opts: { cwd: string; remote?: string }): Promise<GitOperationResult>;
  ghCheckAvailable(): Promise<{ available: boolean }>;
  ghPrList(cwd: string): Promise<GhPrListResult>;
  ghPrCreate(req: GhPrCreateRequest): Promise<GhPrCreateResult>;
}

const api: VibeApi = {
  bootstrap: (opts) => ipcRenderer.invoke("engine:bootstrap", opts),
  send: (command) => ipcRenderer.invoke("engine:send", command),
  rpc: (method, params) => ipcRenderer.invoke("engine:rpc", method, params),
  listProjects: () => ipcRenderer.invoke("engine:rpc", "listProjects"),
  renameProject: (opts) => ipcRenderer.invoke("engine:rpc", "renameProject", opts),
  archiveProject: (opts) => ipcRenderer.invoke("engine:rpc", "archiveProject", opts),
  deleteProject: (opts) => ipcRenderer.invoke("engine:rpc", "deleteProject", opts),
  renameSession: (opts) => ipcRenderer.invoke("engine:rpc", "renameSession", opts),
  deleteSession: (opts) => ipcRenderer.invoke("engine:rpc", "deleteSession", opts),
  archiveSession: (opts) => ipcRenderer.invoke("engine:rpc", "archiveSession", opts),
  stop: () => ipcRenderer.invoke("engine:stop"),
  quit: () => ipcRenderer.send("app:quit"),
  onEvent: (cb) => {
    const handler = (_: Electron.IpcRendererEvent, event: unknown) => cb(event);
    ipcRenderer.on("engine:event", handler);
    return () => ipcRenderer.removeListener("engine:event", handler);
  },
  onReady: (cb) => {
    const handler = (_: Electron.IpcRendererEvent, sessionId: string) => cb(sessionId);
    ipcRenderer.on("engine:ready", handler);
    return () => ipcRenderer.removeListener("engine:ready", handler);
  },
  onFatal: (cb) => {
    const handler = (_: Electron.IpcRendererEvent, message: string) => cb(message);
    ipcRenderer.on("engine:fatal", handler);
    return () => ipcRenderer.removeListener("engine:fatal", handler);
  },
  onMenuAction: (cb) => {
    const handler = (_: Electron.IpcRendererEvent, action: string) => cb(action);
    ipcRenderer.on("menu:openProject", () => cb("openProject"));
    ipcRenderer.on("menu:continueLatest", () => cb("continueLatest"));
    ipcRenderer.on("menu:toggleSettings", () => cb("toggleSettings"));
    ipcRenderer.on("menu:toggleGit", () => cb("toggleGit"));
    ipcRenderer.on("menu:toggleInspector", () => cb("toggleInspector"));
    return () => {
      ipcRenderer.removeListener("menu:openProject", handler);
      ipcRenderer.removeListener("menu:continueLatest", handler);
      ipcRenderer.removeListener("menu:toggleSettings", handler);
      ipcRenderer.removeListener("menu:toggleGit", handler);
      ipcRenderer.removeListener("menu:toggleInspector", handler);
    };
  },
  openProject: () => ipcRenderer.invoke("dialog:openProject"),
  openExternal: (url) => ipcRenderer.invoke("shell:openExternal", url),
  showItem: (path) => ipcRenderer.invoke("shell:showItem", path),
  readTextFile: (opts) => ipcRenderer.invoke("fs:readTextFile", opts),
  pasteClipboard: (cwd) => ipcRenderer.invoke("clipboard:paste", { cwd }),
  composeInEditor: (draft) => ipcRenderer.invoke("editor:compose", draft),
  getPath: (name) => ipcRenderer.invoke("app:getPath", name),
  getPathForFile: (file) => webUtils.getPathForFile(file),
  listFiles: (opts) => ipcRenderer.invoke("fs:listFiles", opts),
  globalConfigPath: () => ipcRenderer.invoke("config:globalPath"),

  // Config
  readConfig: (opts) => ipcRenderer.invoke("config:read", opts),
  writeConfig: (req) => ipcRenderer.invoke("config:write", req),
  projectConfigPath: (cwd) => ipcRenderer.invoke("config:projectPath", cwd),
  readMemory: (opts) => ipcRenderer.invoke("memory:read", opts),
  writeMemory: (req) => ipcRenderer.invoke("memory:write", req),

  // Git
  gitStatus: (cwd) => ipcRenderer.invoke("git:status", cwd),
  gitCreateBranch: (req) => ipcRenderer.invoke("git:createBranch", req),
  gitCheckout: (req) => ipcRenderer.invoke("git:checkout", req),
  gitDeleteBranch: (req) => ipcRenderer.invoke("git:deleteBranch", req),
  gitStage: (opts) => ipcRenderer.invoke("git:stage", opts),
  gitCommit: (req) => ipcRenderer.invoke("git:commit", req),
  gitMerge: (req) => ipcRenderer.invoke("git:merge", req),
  gitPush: (req) => ipcRenderer.invoke("git:push", req),
  gitPull: (req) => ipcRenderer.invoke("git:pull", req),
  gitFetch: (opts) => ipcRenderer.invoke("git:fetch", opts),
  ghCheckAvailable: () => ipcRenderer.invoke("gh:checkAvailable"),
  ghPrList: (cwd) => ipcRenderer.invoke("gh:prList", cwd),
  ghPrCreate: (req) => ipcRenderer.invoke("gh:prCreate", req),
};

contextBridge.exposeInMainWorld("vibe", api);
