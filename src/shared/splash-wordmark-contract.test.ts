import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("responsive splash wordmark", () => {
  const splash = readFileSync(join(process.cwd(), "src/renderer/layout/Splash.tsx"), "utf8");
  const styles = readFileSync(join(process.cwd(), "src/renderer/styles.css"), "utf8");

  it("keeps the stylized wordmark at every window size", () => {
    expect(splash).toContain('className="splash-wordmark"');
    expect(splash).not.toContain("splash-brand-compact");
    expect(styles).not.toContain(".splash-brand-compact");
    expect(styles).not.toMatch(/\.splash-wordmark\s*\{[^}]*display:\s*none;/s);
    expect(styles).toMatch(/\.splash-wordmark\s*\{[^}]*font-size:\s*clamp\(4px, 2cqi, 8\.5px\);/s);
  });
});
