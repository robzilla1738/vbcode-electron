/**
 * Config file I/O for the Electron main process.
 *
 * Reads and writes the vibe-codr config files (JSONC-compatible) at the same
 * paths the engine uses: global `~/.config/vibe-codr/config.json` and project
 * `<cwd>/.vibe/config.json`. This mirrors `@vibe/config`'s `loadConfig` /
 * `writeGlobalConfig` but is self-contained for the Electron shell so it does
 * not need the Bun runtime or the `@vibe/config` package.
 */

import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { readFile, mkdir, writeFile, rename, rm } from "node:fs/promises";
import type { ConfigScope, VibeConfig } from "./config-schema";

/** Strip `//` line and `/* *\/` block comments (string-aware). */
function stripJsonComments(input: string): string {
  let out = "";
  let inString = false;
  let inLine = false;
  let inBlock = false;
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    const next = input[i + 1];
    if (inLine) {
      if (ch === "\n") { inLine = false; out += ch; }
      continue;
    }
    if (inBlock) {
      if (ch === "*" && next === "/") { inBlock = false; i++; }
      continue;
    }
    if (inString) {
      out += ch;
      if (ch === "\\") {
        if (next !== undefined) { out += next; i++; }
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') { inString = true; out += ch; }
    else if (ch === "/" && next === "/") { inLine = true; i++; }
    else if (ch === "/" && next === "*") { inBlock = true; i++; }
    else { out += ch; }
  }
  return out;
}

/** Strip trailing commas (string-aware) so JSONC parses with `JSON.parse`. */
function stripTrailingCommas(input: string): string {
  let out = "";
  let inString = false;
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (inString) {
      out += ch;
      if (ch === "\\") {
        if (input[i + 1] !== undefined) out += input[++i]!;
      } else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') { inString = true; out += ch; continue; }
    if (ch === ",") {
      let j = i + 1;
      while (j < input.length && /\s/.test(input[j]!)) j++;
      if (input[j] === "}" || input[j] === "]") continue;
    }
    out += ch;
  }
  return out;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}


/** Clone-surviving security-notices key the engine attaches to a loaded config
 * (see @vibe/config). Never persisted to disk — strip it before writing so a
 * round-trip through the Electron shell doesn't freeze a transient notice into
 * the user's config file. */
export const SECURITY_NOTICES_KEY = "__vibeSecurityNotices";

/** Drop the clone-surviving notices bag before writing config to disk. */
function stripSecurityNotices<T extends Record<string, unknown>>(value: T): T {
  if (!(SECURITY_NOTICES_KEY in value)) return value;
  const copy = { ...value };
  delete copy[SECURITY_NOTICES_KEY];
  return copy;
}

/** Deep-merge for writes: `null` deletes, `undefined` is a no-op. */
function mergeForWrite(
  base: Record<string, unknown>,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    if (value === null) { delete out[key]; continue; }
    const existing = out[key];
    if (isPlainObject(existing) && isPlainObject(value)) {
      out[key] = mergeForWrite(existing, value as Record<string, unknown>);
    } else {
      out[key] = value;
    }
  }
  return out;
}

export function globalConfigPath(): string {
  const base = process.env.XDG_CONFIG_HOME || join(homedir(), ".config");
  return join(base, "vibe-codr", "config.json");
}

export function projectConfigPath(cwd: string): string {
  return join(cwd, ".vibe", "config.json");
}

export function configPathForScope(scope: ConfigScope, cwd?: string): string {
  if (scope === "global") return globalConfigPath();
  if (!cwd) throw new Error("Project config requires a cwd");
  return projectConfigPath(cwd);
}

export async function readConfigFile(path: string): Promise<{ config: VibeConfig; raw: string } | null> {
  if (!existsSync(path)) return null;
  const raw = await readFile(path, "utf8");
  const cleaned = stripTrailingCommas(stripJsonComments(raw));
  const parsed = JSON.parse(cleaned) as VibeConfig;
  return { config: parsed, raw };
}

