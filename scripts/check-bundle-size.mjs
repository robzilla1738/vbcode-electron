#!/usr/bin/env node
import { existsSync } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { join, resolve } from "node:path";

const assets = resolve("out/renderer/assets");
if (!existsSync(assets)) {
  console.error("Renderer assets missing — run `npm run build` before verify:bundle");
  process.exit(1);
}
const files = (await readdir(assets)).filter((name) => name.endsWith(".js"));
if (files.length === 0) {
  console.error("No renderer JS chunks found under out/renderer/assets — run `npm run build`");
  process.exit(1);
}
const sizes = await Promise.all(files.map(async (name) => ({ name, bytes: (await stat(join(assets, name))).size })));
const total = sizes.reduce((sum, item) => sum + item.bytes, 0);
const largest = sizes.reduce((max, item) => Math.max(max, item.bytes), 0);
const totalBudget = 2_200_000;
const chunkBudget = 2_100_000;

if (total > totalBudget || largest > chunkBudget) {
  console.error(`Renderer bundle budget exceeded: ${total} total bytes, ${largest} largest chunk`);
  process.exit(1);
}

console.log(`Renderer bundle budget OK: ${total} total bytes, ${largest} largest chunk`);

// Host binary budget when present (pack / copy-host). Not required for verify
// after a renderer-only build, but fail loud if an oversized host is staged.
const hostCandidates = [
  resolve("resources/vibecodr-engine-host"),
  resolve("release/mac-arm64/Vibe Codr.app/Contents/Resources/vibecodr-engine-host"),
  resolve("release/mac/Vibe Codr.app/Contents/Resources/vibecodr-engine-host"),
];
const hostBudget = 120 * 1024 * 1024; // 120 MiB — fail if a huge accidental binary is shipped
for (const host of hostCandidates) {
  if (!existsSync(host)) continue;
  const bytes = (await stat(host)).size;
  if (bytes > hostBudget) {
    console.error(`Host binary budget exceeded: ${host} is ${bytes} bytes (max ${hostBudget})`);
    process.exit(1);
  }
  console.log(`Host binary budget OK: ${host} (${bytes} bytes)`);
  break;
}
