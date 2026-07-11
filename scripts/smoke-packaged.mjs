import { _electron as electron } from "playwright";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

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
  const page = await app.firstWindow();
  await page.evaluate((cwd) => localStorage.setItem("vibe.lastCwd", cwd), project);
  await page.reload();
  const composer = page.getByRole("textbox", { name: "Task message" });
  await composer.waitFor({ state: "visible", timeout: 45_000 });
  await composer.fill("/theme light");
  await composer.press("Enter");
  await page.waitForFunction(() => document.documentElement.style.colorScheme === "light");
  process.stdout.write("packaged smoke ok: bundled host booted, project restored, command applied\n");
} finally {
  await app?.close();
  await rm(userData, { recursive: true, force: true });
}
