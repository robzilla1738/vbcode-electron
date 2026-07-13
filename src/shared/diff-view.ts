/**
 * Unified-diff parsing for the Session panel review view.
 * Pure and unit-tested so gutter numbers and line kinds stay correct.
 */

export type DiffLineKind = "add" | "del" | "ctx" | "hunk" | "meta" | "header";

export interface DiffViewLine {
  kind: DiffLineKind;
  /** Raw line text as stored (including leading +/-/space). */
  text: string;
  /** Left gutter: old-file line number, or null for non-body lines. */
  oldNo: number | null;
  /** Right gutter: new-file line number, or null for non-body lines. */
  newNo: number | null;
}

const HUNK_RE = /^@@\s+-(\d+)(?:,\d+)?\s+\+(\d+)(?:,\d+)?\s+@@/;

/**
 * Classify a single unified-diff line. Order matters: file headers that start
 * with `---` / `+++` must not be treated as deletions/additions.
 */
export function classifyDiffLine(line: string): DiffLineKind {
  if (line.startsWith("@@")) return "hunk";
  if (
    line.startsWith("diff ") ||
    line.startsWith("index ") ||
    line.startsWith("similarity ") ||
    line.startsWith("rename ") ||
    line.startsWith("new file") ||
    line.startsWith("deleted file") ||
    line.startsWith("--- ") ||
    line.startsWith("+++ ") ||
    line.startsWith("Binary files ")
  ) {
    return "header";
  }
  if (line.startsWith("\\")) return "meta"; // "\ No newline at end of file"
  if (line.startsWith("+")) return "add";
  if (line.startsWith("-")) return "del";
  // Context lines usually start with a space; bare lines are treated as context.
  return "ctx";
}

/**
 * Parse a unified diff into display rows with old/new line numbers.
 * Empty or missing body returns [].
 */
export function parseUnifiedDiff(diff: string | undefined | null): DiffViewLine[] {
  if (!diff) return [];
  // Preserve trailing empty line only if the source ends with \n\n; split keeps
  // a final empty element when the string ends with \n — drop a single trailing empty.
  const raw = diff.split("\n");
  if (raw.length > 0 && raw[raw.length - 1] === "") raw.pop();

  const out: DiffViewLine[] = [];
  let oldNo = 0;
  let newNo = 0;
  let inHunk = false;

  for (const text of raw) {
    const kind = classifyDiffLine(text);

    if (kind === "hunk") {
      const m = HUNK_RE.exec(text);
      if (m) {
        oldNo = Number(m[1]);
        newNo = Number(m[2]);
        inHunk = true;
      }
      out.push({ kind, text, oldNo: null, newNo: null });
      continue;
    }

    if (kind === "header" || kind === "meta" || !inHunk) {
      // Before the first hunk, everything is header/meta chrome.
      out.push({
        kind: kind === "ctx" || kind === "add" || kind === "del" ? "header" : kind,
        text,
        oldNo: null,
        newNo: null,
      });
      continue;
    }

    if (kind === "add") {
      out.push({ kind, text, oldNo: null, newNo });
      newNo += 1;
      continue;
    }
    if (kind === "del") {
      out.push({ kind, text, oldNo, newNo: null });
      oldNo += 1;
      continue;
    }
    // context
    out.push({ kind: "ctx", text, oldNo, newNo });
    oldNo += 1;
    newNo += 1;
  }

  return out;
}

/** Human stats line for a file row or empty-diff fallback. */
export function formatDiffStats(added: number, removed: number): string {
  return `+${added} −${removed}`;
}
