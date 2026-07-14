import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("settings draft persistence contract", () => {
  const panel = readFileSync(
    join(process.cwd(), "src/renderer/settings/SettingsPanel.tsx"),
    "utf8",
  );
  const controls = readFileSync(
    join(process.cwd(), "src/renderer/settings/FormControls.tsx"),
    "utf8",
  );
  const mcp = readFileSync(
    join(process.cwd(), "src/renderer/settings/sections/McpSection.tsx"),
    "utf8",
  );
  const providers = readFileSync(
    join(process.cwd(), "src/renderer/settings/sections/ProvidersSection.tsx"),
    "utf8",
  );

  it("keeps config sections mounted across navigation", () => {
    expect(panel).toContain('CONFIG_SECTIONS.filter(({ id }) => id !== "instructions").map');
    expect(panel).toContain("hidden={activeSection !== id}");
  });

  it("includes malformed key/value drafts in the dirty and save guards", () => {
    expect(controls).toContain("onInvalidDraftChange?.(resetKey, true)");
    expect(panel).toContain("invalidDraftsRef.current.size > 0");
    expect(panel).toContain("state.saving || invalidDrafts.size > 0");
  });

  it("keeps provider and MCP field editors mounted while cards collapse", () => {
    expect(mcp).toContain("hidden={!isExpanded}");
    expect(providers).toContain("hidden={!isExpanded}");
  });
});
