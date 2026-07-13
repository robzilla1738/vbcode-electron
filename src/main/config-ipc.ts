/**
 * Config IPC handlers for the Electron main process.
 *
 * Registers `config:*` and `memory:*` IPC channels so the renderer's Settings
 * panel can read/write the vibe-codr config files and memory (VIBE.md) files
 * directly. The engine reads these on bootstrap, so changes take effect on the
 * next session — or immediately via `run-slash` for the subset the engine
 * supports live.
 */

import { ipcMain } from "electron";
import {
  configPathForScope,
  readConfigFile,
  readMemoryFile,
  writeConfigFileValidated,
  writeMemoryFile,
  memoryPathForScope,
} from "../shared/config-io";
import { validateConfig } from "../shared/config-validate";
import type {
  ConfigReadResult,
  ConfigScope,
  ConfigWriteRequest,
  MemoryFileRequest,
  MemoryFileResult,
  MemoryWriteRequest,
} from "../shared/config-schema";
import type { AssertTrustedIpc } from "./ipc-security";
import { isAllowedCwd } from "../shared/cwd-allowlist";

function projectCwdGuard(scope: ConfigScope, cwd?: string): string | null {
  if (scope !== "project") return null;
  if (typeof cwd !== "string" || !cwd) return "Project scope requires a cwd";
  if (!isAllowedCwd(cwd)) return "cwd is not an opened project root";
  return null;
}

export function registerConfigIpc(assertTrusted: AssertTrustedIpc): void {
  ipcMain.handle("config:read", async (event, opts: { scope: ConfigScope; cwd?: string }) => {
    assertTrusted(event);
    if (!opts || (opts.scope !== "global" && opts.scope !== "project")) {
      return { ok: false as const, error: "Invalid scope" };
    }
    const guard = projectCwdGuard(opts.scope, opts.cwd);
    if (guard) return { ok: false as const, error: guard };
    try {
      const path = configPathForScope(opts.scope, opts.cwd);
      const read = await readConfigFile(path);
      if (!read) {
        return { ok: true as const, config: {}, path, raw: "" } as ConfigReadResult;
      }
      return { ok: true as const, config: read.config, path, raw: read.raw } as ConfigReadResult;
    } catch (err) {
      return { ok: false as const, error: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcMain.handle("config:write", async (event, req: ConfigWriteRequest) => {
    assertTrusted(event);
    if (
      !req ||
      (req.scope !== "global" && req.scope !== "project") ||
      !req.patch ||
      typeof req.patch !== "object" ||
      Array.isArray(req.patch)
    ) {
      return { ok: false as const, error: "Invalid write request" };
    }
    const guard = projectCwdGuard(req.scope, req.cwd);
    if (guard) return { ok: false as const, error: guard };
    try {
      const path = configPathForScope(req.scope, req.cwd);
      // Single critical section: read → merge → validate → write under the
      // per-path lock so concurrent saves cannot persist an unvalidated merge.
      const result = await writeConfigFileValidated(path, req.patch, validateConfig);
      if (!result.ok) return { ok: false as const, error: result.error };
      return { ok: true as const, path };
    } catch (err) {
      return { ok: false as const, error: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcMain.handle("config:globalPath", (event) => {
    assertTrusted(event);
    return configPathForScope("global");
  });

  ipcMain.handle("config:projectPath", (event, cwd: string) => {
    assertTrusted(event);
    if (typeof cwd !== "string" || !cwd) {
      throw new Error("Project config path requires a cwd");
    }
    const guard = projectCwdGuard("project", cwd);
    if (guard) throw new Error(guard);
    return configPathForScope("project", cwd);
  });

  // ── Memory (VIBE.md / custom instructions) ───────────────────────────

  ipcMain.handle("memory:read", async (event, opts: MemoryFileRequest) => {
    assertTrusted(event);
    if (!opts || (opts.scope !== "global" && opts.scope !== "project")) {
      return { ok: false as const, error: "Invalid scope" };
    }
    const guard = projectCwdGuard(opts.scope, opts.cwd);
    if (guard) return { ok: false as const, error: guard };
    try {
      const path = memoryPathForScope(opts.scope, opts.cwd);
      const read = await readMemoryFile(path);
      return { ok: true as const, path, content: read.content, exists: read.exists } as MemoryFileResult;
    } catch (err) {
      return { ok: false as const, error: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcMain.handle("memory:write", async (event, req: MemoryWriteRequest) => {
    assertTrusted(event);
    if (!req || (req.scope !== "global" && req.scope !== "project") || typeof req.content !== "string") {
      return { ok: false as const, error: "Invalid write request" };
    }
    const guard = projectCwdGuard(req.scope, req.cwd);
    if (guard) return { ok: false as const, error: guard };
    try {
      const path = memoryPathForScope(req.scope, req.cwd);
      await writeMemoryFile(path, req.content);
      return { ok: true as const, path };
    } catch (err) {
      return { ok: false as const, error: err instanceof Error ? err.message : String(err) };
    }
  });
}
