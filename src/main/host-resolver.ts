import { existsSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { app } from "electron";

export interface HostLaunch {
  executable: string;
  arguments: string[];
  workingDirectory: string;
  description: string;
}

const CONVENTIONAL_ROOTS = [
  join(homedir(), "Code", "vibe-codr"),
  join(homedir(), "code", "vibe-codr"),
  join(homedir(), "Developer", "vibe-codr"),
  join(homedir(), "src", "vibe-codr"),
];

// A compiled host is only safe to use while it still represents the checked
// out engine. Keep this list focused on runtime source so a stale binary
// cannot hide newer fixes in the sibling repository during development.
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

function newestSourceMtime(root: string): number {
  let newest = 0;

  const visit = (path: string): void => {
    let entry: ReturnType<typeof statSync>;
    try {
      entry = statSync(path);
    } catch {
      return;
    }

    if (entry.isFile()) {
      const dot = path.lastIndexOf(".");
      if (dot >= 0 && SOURCE_EXTENSIONS.has(path.slice(dot))) {
        newest = Math.max(newest, entry.mtimeMs);
      }
      return;
    }
    if (!entry.isDirectory()) return;

    let children: string[];
    try {
      children = readdirSync(path);
    } catch {
      return;
    }
    for (const child of children) visit(join(path, child));
  };

  for (const relativePath of ENGINE_SOURCE_PATHS) {
    visit(join(root, relativePath));
  }
  return newest;
}

function whichBun(): string | null {
  const candidates = [
    join(homedir(), ".bun", "bin", "bun"),
    "/opt/homebrew/bin/bun",
    "/usr/local/bin/bun",
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return null;
}

function tryCompiledHost(root: string): HostLaunch | null {
  const bin = join(root, "dist", "vibecodr-engine-host");
  if (!existsSync(bin)) return null;
  try {
    const binaryMtime = statSync(bin).mtimeMs;
    const sourceMtime = newestSourceMtime(root);
    if (sourceMtime > binaryMtime) return null;
  } catch {
    return null;
  }
  return {
    executable: bin,
    arguments: [],
    workingDirectory: root,
    description: `compiled ${bin}`,
  };
}

function trySourceHost(root: string): HostLaunch | null {
  const entry = join(root, "packages", "macos-bridge", "bin", "engine-host.ts");
  if (!existsSync(entry)) return null;
  const bun = whichBun();
  if (!bun) return null;
  return {
    executable: bun,
    arguments: ["run", entry],
    workingDirectory: root,
    description: `bun ${entry}`,
  };
}

function tryRoot(root: string): HostLaunch | null {
  return tryCompiledHost(root) ?? trySourceHost(root);
}

function bundledHost(): HostLaunch | null {
  try {
    const resources = process.resourcesPath;
    const bin = join(resources, "vibecodr-engine-host");
    if (existsSync(bin)) {
      return {
        executable: bin,
        arguments: [],
        workingDirectory: homedir(),
        description: `bundled ${bin}`,
      };
    }
  } catch {
    /* unpackaged */
  }
  // Dev: resources/ next to project root
  const devBin = join(app.getAppPath(), "resources", "vibecodr-engine-host");
  if (existsSync(devBin)) {
    return {
      executable: devBin,
      arguments: [],
      workingDirectory: app.getAppPath(),
      description: `dev resources ${devBin}`,
    };
  }
  return null;
}

/** Resolve vibecodr-engine-host the same way as the macOS Swift shell. */
export function resolveHostLaunch(): HostLaunch {
  const envRoot = process.env.VIBE_CODR_ROOT;
  if (envRoot) {
    const hit = tryRoot(envRoot);
    if (hit) return hit;
  }
  // A packaged app must prefer the host shipped with that exact release. A
  // developer may also have ~/Code/vibe-codr, but it can be older/newer and
  // protocol-incompatible. VIBE_CODR_ROOT remains the explicit override.
  if (app.isPackaged) {
    const bundled = bundledHost();
    if (bundled) return bundled;
  }
  for (const root of CONVENTIONAL_ROOTS) {
    const hit = tryRoot(root);
    if (hit) return hit;
  }
  const bundled = bundledHost();
  if (bundled) return bundled;
  throw new Error(
    "Could not find vibecodr-engine-host. Clone vibe-codr to ~/Code/vibe-codr, set VIBE_CODR_ROOT, run `bun run build:macos-bridge`, or install Bun.",
  );
}

/** PATH enrichment so GUI-launched hosts find bun/git/node. */
export function enrichedEnv(): NodeJS.ProcessEnv {
  const home = homedir();
  const extras = [
    join(home, ".bun", "bin"),
    "/opt/homebrew/bin",
    "/usr/local/bin",
    "/usr/bin",
    "/bin",
  ].join(":");
  const path = process.env.PATH ? `${extras}:${process.env.PATH}` : extras;
  return {
    ...process.env,
    HOME: process.env.HOME ?? home,
    PATH: path,
  };
}
