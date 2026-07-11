import { contextBridge, ipcRenderer } from "electron";
import type { EngineCommand } from "../shared/commands";
import type { RpcMethod } from "../shared/protocol";
import type { ProjectSummary } from "../shared/protocol";

export interface BootstrapOpts {
  cwd: string;
  resume?: string;
  continueLatest?: boolean;
  model?: string;
  mode?: "plan" | "execute" | "yolo";
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
  renameSession(opts: { cwd: string; id: string; title: string }): Promise<{ ok: true } | { ok: false; error: string }>;
  deleteSession(opts: { cwd: string; id: string }): Promise<{ ok: true } | { ok: false; error: string }>;
  archiveSession(opts: { cwd: string; id: string }): Promise<{ ok: true } | { ok: false; error: string }>;
  stop(): Promise<{ ok: true }>;
  quit(): void;
  onEvent(cb: (event: unknown) => void): () => void;
  onReady(cb: (sessionId: string) => void): () => void;
  onFatal(cb: (message: string) => void): () => void;
  openProject(): Promise<string | null>;
  openExternal(url: string): Promise<void>;
  showItem(path: string): Promise<void>;
  composeInEditor(draft: string): Promise<{ ok: boolean; text?: string; reason?: "failed" | "no-editor" | "kept"; error?: string }>;
  getPath(name: "home" | "userData"): Promise<string>;
  listFiles(opts: { cwd: string; query: string; limit?: number }): Promise<string[]>;
  pasteClipboard(cwd?: string): Promise<
    | { kind: "image"; path: string }
    | { kind: "text"; text: string }
    | { kind: "none" }
    | { kind: "error"; error: string }
  >;
  globalConfigPath(): Promise<string>;
}

const api: VibeApi = {
  bootstrap: (opts) => ipcRenderer.invoke("engine:bootstrap", opts),
  send: (command) => ipcRenderer.invoke("engine:send", command),
  rpc: (method, params) => ipcRenderer.invoke("engine:rpc", method, params),
  listProjects: () => ipcRenderer.invoke("engine:rpc", "listProjects"),
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
  openProject: () => ipcRenderer.invoke("dialog:openProject"),
  openExternal: (url) => ipcRenderer.invoke("shell:openExternal", url),
  showItem: (path) => ipcRenderer.invoke("shell:showItem", path),
  pasteClipboard: (cwd) => ipcRenderer.invoke("clipboard:paste", { cwd }),
  composeInEditor: (draft) => ipcRenderer.invoke("editor:compose", draft),
  getPath: (name) => ipcRenderer.invoke("app:getPath", name),
  listFiles: (opts) => ipcRenderer.invoke("fs:listFiles", opts),
  globalConfigPath: () => ipcRenderer.invoke("config:globalPath"),
};

contextBridge.exposeInMainWorld("vibe", api);
