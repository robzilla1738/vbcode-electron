import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Structural guard: streaming markdown must not wire the Shiki CodeBlock
 * component (the 24ms stream hotspot). Static path still uses CodeBlock.
 */
describe("MarkdownView streaming cost", () => {
  const source = readFileSync(
    join(process.cwd(), "src/renderer/transcript/MarkdownView.tsx"),
    "utf8",
  );

  it("defines a StreamingCode path without CodeBlock", () => {
    expect(source).toContain("function StreamingCode");
    expect(source).toContain("streamingComponents");
    // Streaming components must use StreamingCode, not Code
    expect(source).toMatch(/streamingComponents[\s\S]*code:\s*StreamingCode/);
    // The StreamingCode body must not instantiate CodeBlock
    const streamingFn = source.slice(
      source.indexOf("function StreamingCode"),
      source.indexOf("const staticComponents"),
    );
    expect(streamingFn).not.toContain("<CodeBlock");
    expect(streamingFn).toContain("md-code-block-streaming");
  });

  it("keeps Shiki CodeBlock on the static path only", () => {
    expect(source).toMatch(/staticComponents[\s\S]*code:\s*Code/);
    expect(source).toContain("<CodeBlock");
  });
});
