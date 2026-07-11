import { useEffect, useMemo, useRef, useState, type CSSProperties, type Dispatch, type SetStateAction } from "react";
import { ArrowUp, Paperclip, Square, Terminal } from "lucide-react";
import {
  applyPalette,
  isExactCommand,
  paletteState,
  type PaletteState,
} from "../../shared/commands-catalog";
import {
  agentsPickerQuery,
  mcpPickerQuery,
  modelPicker,
  providersPickerQuery,
  skillsPickerFilter,
} from "../../shared/catalog-draft";
import { accentNameOf } from "../../shared/themes";
import { applyAtMention, useAtMention } from "../hooks/useAtMention";
import { applyComposerPaste } from "../../shared/composer-edit";

function isCatalogDraft(draft: string): boolean {
  return (
    modelPicker(draft) != null ||
    providersPickerQuery(draft) != null ||
    agentsPickerQuery(draft) != null ||
    skillsPickerFilter(draft) != null ||
    mcpPickerQuery(draft) != null
  );
}

function navigateCatalog(direction: 1 | -1): void {
  window.dispatchEvent(new CustomEvent("vibe-catalog-nav", { detail: direction }));
}

function confirmCatalog(): boolean {
  window.dispatchEvent(new CustomEvent("vibe-catalog-confirm"));
  return true;
}

function currentValueFor(
  name: string,
  opts: {
    theme: string;
    accent: string;
    approvals: "ask" | "auto";
    density: string;
    reasoning?: string;
  },
): string | undefined {
  if (name === "theme") return opts.theme;
  if (name === "approvals") return opts.approvals;
  if (name === "reasoning") return opts.reasoning ?? "off";
  if (name === "details") return opts.density;
  if (name === "mouse") return undefined; // no-op in Electron
  if (name === "accent") return accentNameOf(opts.accent);
  return undefined;
}

function fileParts(path: string): { base: string; dir: string } {
  const normalized = path.replace(/\\/g, "/");
  const slash = normalized.lastIndexOf("/");
  if (slash < 0) return { base: normalized, dir: "" };
  return { base: normalized.slice(slash + 1), dir: normalized.slice(0, slash) };
}

function displayModeLabel(label: string): string {
  return label.length > 1 ? `${label.slice(0, 1)}${label.slice(1).toLowerCase()}` : label;
}

