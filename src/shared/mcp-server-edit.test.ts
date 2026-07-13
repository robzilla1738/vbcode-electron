import { describe, expect, it } from "vitest";
import { mcpServerTypeTemplate } from "./mcp-server-edit";

describe("mcpServerTypeTemplate", () => {
  it("preserves enabled:false when switching stdio → remote", () => {
    const next = mcpServerTypeTemplate("remote", {
      command: "",
      args: [],
      enabled: false,
    });
    expect(next).toEqual({ url: "", enabled: false, timeoutMs: undefined });
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

  it("preserves enabled when switching a filled stdio server to remote", () => {
    const next = mcpServerTypeTemplate("remote", {
      command: "npx",
      args: ["-y", "pkg"],
      enabled: true,
      timeoutMs: 1000,
    });
    expect(next).toMatchObject({ url: "", enabled: true, timeoutMs: 1000 });
  });
});
