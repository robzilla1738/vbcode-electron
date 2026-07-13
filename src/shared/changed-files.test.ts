import { describe, expect, it } from "vitest";
import {
  changedFilesHeading,
  changedFilesTotals,
  fileBasename,
  fileParentDir,
  sortChangedFilesForDisplay,
} from "./changed-files";

describe("changed-files display helpers", () => {
  const files = [
    { path: "src/a.ts", added: 2, removed: 1 },
    { path: "src/deep/b.ts", added: 20, removed: 5 },
    { path: "README.md", added: 0, removed: 3 },
  ];

  it("basename and parent", () => {
    expect(fileBasename("src/deep/b.ts")).toBe("b.ts");
    expect(fileParentDir("src/deep/b.ts")).toBe("src/deep");
    expect(fileParentDir("README.md")).toBe("");
  });

  it("totals and heading", () => {
    expect(changedFilesTotals(files)).toEqual({ count: 3, added: 22, removed: 9 });
    expect(changedFilesHeading(files)).toBe("3 files changed · +22 −9");
    expect(changedFilesHeading([])).toBe("No files changed");
    expect(changedFilesHeading([files[0]!])).toBe("1 file changed · +2 −1");
  });

  it("sorts by churn then path", () => {
    expect(sortChangedFilesForDisplay(files).map((f) => f.path)).toEqual([
      "src/deep/b.ts",
      "README.md",
      "src/a.ts",
    ]);
  });
});