export function Composer({
  modeLabel,
  draft,
  setDraft,
  onSubmit,
  onCycleMode,
  disabled,
  commandNames,
  cwd,
  model,
  theme,
  accent,
  approvals,
  density,
  reasoning,
  status,
  ctxPct,
  busy,
  onAbort,
  onPasteError,
}: {
  modeLabel: string;
  draft: string;
  setDraft: Dispatch<SetStateAction<string>>;
  onSubmit: (line: string) => void;
  onCycleMode: () => void;
  disabled?: boolean;
  commandNames: string[];
  cwd: string | null;
  model: string;
  theme: string;
  accent: string;
  approvals: "ask" | "auto";
  density: string;
  reasoning?: string;
  status: string;
  /** Context-window fill 0–100, or null before the first turn. */
  ctxPct?: number | null;
  busy: boolean;
  onAbort: () => void;
  onPasteError: (message: string) => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [sel, setSel] = useState(0);
  const nameSet = useMemo(
    () => new Set(commandNames.map((n) => n.toLowerCase())),
    [commandNames],
  );
  const palette: PaletteState = useMemo(() => {
    if (isCatalogDraft(draft)) return { open: false };
    return paletteState(draft, commandNames);
  }, [draft, commandNames]);
  const exact = isExactCommand(draft, nameSet);
  const { mention, files, loading: filesLoading, error: filesError } = useAtMention(draft, cwd);
  const atOpen = mention != null && !palette.open;
  const currentValue = palette.open && palette.mode === "value"
    ? currentValueFor(palette.command.name, { theme, accent, approvals, density, reasoning })
    : undefined;

  useEffect(() => {
    setSel(0);
  }, [draft]);

  useEffect(() => {
    if (palette.open && palette.mode === "value" && currentValue) {
      const idx = palette.items.indexOf(currentValue);
      if (idx >= 0) setSel(idx);
    }
  }, [palette.open && palette.mode === "value" ? palette.command.name : "", currentValue]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 192)}px`;
  }, [draft]);

  useEffect(() => {
    const selected = menuRef.current?.querySelector<HTMLElement>(".slash-item.selected");
    selected?.scrollIntoView({ block: "nearest" });
  }, [sel, atOpen, palette.open]);

  const itemCount = atOpen
    ? files.length
    : palette.open && palette.mode === "command"
      ? palette.items.length
      : palette.open && palette.mode === "value"
        ? palette.items.length
        : 0;

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Tab" && e.shiftKey) {
      e.preventDefault();
      onCycleMode();
      return;
    }
    if (isCatalogDraft(draft)) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        navigateCatalog(1);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        navigateCatalog(-1);
        return;
      }
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        confirmCatalog();
        return;
      }
      if (e.key === "Escape") {
        // App Esc stack also closes the picker; clear draft here for TUI parity.
        e.preventDefault();
        setDraft("");
        return;
      }
    }
    if (atOpen && e.key === "Escape") {
      e.preventDefault();
      setDraft(draft.replace(/(^|\s)@[^\s]*$/, "$1"));
      return;
    }
    if (atOpen && itemCount > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSel((i) => (i + 1) % itemCount);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSel((i) => (i - 1 + itemCount) % itemCount);
        return;
      }
      if (e.key === "Tab" || (e.key === "Enter" && !e.shiftKey)) {
        e.preventDefault();
        const path = files[sel];
        if (path) setDraft(applyAtMention(draft, path));
        return;
      }
    }
    if (palette.open && itemCount > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSel((i) => (i + 1) % itemCount);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSel((i) => (i - 1 + itemCount) % itemCount);
        return;
      }
      if (e.key === "Tab" || (e.key === "Enter" && !e.shiftKey)) {
        const applied = applyPalette(palette, sel);
        if (applied) {
          e.preventDefault();
          if (applied.done) {
            onSubmit(applied.draft);
            setDraft("");
          } else {
            setDraft(applied.draft);
          }
          return;
        }
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setDraft("");
        return;
      }
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      const line = draft.trim();
      if (!line) return;
      onSubmit(line);
      setDraft("");
    }
  };

  const submitDraft = () => {
    const line = draft.trim();
    if (!line) return;
    onSubmit(line);
    setDraft("");
  };

  /** Ghost `@` affordance — drops an at-mention token at the end of the draft. */
  const insertAtMention = () => {
    const next = draft.length === 0 || /\s$/.test(draft) ? `${draft}@` : `${draft} @`;
    setDraft(next);
    window.requestAnimationFrame(() => {
      const el = ref.current;
      el?.focus();
      el?.setSelectionRange(next.length, next.length);
    });
  };

  /** Ghost `/` affordance — opens the command palette (empty drafts only,
   * mirroring ⌘K, so typed text is never clobbered). */
  const openCommands = () => {
    if (draft.trim()) return;
    setDraft("/");
    window.requestAnimationFrame(() => ref.current?.focus());
  };

  const onPaste = (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
    // Native browser paste and async IPC cannot race: own the transaction
    // synchronously, then reinsert either text or the saved image mention.
    event.preventDefault();
    const textarea = event.currentTarget;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    void window.vibe.pasteClipboard(cwd ?? undefined).then((result) => {
      if (result.kind === "error") {
        onPasteError(`Clipboard paste failed · ${result.error}`);
        return;
      }
      if (result.kind === "none") return;
      let caret = start;
      setDraft((current) => {
        const edit = applyComposerPaste(current, start, end, result);
        caret = edit.caret;
        return edit.value;
      });
      window.requestAnimationFrame(() => {
        ref.current?.focus();
        ref.current?.setSelectionRange(caret, caret);
      });
    });
  };

  return (
    <div className="composer-wrap">
      {atOpen && (
        <div className="slash-menu" ref={menuRef} role="listbox" aria-label="Matching project files">
          <div className="slash-menu-header">
            <span>Attach file</span>
            <span className="slash-menu-hint">@</span>
          </div>
          <div className="slash-menu-body">
            {filesLoading && <div className="slash-state" role="status">Searching project files…</div>}
            {!filesLoading && filesError && (
              <div className="slash-state error" role="status">Couldn’t search files · {filesError}</div>
            )}
            {!filesLoading && !filesError && files.length === 0 && (
              <div className="slash-state" role="status">No matching project files.</div>
            )}
            {files.map((path, i) => {
              const { base, dir } = fileParts(path);
              return (
                <button
                  type="button"
                  key={path}
                  className={`slash-item${i === sel ? " selected" : ""}`}
                  role="option"
                  aria-selected={i === sel}
                  onMouseDown={(ev) => {
                    ev.preventDefault();
                    setDraft(applyAtMention(draft, path));
                  }}
                >
                  <span className="slash-item-copy">
                    <span className="name">@{base}</span>
                    {dir ? <span className="desc">{dir}</span> : null}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="slash-menu-footer">
            <kbd className="action-kbd">↑↓</kbd>
            <span>navigate</span>
            <kbd className="action-kbd">Tab</kbd>
            <span>select</span>
            <kbd className="action-kbd">Esc</kbd>
            <span>close</span>
          </div>
        </div>
      )}
      {palette.open && itemCount > 0 && !atOpen && (
        <div className="slash-menu" ref={menuRef} role="listbox" aria-label="Slash commands">
          <div className="slash-menu-header">
            <span>{palette.mode === "value" ? `/${palette.command.name}` : "Commands"}</span>
            <span className="slash-menu-hint">{palette.mode === "value" ? "options" : "/"}</span>
          </div>
          <div className="slash-menu-body">
            {palette.mode === "command" &&
              palette.items.map((item, i) => (
                <button
                  type="button"
                  key={item.name}
                  className={`slash-item${i === sel ? " selected" : ""}`}
                  role="option"
                  aria-selected={i === sel}
                  onMouseDown={(ev) => {
                    ev.preventDefault();
                    const applied = applyPalette(palette, i);
                    if (!applied) return;
                    if (applied.done) {
                      onSubmit(applied.draft);
                      setDraft("");
                    } else setDraft(applied.draft);
                  }}
                >
                  <span className="slash-item-copy">
                    <span className="name">/{item.name}</span>
                    <span className="desc">{item.description}</span>
                  </span>
                </button>
              ))}
            {palette.mode === "value" &&
              palette.items.map((value, i) => (
                <button
                  type="button"
                  key={value}
                  className={`slash-item${i === sel ? " selected" : ""}${
                    currentValue === value ? " current" : ""
                  }`}
                  role="option"
                  aria-selected={i === sel}
                  aria-current={currentValue === value ? "true" : undefined}
                  onMouseDown={(ev) => {
                    ev.preventDefault();
                    const applied = applyPalette(palette, i);
                    if (!applied) return;
                    onSubmit(applied.draft);
                    setDraft("");
                  }}
                >
                  <span className="slash-item-copy">
                    <span className="name">{value}</span>
                  </span>
                  {currentValue === value ? <span className="slash-badge">Current</span> : null}
                </button>
              ))}
          </div>
          <div className="slash-menu-footer">
            <kbd className="action-kbd">↑↓</kbd>
            <span>navigate</span>
            <kbd className="action-kbd">Enter</kbd>
            <span>run</span>
            <kbd className="action-kbd">Esc</kbd>
            <span>close</span>
          </div>
        </div>
      )}
      <div className="composer-row">
        <textarea
          ref={ref}
          className={`composer-input${exact ? " exact-cmd" : ""}`}
          value={draft}
          disabled={disabled}
          placeholder="Ask Vibe Codr to build, fix, explain, or review…"
          aria-label="Task message"
          rows={1}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
        />
      </div>
      <div className="composer-status">
        <div className="composer-status-actions">
          <button
            type="button"
            className="composer-ghost"
            onClick={insertAtMention}
            disabled={disabled}
            aria-label="Mention a project file"
            title="Mention a project file"
          >
            <Paperclip size={15} strokeWidth={1.75} />
          </button>
          <button
            type="button"
            className="composer-ghost"
            onClick={openCommands}
            disabled={disabled || !!draft.trim()}
            aria-label="Browse commands"
            title="Browse commands (⌘K)"
          >
            <Terminal size={15} strokeWidth={1.75} />
          </button>
          <button type="button" className="mode-chip" onClick={onCycleMode} title="Cycle mode (Shift+Tab)">
            {displayModeLabel(modeLabel)}
          </button>
          {status ? (
            <span className="composer-metrics" title={status}>{status}</span>
          ) : null}
        </div>
        <div className="composer-status-trailing">
          {typeof ctxPct === "number" && (
            <span
              className={`ctx-ring${ctxPct >= 95 ? " hot" : ctxPct >= 80 ? " warn" : ""}`}
              style={{ "--ctx-fill": ctxPct } as CSSProperties}
              role="img"
              aria-label={`Context window ${ctxPct} percent full`}
              title={`Context window ${ctxPct}% full`}
            >
              <span className="ctx-ring-dial" aria-hidden />
              {ctxPct}%
            </span>
          )}
          <span className="composer-model" title={model}>{model.split("/").at(-1) || model}</span>
          {busy ? (
            <button type="button" className="composer-submit stop" onClick={onAbort} aria-label="Stop current turn">
              <Square size={11} fill="currentColor" strokeWidth={0} aria-hidden="true" />
              Stop
            </button>
          ) : (
            <button
              type="button"
              className="composer-submit"
              onClick={submitDraft}
              disabled={!draft.trim()}
              aria-label="Send message"
            >
              <ArrowUp size={16} strokeWidth={2} aria-hidden="true" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
