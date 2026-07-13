import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Structural guard: streaming markdown must not reparse with Streamdown/Shiki
 * on every flush. Static path still uses Streamdown + CodeBlock.
 */
describe("MarkdownView streaming cost", () => {
  const source = readFileSync(
    join(process.cwd(), "src/renderer/transcript/MarkdownView.tsx"),
    "utf8",
  );

  it("uses a plain streaming path without Streamdown or CodeBlock", () => {
    expect(source).toContain("function StreamingPlain");
    expect(source).toContain("md-streaming-plain");
    // Streaming branch must not mount Streamdown
    const streamingBranch = source.slice(
      source.indexOf("if (streaming)"),
      source.indexOf("return (\n    <Streamdown"),
    );
    expect(streamingBranch).toContain("StreamingPlain");
    expect(streamingBranch).not.toContain("<Streamdown");
    expect(streamingBranch).not.toContain("<CodeBlock");
  });

  it("keeps Shiki CodeBlock on the static path only", () => {
    expect(source).toMatch(/staticComponents[\s\S]*code:\s*Code/);
    expect(source).toContain("<CodeBlock");
    expect(source).toContain('mode="static"');
  });
});
