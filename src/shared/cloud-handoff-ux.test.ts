import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import type { CloudFailureDetails, CloudStatusEvent } from "./cloud";
import {
  CLOUD_STARTUP_STAGES,
  cloudHandoffActionLabel,
  cloudStatusBelongsToSession,
} from "./cloud-progress";

describe("cloud handoff progress UX", () => {
  test("orders the complete startup story from ownership boundary through connection", () => {
    expect(CLOUD_STARTUP_STAGES.map((stage) => stage.id)).toEqual([
      "waiting",
      "packaging",
      "creating",
      "uploading",
      "verifying",
      "restoring",
      "starting-agent",
      "checking-health",
      "connecting",
    ]);
  });

  test("rejects status events from a different active session", () => {
    const event: CloudStatusEvent = { sessionId: "session-b", status: "starting", message: "Starting", stage: "starting-agent" };
    expect(cloudStatusBelongsToSession(event, "session-a")).toBe(false);
    expect(cloudStatusBelongsToSession({ ...event, sessionId: "session-a" }, "session-a")).toBe(true);
  });

  test("offers retry only for a safely retryable failure and returns to progress on retry", () => {
    const retryable: CloudFailureDetails = { code: "daemon-exited", stage: "starting-agent", retryable: true, diagnostic: "missing module" };
    expect(cloudHandoffActionLabel(false, "Cloud agent stopped", retryable)).toBe("Try again");
    expect(cloudHandoffActionLabel(true, null, null)).toBe("Preparing handoff…");
    expect(cloudHandoffActionLabel(false, "Cleanup unresolved", { ...retryable, retryable: false })).toBe("Recovery required");
  });

  test("keeps the transition dialog keyboard-safe and announces live status and failures", () => {
    const sheet = readFileSync(join(process.cwd(), "src/renderer/panels/CloudHandoffSheet.tsx"), "utf8");
    expect(sheet).toContain('role="dialog"');
    expect(sheet).toContain('aria-modal="true"');
    expect(sheet).toContain('aria-live="polite"');
    expect(sheet).toContain('aria-atomic="true"');
    expect(sheet).toContain('role="alert"');
    expect(sheet).toContain("disabled={working}");
    expect(sheet).toContain("Technical details");
    expect(sheet).toContain("Close and recover in Settings");
    expect(sheet).toContain("working || recoveryRequired");
    expect(sheet).toContain("Move work to Cloud");
    expect(sheet).toContain("Only portable project state moves");
    expect(sheet).toContain("Stays on this Mac");
    expect(sheet).toContain('role="radiogroup"');
  });

  test("keeps Local and Cloud selection in the main composer", () => {
    const composer = readFileSync(join(process.cwd(), "src/renderer/composer/Composer.tsx"), "utf8");
    expect(composer).toContain('className="execution-target-toggle"');
    expect(composer).toContain('role="radiogroup"');
    expect(composer).toContain('(["local", "cloud"] as const)');
    expect(composer).toContain("onExecutionTargetChange(target)");
  });

  test("uses one rounded-rectangle control family across the composer footer", () => {
    const styles = readFileSync(join(process.cwd(), "src/renderer/styles.css"), "utf8");
    expect(styles).toContain("Composer controls share the Local / Cloud geometry");
    expect(styles).toMatch(/\.composer-chip,[\s\S]*?border-radius:\s*var\(--radius-sm\);[\s\S]*?background:\s*color-mix\(in oklab, var\(--surface-subtle\) 68%, transparent\);/);
    expect(styles).toMatch(/\.composer-ghost\s*\{[\s\S]*?border-radius:\s*var\(--radius-sm\);/);
    expect(styles).toMatch(/\.composer-submit\s*\{[\s\S]*?border-radius:\s*var\(--radius-sm\);/);
  });
});
