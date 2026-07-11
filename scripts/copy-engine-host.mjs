#!/usr/bin/env node
import { copyFileSync, existsSync, mkdirSync, chmodSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const destDir = join(root, "resources");
const dest = join(destDir, "vibecodr-engine-host");

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

mkdirSync(destDir, { recursive: true });
copyFileSync(src, dest);
chmodSync(dest, 0o755);
console.log(`Copied ${src} → ${dest}`);
