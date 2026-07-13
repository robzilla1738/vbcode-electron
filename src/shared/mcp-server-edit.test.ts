import { describe, expect, it } from "vitest";
import { mcpServerTypeTemplate } from "./mcp-server-edit";

describe("mcpServerTypeTemplate", () => {
  it("preserves enabled:false when switching stdio → remote", () => {
    const next = mcpServerTypeTemplate("remote", {
      command: "",
      args: [],
      enabled: false,
    });
    expect(next).toEqual({ url: "https://example.invalid/mcp", enabled: false, timeoutMs: undefined });
    expect(next.enabled).toBe(false);
  });

  it("preserves enabled:false and timeoutMs when switching remote → stdio", () => {
    const next = mcpServerTypeTemplate("stdio", {
      url: "https://example.com/mcp",
      enabled: false,
      timeoutMs: 5000,
    });
    expect(next).toMatchObject({
      command: "",
      args: [],
      enabled: false,
      timeoutMs: 5000,
    });
    expect("url" in next).toBe(false);
  });

  it("disables a filled stdio server while its new remote endpoint is reviewed", () => {
    const next = mcpServerTypeTemplate("remote", {
      command: "npx",
      args: ["-y", "pkg"],
      enabled: true,
      timeoutMs: 1000,
    });
    expect(next).toMatchObject({
      url: "https://example.invalid/mcp",
      enabled: false,
      timeoutMs: 1000,
    });
  });
});
