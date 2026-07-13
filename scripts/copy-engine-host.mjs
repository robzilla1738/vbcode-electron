#!/usr/bin/env node
/**
 * Copy vibecodr-engine-host into resources/ for packaging.
 * Fails if the binary is older than engine runtime sources (same freshness
 * rule as host-resolver) so packs cannot embed a stale host silently.
 */
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  chmodSync,
  readdirSync,
  statSync,
} from "node:fs";
import { homedir } from "node:os";
import { join, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const destDir = join(root, "resources");
const dest = join(destDir, "vibecodr-engine-host");

const ENGINE_SOURCE_PATHS = [
  "packages/config/src",
  "packages/core/src",
  "packages/macos-bridge/src",
  "packages/macos-bridge/bin/engine-host.ts",
  "packages/plugins/src",
  "packages/providers/src",
  "packages/shared/src",
  "packages/tools/src",
];

const SOURCE_EXTENSIONS = new Set([".json", ".ts", ".tsx"]);

function newestSourceMtime(engineRoot) {
  let newest = 0;
  const visit = (path) => {
    let entry;
    try {
      entry = statSync(path);
    } catch {
      return;
    }
    if (entry.isFile()) {
      if (SOURCE_EXTENSIONS.has(extname(path))) {
        newest = Math.max(newest, entry.mtimeMs);
      }
      return;
    }
    if (!entry.isDirectory()) return;
    let children;
    try {
      children = readdirSync(path);
    } catch {
      return;
    }
    for (const child of children) visit(join(path, child));
  };
  for (const rel of ENGINE_SOURCE_PATHS) visit(join(engineRoot, rel));
  return newest;
}

function engineRootForBinary(binPath) {
  // …/dist/vibecodr-engine-host → engine root
  return dirname(dirname(binPath));
}

const candidates = [
  process.env.VIBE_CODR_ROOT && join(process.env.VIBE_CODR_ROOT, "dist", "vibecodr-engine-host"),
  join(homedir(), "Code", "vibe-codr", "dist", "vibecodr-engine-host"),
  join(homedir(), "code", "vibe-codr", "dist", "vibecodr-engine-host"),
].filter(Boolean);

const src = candidates.find((p) => p && existsSync(p));
if (!src) {
  console.error(
    "vibecodr-engine-host not found. Run: cd ~/Code/vibe-codr && bun run build:macos-bridge",
  );
  process.exit(1);
}

const engineRoot = engineRootForBinary(src);
const binaryMtime = statSync(src).mtimeMs;
const sourceMtime = newestSourceMtime(engineRoot);
if (sourceMtime > binaryMtime) {
  console.error(
    `Refusing to pack a stale host: sources under ${engineRoot} are newer than ${src}.\n` +
      `Run: cd ${engineRoot} && bun run build:macos-bridge`,
  );
  process.exit(1);
}

mkdirSync(destDir, { recursive: true });
copyFileSync(src, dest);
chmodSync(dest, 0o755);
console.log(`Copied ${src} → ${dest} (fresh vs sources @ ${engineRoot})`);
