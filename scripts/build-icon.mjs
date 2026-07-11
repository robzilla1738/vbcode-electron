#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, renameSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const source = join(root, "assets", "icon.svg");
const iconset = join(root, "assets", "icon.iconset");
const preview = mkdtempSync(join(tmpdir(), "vibe-icon-"));

try {
  execFileSync("/usr/bin/qlmanage", ["-t", "-s", "1024", "-o", preview, source], { stdio: "ignore" });
  const master = join(preview, "icon.svg.png");
  mkdirSync(iconset, { recursive: true });
  for (const [name, size] of [
    ["icon_16x16.png", 16], ["icon_16x16@2x.png", 32],
    ["icon_32x32.png", 32], ["icon_32x32@2x.png", 64],
    ["icon_128x128.png", 128], ["icon_128x128@2x.png", 256],
    ["icon_256x256.png", 256], ["icon_256x256@2x.png", 512],
    ["icon_512x512.png", 512], ["icon_512x512@2x.png", 1024],
  ]) {
    execFileSync("/usr/bin/sips", ["-z", String(size), String(size), master, "--out", join(iconset, name)], { stdio: "ignore" });
  }
  execFileSync("/usr/bin/iconutil", ["-c", "icns", iconset, "-o", join(root, "assets", "icon.icns")]);
} finally {
  rmSync(preview, { recursive: true, force: true });
  rmSync(iconset, { recursive: true, force: true });
}
