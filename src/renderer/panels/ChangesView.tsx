import { useEffect, useMemo, useState } from "react";
import {
  changedFilesTotals,
  fileBasename,
  fileParentDir,
  sortChangedFilesForDisplay,
} from "../../shared/changed-files";
import type { ChangedFile } from "../../shared/reducer";
import { CopyButton } from "../CopyButton";
import {
  IconArrowRight,
  IconChevron,
  IconClose,
  IconFile,
  IconFolderOpen,
  IconSearch,
} from "../icons";
import { DiffPreview } from "./DiffPreview";

type ReviewMode = "diff" | "file";

interface FileGroup {
  directory: string;
  files: ChangedFile[];
  added: number;
  removed: number;
}

function groupFiles(files: ChangedFile[]): FileGroup[] {
  const groups = new Map<string, ChangedFile[]>();
  for (const file of files) {
    const directory = fileParentDir(file.path) || "Root";
    const current = groups.get(directory) ?? [];
    current.push(file);
    groups.set(directory, current);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => (a === "Root" ? -1 : b === "Root" ? 1 : a.localeCompare(b)))
    .map(([directory, group]) => {
      const totals = changedFilesTotals(group);
      return { directory, files: group, added: totals.added, removed: totals.removed };
    });
}

export function ChangesView({
  files,
  cwd,
  focusPath,
  onClose,
  onRevealFile,
}: {
  files: ChangedFile[];
  cwd: string | null;
  focusPath?: string | null;
  onClose: () => void;
  onRevealFile: (path: string) => void;
}) {
  const orderedFiles = useMemo(() => sortChangedFilesForDisplay(files), [files]);
  const [selectedPath, setSelectedPath] = useState<string | null>(
    focusPath ?? orderedFiles[0]?.path ?? null,
  );
  const [reviewMode, setReviewMode] = useState<ReviewMode>("diff");
  const [query, setQuery] = useState("");
  const [previewText, setPreviewText] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewTruncated, setPreviewTruncated] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);

  const totals = useMemo(() => changedFilesTotals(files), [files]);
  const normalizedQuery = query.trim().toLowerCase();
  const filteredFiles = useMemo(
    () => orderedFiles.filter((file) => !normalizedQuery || file.path.toLowerCase().includes(normalizedQuery)),
    [normalizedQuery, orderedFiles],
  );
  const groups = useMemo(() => groupFiles(filteredFiles), [filteredFiles]);
  const selectedFile = selectedPath ? files.find((file) => file.path === selectedPath) : undefined;
  const selectedIndex = selectedPath
    ? orderedFiles.findIndex((file) => file.path === selectedPath)
    : -1;
  const previousFile = selectedIndex > 0 ? orderedFiles[selectedIndex - 1] : null;
  const nextFile =
    selectedIndex >= 0 && selectedIndex < orderedFiles.length - 1
      ? orderedFiles[selectedIndex + 1]
      : null;
  const selectedDirectory = selectedPath ? fileParentDir(selectedPath) : "";
  const totalChurn = totals.added + totals.removed;
  const addedShare = totalChurn > 0 ? (100 * totals.added) / totalChurn : 0;

  useEffect(() => {
    if (focusPath && files.some((file) => file.path === focusPath)) {
      setSelectedPath(focusPath);
      setReviewMode("diff");
    }
  }, [files, focusPath]);

  useEffect(() => {
    if (selectedPath && files.some((file) => file.path === selectedPath)) return;
    setSelectedPath(orderedFiles[0]?.path ?? null);
  }, [files, orderedFiles, selectedPath]);

  useEffect(() => {
    if (!selectedPath || !cwd || reviewMode !== "file") {
      setPreviewText(null);
      setPreviewError(null);
      setPreviewTruncated(false);
      return;
    }
    let cancelled = false;
    setPreviewLoading(true);
    setPreviewError(null);
    void window.vibe.readTextFile({ cwd, path: selectedPath }).then((result) => {
      if (cancelled) return;
      if (!result.ok) {
        setPreviewText(null);
        setPreviewError(result.error);
        setPreviewTruncated(false);
        return;
      }
      setPreviewText(result.text);
      setPreviewError(null);
      setPreviewTruncated(result.truncated);
    }).finally(() => {
      if (!cancelled) setPreviewLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [cwd, reviewMode, selectedPath]);

  const selectFile = (path: string) => {
    setSelectedPath(path);
    setReviewMode("diff");
  };

  return (
    <section
      id="changes-panel"
      className="activity-rail changes-rail"
      aria-label="Changed files review"
      aria-labelledby="changes-title"
    >
      <header className="changes-header">
        <div className="changes-heading-copy">
          <div className="changes-title-line">
            <h2 id="changes-title">Changes</h2>
            <span className="changes-count">{totals.count}</span>
          </div>
          <div className="changes-summary">
            <span>{totals.count === 1 ? "1 file" : `${totals.count} files`}</span>
            <span className="diff-add-count">+{totals.added}</span>
            <span className="diff-del-count">−{totals.removed}</span>
          </div>
        </div>
        <button
          type="button"
          className="icon-button sidebar-close"
          onClick={onClose}
          aria-label="Close changes panel"
          title="Close changes panel"
        >
          <IconClose size={14} />
        </button>
      </header>

      <div className="changes-balance" aria-label={`${totals.added} additions and ${totals.removed} deletions`}>
        {totalChurn > 0 ? (
          <>
            <span className="changes-balance-add" style={{ width: `${addedShare}%` }} />
            <span className="changes-balance-del" style={{ width: `${100 - addedShare}%` }} />
          </>
        ) : null}
      </div>

      <div className="changes-toolbar">
        <label className="changes-search">
          <IconSearch size={13} />
          <span className="sr-only">Filter changed files</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filter files…"
          />
        </label>
        <div className="review-mode-toggle" role="tablist" aria-label="Review mode">
          <button
            type="button"
            className={`review-mode-button${reviewMode === "diff" ? " is-active" : ""}`}
            role="tab"
            aria-selected={reviewMode === "diff"}
            onClick={() => setReviewMode("diff")}
            disabled={!selectedFile}
          >
            Diff
          </button>
          <button
            type="button"
            className={`review-mode-button${reviewMode === "file" ? " is-active" : ""}`}
            role="tab"
            aria-selected={reviewMode === "file"}
            onClick={() => setReviewMode("file")}
            disabled={!selectedFile}
          >
            File
          </button>
        </div>
      </div>

      <div className="changes-workspace">
        <div className="changes-review-pane">
          {selectedFile ? (
            <>
              <div className="changes-file-header">
                <div className="changes-file-identity">
                  {selectedDirectory ? <span className="changes-file-directory">{selectedDirectory}/</span> : null}
                  <strong title={selectedFile.path}>{fileBasename(selectedFile.path)}</strong>
                  <span className="file-diff" aria-label={`${selectedFile.added} additions, ${selectedFile.removed} deletions`}>
                    <span className="diff-add-count">+{selectedFile.added}</span>
                    <span className="diff-del-count">−{selectedFile.removed}</span>
                  </span>
                </div>
                <div className="changes-file-actions">
                  <div className="changes-file-nav" role="group" aria-label="Navigate changed files">
                    <button
                      type="button"
                      className="icon-button changes-nav-previous"
                      disabled={!previousFile}
                      onClick={() => previousFile && selectFile(previousFile.path)}
                      aria-label="Previous changed file"
                      title={previousFile ? `Previous · ${previousFile.path}` : "No previous file"}
                    >
                      <IconArrowRight size={13} />
                    </button>
                    <span>{selectedIndex + 1} / {orderedFiles.length}</span>
                    <button
                      type="button"
                      className="icon-button"
                      disabled={!nextFile}
                      onClick={() => nextFile && selectFile(nextFile.path)}
                      aria-label="Next changed file"
                      title={nextFile ? `Next · ${nextFile.path}` : "No next file"}
                    >
                      <IconArrowRight size={13} />
                    </button>
                  </div>
                  <button
                    type="button"
                    className="button changes-reveal"
                    onClick={() => onRevealFile(selectedFile.path)}
                    title="Reveal in Finder"
                  >
                    <IconFolderOpen size={13} />
                    <span>Reveal</span>
                  </button>
                  {reviewMode === "diff" && selectedFile.diff ? (
                    <CopyButton text={selectedFile.diff} label="Copy diff" />
                  ) : null}
                </div>
              </div>

              <div className="changes-review-content">
                {reviewMode === "diff" ? (
                  <DiffPreview
                    path={selectedFile.path}
                    diff={selectedFile.diff}
                    added={selectedFile.added}
                    removed={selectedFile.removed}
                    hideFileHeaders
                    fill
                  />
                ) : previewLoading ? (
                  <p className="changes-loading"><span className="spinner" aria-hidden /> Loading file…</p>
                ) : previewError ? (
                  <p className="changes-loading is-error" role="alert">Couldn’t load file · {previewError}</p>
                ) : (
                  <pre
                    className="changes-file-preview"
                    role="region"
                    // biome-ignore lint/a11y/noNoninteractiveTabindex: keyboard-scrollable file preview
                    tabIndex={0}
                    aria-label={`Current contents of ${selectedFile.path}`}
                  >
                    {previewText || "This file is empty."}
                  </pre>
                )}
                {reviewMode === "file" && previewTruncated ? (
                  <p className="changes-truncated">Showing the first 64 KB.</p>
                ) : null}
              </div>
            </>
          ) : (
            <div className="changes-empty">
              <IconFile size={20} />
              <strong>No changed files</strong>
              <span>Files edited during this session will appear here.</span>
            </div>
          )}
        </div>

        <aside className="changes-file-browser" aria-label="Changed files">
          <div className="changes-browser-heading">
            <span>Files</span>
            <span>{filteredFiles.length}</span>
          </div>
          <div className="changes-file-groups">
            {groups.length > 0 ? groups.map((group) => (
              <details className="changes-file-group" key={group.directory} open>
                <summary>
                  <span className="changes-group-chevron" aria-hidden><IconChevron size={12} /></span>
                  <span className="changes-group-name" title={group.directory}>{group.directory}</span>
                  <span className="changes-group-dot" aria-hidden />
                </summary>
                <div className="changes-group-files">
                  {group.files.map((file) => (
                    <button
                      type="button"
                      className={`changes-file-row${file.path === selectedPath ? " is-selected" : ""}`}
                      key={file.path}
                      onClick={() => selectFile(file.path)}
                      aria-current={file.path === selectedPath ? "true" : undefined}
                      title={file.path}
                    >
                      <IconFile size={13} />
                      <span className="changes-file-row-name">{fileBasename(file.path)}</span>
                      <span className="changes-file-row-stats" aria-hidden>
                        {file.added > 0 ? <span className="diff-add-count">+{file.added}</span> : null}
                        {file.removed > 0 ? <span className="diff-del-count">−{file.removed}</span> : null}
                      </span>
                    </button>
                  ))}
                </div>
              </details>
            )) : (
              <p className="changes-filter-empty">No files match “{query}”.</p>
            )}
          </div>
        </aside>
      </div>
    </section>
  );
}
