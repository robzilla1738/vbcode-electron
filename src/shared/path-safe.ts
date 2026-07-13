/**
 * Project-scoped path safety: lexical resolve + realpath containment so a
 * symlink inside the project cannot escape to read/write outside the root.
 */

import { isAbsolute, relative, resolve } from "node:path";

export interface PathSafeFs {
  realpathSync(path: string): string;
  existsSync(path: string): boolean;
  /** When true, target is a regular file (not a directory). */
  isFile(path: string): boolean;
}

/**
 * Resolve `path` under `cwd` and ensure the real path stays inside the real
 * project root. Rejects absolute/parent escapes and symlink escapes.
 */
export function resolvePathInsideRoot(
  cwd: string,
  path: string,
  fs: PathSafeFs,
): { ok: true; root: string; target: string } | { ok: false; error: string } {
  if (typeof cwd !== "string" || !cwd || typeof path !== "string" || !path) {
    return { ok: false, error: "Invalid path" };
  }
  const rootLex = resolve(cwd);
  const targetLex = resolve(rootLex, path);
  const rel = relative(rootLex, targetLex);
  if (rel.startsWith("..") || isAbsolute(rel)) {
    return { ok: false, error: "Path escapes the project" };
  }
  let rootReal: string;
  let targetReal: string;
  try {
    rootReal = fs.realpathSync(rootLex);
  } catch {
    return { ok: false, error: "Project root not found" };
  }
  try {
    targetReal = fs.realpathSync(targetLex);
  } catch {
    return { ok: false, error: "File not found" };
  }
  const realRel = relative(rootReal, targetReal);
  if (realRel.startsWith("..") || isAbsolute(realRel)) {
    return { ok: false, error: "Path escapes the project" };
  }
  if (!fs.existsSync(targetReal) || !fs.isFile(targetReal)) {
    return { ok: false, error: "File not found" };
  }
  return { ok: true, root: rootReal, target: targetReal };
}
