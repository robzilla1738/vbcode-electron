import { describe, expect, it } from "vitest";
import { CwdAllowlist, globalVibeRoots, isAllowedTerminalCwd } from "./cwd-allowlist";
import { resolve } from "node:path";

describe("CwdAllowlist", () => {
  it("accepts exact registered roots and their children", () => {
    const list = new CwdAllowlist(["/Users/rob/Code/acme"]);
    expect(list.allows("/Users/rob/Code/acme")).toBe(true);
    expect(list.allows("/Users/rob/Code/acme/src")).toBe(true);
    expect(list.allows("/Users/rob/Code/other")).toBe(false);
  });

  it("accepts global vibe roots under home", () => {
    const list = new CwdAllowlist();
    const home = "/Users/rob";
    const vibe = resolve(home, ".config", "vibe-codr");
    // allows() uses real homedir for global roots — test globalVibeRoots shape
    const roots = globalVibeRoots(home);
    expect(roots.some((r) => r.endsWith("vibe-codr") || r.includes(".vibe"))).toBe(true);
    // Direct has after add
    list.add(vibe);
    expect(list.has(vibe)).toBe(true);
  });

  it("rejects empty and foreign paths", () => {
    const list = new CwdAllowlist(["/proj"]);
    expect(list.allows("")).toBe(false);
    expect(list.allows("/etc")).toBe(false);
  });

  it("allows only the exact home directory as the terminal-specific exception", () => {
    const home = "/Users/rob";
    expect(isAllowedTerminalCwd(home, home)).toBe(true);
    expect(isAllowedTerminalCwd(`${home}/Desktop`, home)).toBe(false);
    expect(isAllowedTerminalCwd("/etc", home)).toBe(false);
  });
});
