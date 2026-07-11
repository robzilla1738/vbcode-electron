import { _electron as electron, expect, test, type ElectronApplication, type Page } from "@playwright/test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const fixtureRoot = join(root, "test", "fixtures", "vibe-codr");
const projectDir = join(root, "test", "fixtures", "project");
const editor = join(root, "test", "fixtures", "editor.mjs");
const icon = join(root, "test", "fixtures", "icon.png");
let app: ElectronApplication;
let page: Page;
let userData: string;

test.beforeAll(async () => {
  userData = mkdtempSync(join(tmpdir(), "vbcode-electron-e2e-"));
  app = await electron.launch({
    args: [root, `--user-data-dir=${userData}`],
    cwd: root,
    env: {
      ...process.env,
      VIBE_CODR_ROOT: fixtureRoot,
      VISUAL: `${process.execPath} ${editor}`,
      ELECTRON_DISABLE_SECURITY_WARNINGS: "true",
    },
  });
  page = await app.firstWindow();
  await page.evaluate((cwd) => localStorage.setItem("vibe.lastCwd", cwd), projectDir);
  await page.reload();
  await expect(page.getByRole("textbox", { name: "Task message" })).toBeVisible();
});

test.afterAll(async () => {
  await app?.close();
  rmSync(userData, { recursive: true, force: true });
});

async function submit(text: string) {
  const composer = page.getByRole("textbox", { name: "Task message" });
  await composer.fill(text);
  await composer.press("Enter");
}

test("keeps empty, focus, and 200% zoom states usable", async () => {
  const invalidRpc = await page.evaluate(() => (window as any).vibe.rpc("not-a-method"));
  expect(invalidRpc).toMatchObject({ ok: false, error: "Invalid RPC request" });

  const jobs = page.getByRole("button", { name: "Toggle background jobs" });
  await jobs.focus();
  const focusStyle = await jobs.evaluate((element) => {
    const style = getComputedStyle(element);
    return { outline: style.outlineStyle, shadow: style.boxShadow };
  });
  expect(focusStyle.outline).toBe("none");
  // Two-layer keyboard focus ring: surface gap + accent halo (no inset).
  expect(focusStyle.shadow).not.toBe("none");
  expect(focusStyle.shadow).toContain("0px 0px 0px 4px");

  await jobs.click();
  await expect(page.getByText("No background jobs are running.")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("textbox", { name: "Task message" })).toBeVisible();

  await page.evaluate(() => { document.documentElement.style.zoom = "2"; });
  await expect(page.getByRole("textbox", { name: "Task message" })).toBeVisible();
  await expect(jobs).toBeVisible();
  await page.evaluate(() => { document.documentElement.style.zoom = ""; });

  await page.emulateMedia({ reducedMotion: "reduce" });
  const duration = await jobs.evaluate((element) => getComputedStyle(element).animationDuration);
  expect(Number.parseFloat(duration)).toBeLessThanOrEqual(0.01);
  await page.emulateMedia({ reducedMotion: "no-preference" });

  await page.setViewportSize({ width: 820, height: 620 });
  await expect(page.getByRole("textbox", { name: "Task message" })).toBeVisible();
  await page.setViewportSize({ width: 1280, height: 820 });
});

test("renames, archives, and deletes saved sessions through host RPC", async () => {
  await expect(page.getByText("Saved one", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /^Saved one/ }).click({ button: "right" });
  await page.getByRole("menuitem", { name: "Rename" }).click();
  const rename = page.getByRole("textbox", { name: "Rename session" });
  await rename.fill("Renamed fixture");
  await rename.press("Enter");
  await expect(page.getByText("Renamed fixture", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: /^Renamed fixture/ }).click({ button: "right" });
  await page.getByRole("menuitem", { name: "Archive" }).click();
  await expect(page.getByText("Renamed fixture", { exact: true })).toHaveCount(0);

  await page.getByRole("button", { name: /^Saved two/ }).click({ button: "right" });
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await expect(page.getByText("Saved two", { exact: true })).toHaveCount(0);
});

test("streams reasoning, tools, diffs, markdown, telemetry, and engine-idle", async () => {
  await submit("fixture:stream");
  await expect(page.getByText("Done with markdown.")).toBeVisible();
  await expect(page.getByRole("button", { name: /edited src\/example\.ts/ })).toBeVisible();
  await expect(page.getByText("fixture:stream")).toBeVisible();
  await expect(page.getByText(/15 tok/)).toBeVisible();
  await expect(page.locator('.ctx-ring')).toContainText('10%');
  await expect(page.getByText("Vibe Codr is idle")).toBeAttached();
  await page.getByRole("button", { name: /Expand .*src\/example\.ts/ }).click();
  await expect(page.getByText("+ new")).toBeVisible();
  await expect(page.getByText("fixture command failed")).toBeVisible();
  const reasoning = page.getByRole("button", { name: /Expand Thought/ });
  await expect(reasoning).toBeVisible();
  await reasoning.click();
  await expect(page.getByText("Inspecting the fixture.", { exact: false })).toBeVisible();
});

