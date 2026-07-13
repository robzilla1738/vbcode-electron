/**
 * Allowlist of project roots the renderer may use for git/config/fs IPC.
 * Defense-in-depth against a compromised renderer pointing cwd at arbitrary trees.
 */

import { resolve } from "node:path";
import { homedir } from "node:os";

/** Global vibe paths that Settings/memory may always touch. */
export function globalVibeRoots(home = homedir()): string[] {
  const xdg = process.env.XDG_CONFIG_HOME || resolve(home, ".config");
  return [
    resolve(xdg, "vibe-codr"),
    resolve(home, ".vibe"),
  ];
}

export class CwdAllowlist {
  private roots = new Set<string>();

  constructor(initial: readonly string[] = []) {
    for (const r of initial) this.add(r);
  }

  add(cwd: string): void {
    if (typeof cwd !== "string" || !cwd) return;
    this.roots.add(resolve(cwd));
  }

  has(cwd: string): boolean {
    if (typeof cwd !== "string" || !cwd) return false;
    const abs = resolve(cwd);
    if (this.roots.has(abs)) return true;
    // Also allow paths under an allowed root (subdirs of an opened project).
    for (const root of this.roots) {
      if (abs === root || abs.startsWith(`${root}/`) || abs.startsWith(`${root}\\`)) {
        return true;
      }
    }
    return false;
  }

  /** True when cwd is allowlisted or under a global vibe path. */
  allows(cwd: string, home = homedir()): boolean {
    if (this.has(cwd)) return true;
    const abs = resolve(cwd);
    for (const root of globalVibeRoots(home)) {
      if (abs === root || abs.startsWith(`${root}/`) || abs.startsWith(`${root}\\`)) {
        return true;
      }
    }
    return false;
  }

  snapshot(): string[] {
    return [...this.roots];
  }
}

/** Shared process-wide allowlist used by main IPC handlers. */
export const projectCwdAllowlist = new CwdAllowlist();

export function assertAllowedCwd(cwd: string, label = "cwd"): void {
  if (!projectCwdAllowlist.allows(cwd)) {
    throw new Error(`${label} is not an opened project root`);
  }
}

export function isAllowedCwd(cwd: string): boolean {
  return projectCwdAllowlist.allows(cwd);
}
