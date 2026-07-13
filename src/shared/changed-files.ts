/**
 * Display helpers for session changed-file review (turn card + inspector).
 */

export interface ChangedFileLike {
  path: string;
  added: number;
  removed: number;
  diff?: string;
}

export function fileBasename(path: string): string {
  const parts = path.replace(/\\/g, "/").split("/").filter(Boolean);
  return parts.at(-1) || path;
}

/** Parent path for secondary label (empty when path is a bare filename). */
export function fileParentDir(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  const idx = normalized.lastIndexOf("/");
  if (idx <= 0) return "";
  return normalized.slice(0, idx);
}

export function changedFilesTotals(files: readonly ChangedFileLike[]): {
  count: number;
  added: number;
  removed: number;
} {
  let added = 0;
  let removed = 0;
  for (const f of files) {
    added += f.added || 0;
    removed += f.removed || 0;
  }
  return { count: files.length, added, removed };
}

/** Stable display order: largest absolute churn first, then path. */
export function sortChangedFilesForDisplay<T extends ChangedFileLike>(
  files: readonly T[],
): T[] {
  return [...files].sort((a, b) => {
    const scoreA = Math.abs(a.added) + Math.abs(a.removed);
    const scoreB = Math.abs(b.added) + Math.abs(b.removed);
    if (scoreB !== scoreA) return scoreB - scoreA;
    return a.path.localeCompare(b.path);
  });
}

/** Header label: "3 files changed · +40 −19" */
export function changedFilesHeading(files: readonly ChangedFileLike[]): string {
  const { count, added, removed } = changedFilesTotals(files);
  if (count === 0) return "No files changed";
  const noun = count === 1 ? "file" : "files";
  return `${count} ${noun} changed · +${added} −${removed}`;
}
