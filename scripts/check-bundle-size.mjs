#!/usr/bin/env node
import { readdir, stat } from "node:fs/promises";
import { join, resolve } from "node:path";

const assets = resolve("out/renderer/assets");
const files = (await readdir(assets)).filter((name) => name.endsWith(".js"));
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
