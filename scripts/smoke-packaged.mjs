import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { _electron as electron } from "playwright";

const root = resolve(import.meta.dirname, "..");
const releaseRoot = join(root, "release");
const macDirs = (await readdir(releaseRoot, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory() && entry.name.startsWith("mac"));
const preferredDir = process.arch === "arm64" ? "mac-arm64" : "mac";
const macDir = macDirs.find((entry) => entry.name === preferredDir) ?? macDirs[0];
if (!macDir) throw new Error("Packaged macOS application directory not found");
const executablePath = join(releaseRoot, macDir.name, "Vibe Codr.app", "Contents", "MacOS", "Vibe Codr");
const project = join(root, "test", "fixtures", "project");
const userData = await mkdtemp(join(tmpdir(), "vibecodr-packaged-"));
const env = { ...process.env, ELECTRON_DISABLE_SECURITY_WARNINGS: "true" };
delete env.VIBE_CODR_ROOT;

let app;
try {
  app = await electron.launch({
    executablePath,
    args: [`--user-data-dir=${userData}`],
    cwd: root,
    env,
  });
  // Exercise the same capability grant a real user gets from the native folder
  // picker. A forged localStorage `vibe.lastCwd` is intentionally not trusted
  // by the main process and therefore cannot be used to bootstrap this smoke.
  await app.evaluate(({ dialog }, selectedProject) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [selectedProject],
    });
  }, project);
  const page = await app.firstWindow();
  await page.getByRole("button", { name: "Open project" }).click();
  const composer = page.getByRole("textbox", { name: "Task message" });
  await composer.waitFor({ state: "visible", timeout: 45_000 });
  await composer.fill("/theme light");
  await composer.press("Enter");
  await page.waitForFunction(() => document.documentElement.style.colorScheme === "light");
  process.stdout.write("packaged smoke ok: bundled host booted, project opened, command applied\n");
} finally {
  await app?.close();
  // Best-effort orphan check: after close, no child host should remain for this userData run.
  // Other developer sessions may still hold a host — only fail if our executable left a
  // process that still references this smoke userData path (best-effort; ignore errors).
  try {
    const { execSync } = await import("node:child_process");
    const out = execSync("pgrep -fl vibecodr-engine-host || true", { encoding: "utf8" });
    if (out.includes(userData)) {
      console.error("Orphan engine host still references smoke userData after app close:\n", out);
      process.exitCode = 1;
    } else {
      process.stdout.write("packaged smoke ok: no host orphan tied to smoke userData\n");
    }
  } catch {
    /* pgrep may be unavailable — non-fatal */
  }
  await rm(userData, { recursive: true, force: true });
}