/** Atomic temp+rename JSON write — a crash mid-write cannot truncate the
 * live config into unparseable garbage (BUG-092 parity with @vibe/config).
 * The temp file is PID+timestamp-named and cleaned up on failure. */
async function atomicWriteJson(path: string, value: Record<string, unknown>): Promise<void> {
  const dir = dirname(path);
  await mkdir(dir, { recursive: true });
  const stripped = stripSecurityNotices(value);
  const tmp = join(dir, `.config.${process.pid}.${Date.now()}.tmp`);
  try {
    await writeFile(tmp, `${JSON.stringify(stripped, null, 2)}\n`, "utf8");
    await rename(tmp, path);
  } catch (err) {
    await rm(tmp, { force: true }).catch(() => {});
    throw err;
  }
}

/** Per-path write serialization. The engine fires config writes without
 * awaiting, so two rapid settings changes would both read the same `existing`
 * and the later write would clobber the earlier one's key. Chaining each path
 * through its own promise makes every write see the prior write's result. */
const writeChains = new Map<string, Promise<unknown>>();

function scheduleWrite<T>(path: string, work: () => Promise<T>): Promise<T> {
  const chain = writeChains.get(path) ?? Promise.resolve();
  const result = chain.then(work, work);
  // Advance the chain past this write's settlement, swallowing errors so one
  // failed write doesn't wedge every subsequent persist on that path.
  writeChains.set(
    path,
    result.then(
      () => undefined,
      () => undefined,
    ),
  );
  return result;
}

export async function writeConfigFile(
  path: string,
  patch: Record<string, unknown>,
): Promise<VibeConfig> {
  return scheduleWrite(path, async () => {
    let existing: Record<string, unknown> = {};
    try {
      const read = await readConfigFile(path);
      if (read) existing = read.config as Record<string, unknown>;
    } catch {
      /* file is corrupt or missing — start fresh */
    }
    const merged = mergeForWrite(existing, patch);
    await atomicWriteJson(path, merged);
    return merged as VibeConfig;
  });
}

// ── Memory file paths ────────────────────────────────────────────────────

export function globalMemoryPath(): string {
  const base = process.env.XDG_CONFIG_HOME || join(homedir(), ".config");
  return join(base, "vibe-codr", "VIBE.md");
}

export function projectMemoryPath(cwd: string): string {
  return join(cwd, "VIBE.md");
}

export function memoryPathForScope(scope: ConfigScope, cwd?: string): string {
  if (scope === "global") return globalMemoryPath();
  if (!cwd) throw new Error("Project memory requires a cwd");
  return projectMemoryPath(cwd);
}

export async function readMemoryFile(path: string): Promise<{ content: string; exists: boolean }> {
  if (!existsSync(path)) return { content: "", exists: false };
  const content = await readFile(path, "utf8");
  return { content, exists: true };
}

export async function writeMemoryFile(path: string, content: string): Promise<void> {
  const dir = dirname(path);
  await mkdir(dir, { recursive: true });
  const tmp = join(dir, `.VIBE.${process.pid}.${Date.now()}.tmp`);
  try {
    await writeFile(tmp, content, "utf8");
    await rename(tmp, path);
  } catch (err) {
    await rm(tmp, { force: true }).catch(() => {});
    throw err;
  }
}

/**
 * Read the existing config at `path`, deep-merge `patch` into it, and return
 * the merged result WITHOUT writing to disk. Used by the IPC write handler to
 * validate the merged config before persisting (mirroring the engine's
 * `ConfigSchema.safeParse` gate in `writeGlobalConfig`).
 */
export async function previewMergedConfig(
  path: string,
  patch: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  let existing: Record<string, unknown> = {};
  try {
    const read = await readConfigFile(path);
    if (read) existing = read.config as Record<string, unknown>;
  } catch {
    /* file is corrupt or missing — start fresh */
  }
  return mergeForWrite(existing, patch);
}