test("contains hostile markdown and applies CLI theme events", async () => {
  const originalUrl = page.url();
  await submit("fixture:markdown");
  await expect(page.getByRole("link", { name: "safe" })).toHaveAttribute("href", "https://example.com/path");
  await expect(page.getByRole("link", { name: "unsafe" })).toHaveCount(0);
  await expect(page.locator("script")).toHaveCount(1); // application entry script only
  expect(await page.evaluate(() => (window as unknown as { fixtureInjected?: boolean }).fixtureInjected)).toBeUndefined();
  expect(page.url()).toBe(originalUrl);

  await submit("/theme light");
  await expect.poll(() => page.evaluate(() => document.documentElement.style.colorScheme)).toBe("light");
  const lightRoles = await page.evaluate(() => {
    const root = getComputedStyle(document.documentElement);
    const content = getComputedStyle(document.querySelector<HTMLElement>(".content-inset")!);
    const rail = getComputedStyle(document.querySelector<HTMLElement>(".project-rail")!);
    return {
      background: root.getPropertyValue("--bg").trim(),
      elevated: root.getPropertyValue("--elevated").trim(),
      muted: root.getPropertyValue("--muted").trim(),
      contentBackground: content.backgroundColor,
      railBackground: rail.backgroundColor,
    };
  });
  expect(lightRoles).toMatchObject({
    background: "#f8f8f7",
    elevated: "#ffffff",
    muted: "#5f6878",
  });
  expect(lightRoles.contentBackground).not.toBe("rgba(0, 0, 0, 0)");
  expect(lightRoles.railBackground).not.toBe("rgba(0, 0, 0, 0)");
});

test("resolves permission and plan cards from keyboard-accessible controls", async () => {
  await submit("fixture:permission");
  await expect(page.getByText(/Permission.*bash/)).toBeVisible();
  await page.getByRole("button", { name: /once/ }).click();
  await expect(page.getByText("permission once")).toBeVisible();

  await submit("fixture:plan");
  await expect(page.getByText("Plan approval")).toBeVisible();
  await expect(page.getByText("Ungrounded — presented without the research this request required")).toBeVisible();
  await expect(page.getByText("The fixture is writable")).toBeVisible();
  await page.getByRole("button", { name: /Accept Enter/ }).click();
  await expect(page.getByText("plan accept")).toBeVisible();
});

test("steers/removes queued work and suppresses stale output after clear", async () => {
  await submit("fixture:queue");
  await expect(page.getByText("Queued one")).toBeVisible();
  await page.getByRole("button", { name: "Remove Queued one from queue" }).click();
  await expect(page.getByText("Queued one")).toBeHidden();

  await submit("fixture:slow");
  await submit("/clear");
  await page.waitForTimeout(300);
  await expect(page.getByText("STALE OUTPUT")).toHaveCount(0);
});

test("renders task, subagent, source, job, and checkpoint activity in the correct surfaces", async () => {
  await submit("fixture:activity");
  await expect(page.getByText("Fixture activity complete.")).toBeVisible();
  await page.getByRole("button", { name: "Toggle background jobs" }).click();
  await expect(page.getByText("npm run dev")).toBeVisible();
  await expect(page.getByRole("link", { name: "http://localhost:4310" })).toBeVisible();
  await page.getByRole("button", { name: "Show session panel" }).click();
  await expect(page.getByText("Before fixture change")).toBeVisible();
  await expect(page.getByText(/Run fixture child/)).toBeVisible();
  const subagent = page.getByRole("button", { name: /Review the fixture/ });
  await expect(subagent).toBeVisible();
  await subagent.click();
  await expect(page.getByText("Subagent report: looks healthy.")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("complementary", { name: "Session details" })).toBeHidden();
  await page.getByRole("button", { name: "Toggle background jobs" }).click();
  await page.getByRole("button", { name: /Expand.*search.*fixture/ }).click();
  await expect(page.getByRole("link", { name: "Fixture search" })).toBeVisible();
});

test("attaches files, pastes images, and round-trips through the external editor", async () => {
  const composer = page.getByRole("textbox", { name: "Task message" });
  await composer.fill("Read @read");
  await expect(page.getByText("@README.md")).toBeVisible();
  await composer.press("ArrowDown");
  await composer.press("Tab");
  await expect(composer).toHaveValue("Read @README.md ");

  const clipboardState = await app.evaluate(({ clipboard, nativeImage }, imagePath) => {
    clipboard.clear();
    const image = nativeImage.createFromPath(imagePath);
    clipboard.writeImage(image);
    return { empty: clipboard.readImage().isEmpty(), text: clipboard.readText() };
  }, icon);
  expect(clipboardState).toEqual({ empty: false, text: "" });
  await composer.press("Meta+V");
  await expect(composer).toHaveValue(/@\.vibe\/clipboard\/vibe-clip-.*\.png/);
  expect(existsSync(join(projectDir, ".vibe", "clipboard"))).toBe(true);

  await composer.fill("before editor");
  await composer.press("Control+G");
  await expect(composer).toHaveValue("composed by fixture editor");
  await expect(composer).toBeFocused();
  rmSync(join(projectDir, ".vibe"), { recursive: true, force: true });
});

test("opens live model, provider, agent, skill, and MCP catalogs", async () => {
  const composer = page.getByRole("textbox", { name: "Task message" });
  await composer.fill("/model");
  await expect(page.getByRole("dialog", { name: /Models/ })).toBeVisible();
  await expect(page.getByText("Fixture Model")).toBeVisible();
  await page.keyboard.press("Escape");

  for (const [command, expected] of [
    ["/providers", "fixture"],
    ["/agents", "reviewer"],
    ["/skills", "fixture-skill"],
    ["/mcp", "fixture-mcp"],
  ] as const) {
    await composer.fill(command);
    await expect(page.getByText(expected, { exact: false }).first()).toBeVisible();
    await page.keyboard.press("Escape");
  }
});

test("recovers from a fatal host by starting a fresh session", async () => {
  await submit("fixture:fatal");
  await expect(page.getByText("fixture host failure", { exact: false }).first()).toBeVisible();
  await page.getByRole("button", { name: "New session" }).click();
  await expect(page.getByRole("textbox", { name: "Task message" })).toBeVisible();
  await submit("recovered");
  await expect(page.getByText("Echo: recovered")).toBeVisible();
});
