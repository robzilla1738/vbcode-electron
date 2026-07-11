/**
 * Screenshot every UI-preview scenario with headless Chromium.
 *
 *   node tools/ui-preview/shoot.mjs [outDir]
 *
 * Expects the preview dev server to be running:
 *   npx vite --config tools/ui-preview/vite.config.ts
 */
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";

const BASE = process.env.PREVIEW_URL ?? "http://localhost:4517";
const OUT = process.argv[2] ?? "tools/ui-preview/shots";

/** [name, query, viewport] — wide viewports exercise the live activity rail. */
const SHOTS = [
  ["welcome", "scenario=welcome", { width: 1440, height: 900 }],
  ["splash", "scenario=splash", { width: 1440, height: 900 }],
  ["chat", "scenario=chat", { width: 1440, height: 900 }],
  ["busy", "scenario=busy", { width: 1440, height: 900 }],
  ["busy-narrow", "scenario=busy", { width: 1100, height: 900 }],
  ["busy-wide", "scenario=busy", { width: 1720, height: 1000 }],
  ["permission", "scenario=permission", { width: 1440, height: 900 }],
  ["plan", "scenario=plan", { width: 1440, height: 900 }],
  ["gate", "scenario=gate", { width: 1440, height: 900 }],
  ["mode", "scenario=mode", { width: 1440, height: 900 }],
  ["queue", "scenario=queue", { width: 1440, height: 900 }],
  ["onboarding", "scenario=onboarding", { width: 1440, height: 900 }],
  ["slash", "scenario=slash", { width: 1440, height: 900 }],
  ["catalog", "scenario=catalog", { width: 1440, height: 900 }],
  ["catalog-draft", "scenario=catalog-draft", { width: 1440, height: 900 }],
  ["mention", "scenario=mention", { width: 1440, height: 900 }],
  ["jobs", "scenario=jobs", { width: 1440, height: 900 }],
  ["inspector", "scenario=inspector", { width: 1720, height: 1000 }],
  ["toast", "scenario=toast", { width: 1440, height: 900 }],
  ["density-quiet", "scenario=density-quiet", { width: 1440, height: 900 }],
  ["density-verbose", "scenario=density-verbose", { width: 1440, height: 900 }],
  ["ctx-hot", "scenario=ctx-hot", { width: 1100, height: 900 }],
  ["light", "scenario=light&theme=light", { width: 1440, height: 900 }],
  ["theme-opencode", "scenario=chat&theme=opencode", { width: 1440, height: 900 }],
];

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch();

for (const [name, query, viewport] of SHOTS) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 2 });
  await page.goto(`${BASE}/?${query}`, { waitUntil: "domcontentloaded" });
  try {
    await page.waitForFunction(() => window.__previewSettled === true, undefined, { timeout: 20_000 });
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${OUT}/${name}.png`, animations: "disabled" });
    console.log(`✓ ${name}`);
  } catch (err) {
    console.error(`✗ ${name}: ${err instanceof Error ? err.message : err}`);
  }
  await page.close();
}

await browser.close();
