import { describe, expect, it } from "vitest";
import { validateConfig } from "./config-validate";

describe("validateConfig", () => {
  it("accepts an empty config", () => {
    expect(validateConfig({})).toEqual([]);
  });

  it("accepts a valid config", () => {
    expect(
      validateConfig({
        model: "openai/gpt-5.5",
        mode: "execute",
        maxSteps: 64,
        providers: { openai: { apiKey: "sk-1", baseURL: "https://api.openai.com/v1" } },
      }),
    ).toEqual([]);
  });

  it("rejects a provider baseURL without a scheme", () => {
    const errs = validateConfig({ providers: { openai: { baseURL: "localhost:1234" } } });
    expect(errs.some((e) => e.includes("providers.openai.baseURL"))).toBe(true);
  });

  it("accepts an empty provider baseURL (unset)", () => {
    expect(validateConfig({ providers: { openai: { baseURL: "" } } })).toEqual([]);
  });

  it("rejects an MCP url without a host", () => {
    const errs = validateConfig({ mcp: { servers: { myserver: { url: "http://" } } } });
    expect(errs.some((e) => e.includes("mcp.servers.myserver.url"))).toBe(true);
  });

  it("accepts an MCP url with env-var reference", () => {
    expect(validateConfig({ mcp: { servers: { s: { url: "$" + "{MCP_URL}" } } } })).toEqual([]);
  });

  it("rejects a hook with neither command nor url", () => {
    const errs = validateConfig({ hooks: [{ event: "session.start" }] });
    expect(errs.some((e) => e.includes("hooks[0]"))).toBe(true);
  });

  it("rejects a hook with a non-http url", () => {
    const errs = validateConfig({ hooks: [{ event: "session.start", url: "ftp://x" }] });
    expect(errs.some((e) => e.includes("hooks[0].url"))).toBe(true);
  });

  it("rejects maxSteps below 1", () => {
    const errs = validateConfig({ maxSteps: 0 });
    expect(errs.some((e) => e.includes("maxSteps"))).toBe(true);
  });

  it("rejects NaN maxSteps", () => {
    const errs = validateConfig({ maxSteps: NaN });
    expect(errs.some((e) => e.includes("maxSteps"))).toBe(true);
  });

  it("rejects an invalid mode enum", () => {
    const errs = validateConfig({ mode: "yolo" });
    expect(errs.some((e) => e.includes("mode"))).toBe(true);
  });

  it("rejects an invalid approvalMode enum", () => {
    const errs = validateConfig({ approvalMode: "always" });
    expect(errs.some((e) => e.includes("approvalMode"))).toBe(true);
  });

  it("rejects compaction threshold out of range", () => {
    const errs = validateConfig({ compaction: { threshold: 1.5 } });
    expect(errs.some((e) => e.includes("compaction.threshold"))).toBe(true);
  });

  it("rejects an invalid build gate check", () => {
    const errs = validateConfig({ build: { gate: { checks: ["typecheck", "invalid"] } } });
    expect(errs.some((e) => e.includes("build.gate.checks"))).toBe(true);
  });

  it("accepts valid build gate checks", () => {
    expect(validateConfig({ build: { gate: { checks: ["typecheck", "test", "build"] } } })).toEqual([]);
  });

  it("rejects enabled stdio MCP servers without a command", () => {
    const errs = validateConfig({
      mcp: { servers: { fs: { command: "", args: [] } } },
    });
    expect(errs.some((e) => e.includes("mcp.servers.fs.command"))).toBe(true);
  });

  it("allows disabled stdio MCP servers with empty command", () => {
    expect(
      validateConfig({
        mcp: { servers: { fs: { command: "", args: [], enabled: false } } },
      }),
    ).toEqual([]);
  });

  it("rejects enabled remote MCP servers without a url", () => {
    const errs = validateConfig({
      mcp: { servers: { remote: { url: "" } } },
    });
    expect(errs.some((e) => e.includes("mcp.servers.remote.url"))).toBe(true);
  });
});
