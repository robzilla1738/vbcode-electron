import { useEffect, useMemo, useRef, useState, type CSSProperties, type Dispatch, type SetStateAction } from "react";
import { createPortal } from "react-dom";
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
import { modeWord, type UiMode } from "../../shared/modes";
import { densityLabel, isTranscriptDensity } from "../../shared/density";
import { accentNameOf } from "../../shared/themes";
import { applyAtMention, useAtMention } from "../hooks/useAtMention";
import { useFloatingAnchor } from "../hooks/useFloatingAnchor";
import { applyComposerPaste } from "../../shared/composer-edit";
import { IconChevron, IconPaperclip, IconSend, IconStop } from "../icons";

const MODE_OPTIONS: UiMode[] = ["plan", "execute", "yolo"];

const MODE_HINT: Record<UiMode, string> = {
  plan: "Read-only · propose a plan",
  execute: "Tools ask before running",
  yolo: "Tools run without asking",
};

/** Matches `--composer-input-max` — keep JS clamp and CSS in sync. */
const COMPOSER_INPUT_MAX_PX = 320;

export type ComposerMetric = {
  key: string;
  label: string;
  title?: string;
};

function useBusyElapsed(busy: boolean): string | null {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!busy) {
      setElapsed(0);
      return;
    }
    const start = Date.now();
    setElapsed(0);
    const timer = window.setInterval(() => setElapsed(Date.now() - start), 200);
    return () => window.clearInterval(timer);
  }, [busy]);
  if (!busy) return null;
  // Always show a tabular elapsed once busy so the Stop control width stays stable.
  return `${(elapsed / 1000).toFixed(elapsed >= 10_000 ? 0 : 1)}s`;
}

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

function displayModeLabel(mode: UiMode): string {
  const label = modeWord(mode);
  return label.length > 1 ? `${label.slice(0, 1)}${label.slice(1).toLowerCase()}` : label;
}

function highlightMatch(text: string, query: string): { before: string; match: string; after: string } | null {
  if (!query) return null;
  const lower = text.toLowerCase();
  const q = query.toLowerCase();
  const idx = lower.indexOf(q);
  if (idx < 0) return null;
  return {
    before: text.slice(0, idx),
    match: text.slice(idx, idx + q.length),
    after: text.slice(idx + q.length),
  };
}

function HighlightedBase({ base, query }: { base: string; query: string }) {
  const hl = highlightMatch(base, query);
  if (!hl) return <>{base}</>;
  return (
    <>
      {hl.before}
      <span className="hl">{hl.match}</span>
      {hl.after}
    </>
  );
}

function MenuKeyHints({ action }: { action: string }) {
  return (
    <>
      <kbd className="action-kbd">↑↓</kbd>
      <span>navigate</span>
      <kbd className="action-kbd">Tab</kbd>
      <kbd className="action-kbd">Enter</kbd>
      <span>{action}</span>
      <kbd className="action-kbd">Esc</kbd>
      <span>close</span>
    </>
  );
}

export function Composer({
  uiMode,
  draft,
  setDraft,
  onSubmit,
  catalogOpen,
  onCycleMode,
  onSelectMode,
  disabled,
  commandNames,
  cwd,
  model,
  theme,
  accent,
  approvals,
  density,
  reasoning,
  metrics = [],
  ctxPct,
  busy,
  onAbort,
  onCycleDensity,
  onPasteError,
  onOpenModel,
  onOpenInspector,
  onEditInEditor,
  emptyHome = false,
  planPending = false,
}: {
  uiMode: UiMode;
  draft: string;
  setDraft: Dispatch<SetStateAction<string>>;
  onSubmit: (line: string) => Promise<boolean>;
  catalogOpen: boolean;
  onCycleMode: () => void;
  onSelectMode: (mode: UiMode) => void;
  disabled?: boolean;
  commandNames: string[];
  cwd: string | null;
  model: string;
  theme: string;
  accent: string;
  approvals: "ask" | "auto";
  density: string;
  reasoning?: string;
  /** Usage / changed-file chips (stable slot; gate & queue have their own surfaces). */
  metrics?: ComposerMetric[];
  /** Context-window fill 0–100, or null before the first turn. */
  ctxPct?: number | null;
  busy: boolean;
  onAbort: () => void;
  /** Cycle transcript density (⌘D). */
  onCycleDensity?: () => void;
  onPasteError: (message: string) => void;
  /** Open the model picker from the model chip (real affordance, I26). */
  onOpenModel?: () => void;
  /** Open the session inspector from the context chip (I26). */
  onOpenInspector?: () => void;
  /** Compose in $VISUAL/$EDITOR — surfaced in the insert menu (I27). */
  onEditInEditor?: () => void;
  /** Empty-session home: taller input + /@-hint placeholder. */
  emptyHome?: boolean;
  /** Plan approval pending — composer submits revise the plan. */
  planPending?: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const modeTriggerRef = useRef<HTMLButtonElement>(null);
  const modeMenuRef = useRef<HTMLDivElement>(null);
  const modeSelRef = useRef(0);
  const submitPending = useRef(false);
  const [sel, setSel] = useState(0);
  const [modeOpen, setModeOpen] = useState(false);
  const [modeSel, setModeSel] = useState(0);
  const [insertOpen, setInsertOpen] = useState(false);
  const [insertSel, setInsertSel] = useState(0);
  const insertTriggerRef = useRef<HTMLButtonElement>(null);
  const insertMenuRef = useRef<HTMLDivElement>(null);
  const insertSelRef = useRef(0);
  const insertActionsRef = useRef<{ id: string; label: string; hint?: string; run: () => void; disabled?: boolean }[]>([]);
  const busyElapsed = useBusyElapsed(busy);
  modeSelRef.current = modeSel;
  insertSelRef.current = insertSel;
  const nameSet = useMemo(
    () => new Set(commandNames.map((n) => n.toLowerCase())),
    [commandNames],
  );
  const palette: PaletteState = useMemo(() => {
    if (isCatalogDraft(draft)) return { open: false };
    return paletteState(draft, commandNames);
  }, [draft, commandNames]);
  const exact = isExactCommand(draft, nameSet);
  const { mention: mentionQuery, files, loading: filesLoading, error: filesError } = useAtMention(draft, cwd);
  const atOpen = mentionQuery != null && !palette.open;
  const currentValue = palette.open && palette.mode === "value"
    ? currentValueFor(palette.command.name, { theme, accent, approvals, density, reasoning })
    : undefined;

  const submitAndClear = async (line: string, originalDraft = draft) => {
    if (submitPending.current) return;
    submitPending.current = true;
    try {
      const accepted = await onSubmit(line);
      if (accepted) {
        setDraft((current) => current === originalDraft ? "" : current);
      }
    } finally {
      submitPending.current = false;
    }
  };

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
    const next = Math.min(el.scrollHeight, COMPOSER_INPUT_MAX_PX);
    el.style.height = `${next}px`;
    el.style.overflowY = el.scrollHeight > COMPOSER_INPUT_MAX_PX ? "auto" : "hidden";
  }, [draft]);

  useEffect(() => {
    const selected = menuRef.current?.querySelector<HTMLElement>(".slash-item.selected");
    selected?.scrollIntoView({ block: "nearest" });
  }, [sel, atOpen, palette.open]);

  useEffect(() => {
    if (!modeOpen) return;
    const selected = modeMenuRef.current?.querySelector<HTMLElement>(".mode-option.selected");
    selected?.scrollIntoView({ block: "nearest" });
  }, [modeSel, modeOpen]);

  useEffect(() => {
    if (!modeOpen) return;
    setModeSel(Math.max(0, MODE_OPTIONS.indexOf(uiMode)));
    const onPointer = (event: MouseEvent) => {
      const target = event.target as Node;
      if (modeMenuRef.current?.contains(target)) return;
      if (modeTriggerRef.current?.contains(target)) return;
      setModeOpen(false);
    };
    // The mode menu fully owns keyboard interaction while open. stopPropagation
    // prevents App's window-level Esc stack from also firing (clearing the
    // draft / denying a permission / aborting) when the user just wants to close
    // the menu. document listeners fire before window in the bubble phase, so
    // stopPropagation here reliably shields App's handler (I25/I58).
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        setModeOpen(false);
        modeTriggerRef.current?.focus();
        return;
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        event.stopPropagation();
        setModeSel((i) => (i + 1) % MODE_OPTIONS.length);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        event.stopPropagation();
        setModeSel((i) => (i - 1 + MODE_OPTIONS.length) % MODE_OPTIONS.length);
        return;
      }
      if (event.key === "Home") {
        event.preventDefault();
        event.stopPropagation();
        setModeSel(0);
        return;
      }
      if (event.key === "End") {
        event.preventDefault();
        event.stopPropagation();
        setModeSel(MODE_OPTIONS.length - 1);
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        event.stopPropagation();
        onSelectMode(MODE_OPTIONS[modeSelRef.current]!);
        setModeOpen(false);
        modeTriggerRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [modeOpen, uiMode, onSelectMode]);

  useEffect(() => {
    if (!insertOpen) return;
    setInsertSel(0);
    const onPointer = (event: MouseEvent) => {
      const target = event.target as Node;
      if (insertMenuRef.current?.contains(target)) return;
      if (insertTriggerRef.current?.contains(target)) return;
      setInsertOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      const actions = insertActionsRef.current;
      const count = actions.length;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        setInsertOpen(false);
        insertTriggerRef.current?.focus();
        return;
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        event.stopPropagation();
        setInsertSel((i) => (i + 1) % count);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        event.stopPropagation();
        setInsertSel((i) => (i - 1 + count) % count);
        return;
      }
      if (event.key === "Home") {
        event.preventDefault();
        event.stopPropagation();
        setInsertSel(0);
        return;
      }
      if (event.key === "End") {
        event.preventDefault();
        event.stopPropagation();
        setInsertSel(count - 1);
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        event.stopPropagation();
        const action = actions[insertSelRef.current];
        setInsertOpen(false);
        insertTriggerRef.current?.focus();
        action?.run();
      }
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [insertOpen]);

  useEffect(() => {
    if (!insertOpen) return;
    const selected = insertMenuRef.current?.querySelector<HTMLElement>(".insert-option.selected");
    selected?.scrollIntoView({ block: "nearest" });
  }, [insertSel, insertOpen]);

  const itemCount = atOpen
    ? files.length
    : palette.open && palette.mode === "command"
      ? palette.items.length
      : palette.open && palette.mode === "value"
        ? palette.items.length
        : 0;

  const menuVisible = atOpen || (palette.open && itemCount > 0);
  const slashBox = useFloatingAnchor(wrapRef, menuVisible);
  const modeBox = useFloatingAnchor(modeTriggerRef, modeOpen);
  const insertBox = useFloatingAnchor(insertTriggerRef, insertOpen);

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (modeOpen && ["Enter", "ArrowDown", "ArrowUp", "Escape", "Home", "End"].includes(e.key)) {
      // Document listener owns the open mode menu; block composer submit/nav.
      e.preventDefault();
      return;
    }
    if (insertOpen && ["Enter", "ArrowDown", "ArrowUp", "Escape", "Home", "End"].includes(e.key)) {
      // Document listener owns the open insert menu; block composer submit/nav.
      e.preventDefault();
      return;
    }
    if (e.key === "Tab" && e.shiftKey) {
      e.preventDefault();
      setModeOpen(false);
      onCycleMode();
      return;
    }
    if (isCatalogDraft(draft) && catalogOpen) {
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
            void submitAndClear(applied.draft);
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
      void submitAndClear(line);
    }
  };

  const submitDraft = () => {
    const line = draft.trim();
    if (!line) return;
    void submitAndClear(line);
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

  /** Shared clipboard-paste flow for both native paste and the insert menu. */
  const runPasteClipboard = (start: number, end: number) => {
    void window.vibe.pasteClipboard(cwd ?? undefined).then((result) => {
      if (result.kind === "error") {
        onPasteError(`Clipboard paste failed · ${result.error}`);
        return;
      }
      if (result.kind === "none") {
        onPasteError("Clipboard has no image or text to paste.");
        return;
      }
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

  const onPaste = (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
    // Native browser paste and async IPC cannot race: own the transaction
    // synchronously, then reinsert either text or the saved image mention.
    event.preventDefault();
    const textarea = event.currentTarget;
    runPasteClipboard(textarea.selectionStart, textarea.selectionEnd);
  };

  /** Paste from the system clipboard at the caret (insert-menu action, I27). */
  const pasteFromMenu = () => {
    const el = ref.current;
    const start = el?.selectionStart ?? draft.length;
    const end = el?.selectionEnd ?? draft.length;
    runPasteClipboard(start, end);
    el?.focus();
  };
  // Insert-menu actions (I27): surface paste + external editor beyond keyboard.
  // Kept in a ref so the open-menu keydown effect can read the latest actions
  // without re-subscribing (and resetting selection) on every render.
  const insertActions: { id: string; label: string; hint?: string; run: () => void; disabled?: boolean }[] = [
    { id: "mention", label: "Mention a file", hint: "@", run: insertAtMention },
    { id: "paste", label: "Paste from clipboard", hint: "image / text", run: pasteFromMenu },
  ];
  if (onEditInEditor) {
    insertActions.push({ id: "editor", label: "Edit in external editor", hint: "⌘G", run: onEditInEditor });
  }
  insertActionsRef.current = insertActions;


  const menuId = menuVisible
    ? atOpen
      ? "composer-mention-menu"
      : "composer-slash-menu"
    : undefined;
  const activeOptionId =
    itemCount > 0 && menuId ? `${menuId}-option-${sel}` : undefined;

  const slashMenu =
    atOpen && slashBox
      ? createPortal(
          <div
            id="composer-mention-menu"
            className="slash-menu slash-menu-portal popover-surface"
            ref={menuRef}
            role="listbox"
            aria-label="Matching project files"
            style={{
              left: slashBox.left,
              width: slashBox.width,
              bottom: window.innerHeight - slashBox.top + 10,
              maxHeight: Math.min(440, Math.max(160, slashBox.top - 24)),
            }}
          >
            <div className="slash-menu-header popover-header">
              <span>Attach file</span>
              <span className="slash-menu-hint">@</span>
            </div>
            <div className="slash-menu-body popover-body">
              {filesLoading && <div className="slash-state" role="status">Searching project files…</div>}
              {!filesLoading && filesError && (
                <div className="slash-state error" role="status">Couldn’t search files · {filesError}</div>
              )}
              {!filesLoading && !filesError && files.length === 0 && (
                <div className="slash-state" role="status">No matching project files.</div>
              )}
              {files.map((path, i) => {
                const { base, dir } = fileParts(path);
                const q = mentionQuery ?? "";
                return (
                  <button
                    type="button"
                    id={`composer-mention-menu-option-${i}`}
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
                      <span className="name">
                        @
                        <HighlightedBase base={base} query={q} />
                      </span>
                      {dir ? <span className="desc">{dir}</span> : null}
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="slash-menu-footer popover-footer">
              <MenuKeyHints action="select" />
            </div>
          </div>,
          document.body,
        )
      : palette.open && itemCount > 0 && !atOpen && slashBox
        ? createPortal(
            <div
              id="composer-slash-menu"
              className="slash-menu slash-menu-portal popover-surface"
              ref={menuRef}
              role="listbox"
              aria-label="Slash commands"
              style={{
                left: slashBox.left,
                width: slashBox.width,
                bottom: window.innerHeight - slashBox.top + 10,
                maxHeight: Math.min(440, Math.max(160, slashBox.top - 24)),
              }}
            >
              <div className="slash-menu-header popover-header">
                <span>{palette.mode === "value" ? `/${palette.command.name}` : "Commands"}</span>
                <span className="slash-menu-hint">{palette.mode === "value" ? "options" : "/"}</span>
              </div>
              <div className="slash-menu-body popover-body">
                {palette.mode === "command" &&
                  palette.items.map((item, i) => (
                    <button
                      type="button"
                      id={`composer-slash-menu-option-${i}`}
                      key={item.name}
                      className={`slash-item${i === sel ? " selected" : ""}`}
                      role="option"
                      aria-selected={i === sel}
                      onMouseDown={(ev) => {
                        ev.preventDefault();
                        const applied = applyPalette(palette, i);
                        if (!applied) return;
                        if (applied.done) {
                          void submitAndClear(applied.draft);
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
                      id={`composer-slash-menu-option-${i}`}
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
                        void submitAndClear(applied.draft);
                      }}
                    >
                      <span className="slash-item-copy">
                        <span className="name">{value}</span>
                      </span>
                      {currentValue === value ? <span className="slash-badge">Current</span> : null}
                    </button>
                  ))}
              </div>
              <div className="slash-menu-footer popover-footer">
                <MenuKeyHints action={palette.mode === "command" ? "run" : "select"} />
              </div>
            </div>,
            document.body,
          )
        : null;

  const modeMenu =
    modeOpen && modeBox
      ? createPortal(
          <div
            className="mode-menu mode-menu-portal popover-surface"
            ref={modeMenuRef}
            role="listbox"
            aria-label="Mode"
            id="composer-mode-menu"
            style={{
              left: modeBox.left,
              bottom: window.innerHeight - modeBox.top + 8,
              minWidth: Math.max(196, modeBox.width),
            }}
          >
            {MODE_OPTIONS.map((mode, i) => {
              const active = uiMode === mode;
              const highlighted = i === modeSel;
              const label = displayModeLabel(mode);
              return (
                <button
                  key={mode}
                  type="button"
                  id={`composer-mode-menu-option-${i}`}
                  role="option"
                  aria-selected={highlighted}
                  aria-current={active ? "true" : undefined}
                  className={`mode-option${highlighted ? " selected" : ""}${active ? " is-active" : ""}`}
                  onMouseEnter={() => setModeSel(i)}
                  onClick={() => {
                    onSelectMode(mode);
                    setModeOpen(false);
                  }}
                >
                  <span className="mode-option-label">{label}</span>
                  <span className="mode-option-hint">{MODE_HINT[mode]}</span>
                  {active ? <span className="mode-option-badge">Current</span> : null}
                </button>
              );
            })}
          </div>,
          document.body,
        )
      : null;

  const insertMenu =
    insertOpen && insertBox
      ? createPortal(
          <div
            className="insert-menu insert-menu-portal popover-surface"
            ref={insertMenuRef}
            role="listbox"
            aria-label="Insert"
            id="composer-insert-menu"
            style={{
              left: insertBox.left,
              bottom: window.innerHeight - insertBox.top + 8,
              minWidth: Math.max(220, insertBox.width),
            }}
          >
            {insertActions.map((action, i) => {
              const highlighted = i === insertSel;
              return (
                <button
                  key={action.id}
                  type="button"
                  id={`composer-insert-menu-option-${i}`}
                  role="option"
                  aria-selected={highlighted}
                  className={`insert-option${highlighted ? " selected" : ""}`}
                  disabled={action.disabled}
                  onMouseEnter={() => setInsertSel(i)}
                  onClick={() => {
                    setInsertOpen(false);
                    insertTriggerRef.current?.focus();
                    action.run();
                  }}
                >
                  <span className="insert-option-label">{action.label}</span>
                  {action.hint ? (
                    <kbd className="insert-option-hint">{action.hint}</kbd>
                  ) : null}
                </button>
              );
            })}
          </div>,
          document.body,
        )
      : null;

  const placeholder = emptyHome
    ? "Plan, build, / for commands, @ for files…"
    : planPending
      ? "Describe changes to revise the plan…"
      : busy
        ? "Add a follow-up or steer the current turn…"
        : "Ask to build, fix, explain, or review…";

  return (
    <div className={`composer-wrap${busy ? " is-busy" : ""}${planPending ? " is-plan" : ""}`} ref={wrapRef}>
      {slashMenu}
      {insertMenu}
      <div className="composer-row">
        <textarea
          ref={ref}
          className={`composer-input${exact ? " exact-cmd" : ""}`}
          value={draft}
          disabled={disabled}
          placeholder={placeholder}
          aria-label={planPending ? "Plan revision feedback" : "Task message"}
          aria-autocomplete="list"
          aria-expanded={menuId != null}
          aria-controls={menuId}
          aria-activedescendant={activeOptionId}
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
            ref={insertTriggerRef}
            className={`composer-ghost${insertOpen ? " is-open" : ""}`}
            onClick={() => setInsertOpen((open) => !open)}
            disabled={disabled}
            aria-haspopup="listbox"
            aria-expanded={insertOpen}
            aria-controls={insertOpen ? "composer-insert-menu" : undefined}
            aria-label="Insert: mention a file, paste clipboard, or edit in external editor"
            title="Insert — mention a file, paste clipboard, or edit in external editor"
          >
            <IconPaperclip size={13} />
          </button>
          <div className={`mode-dropdown${modeOpen ? " is-open" : ""}`}>
            <button
              type="button"
              ref={modeTriggerRef}
              className="mode-trigger composer-chip"
              aria-haspopup="listbox"
              aria-expanded={modeOpen}
              aria-controls={modeOpen ? "composer-mode-menu" : undefined}
              aria-activedescendant={
                modeOpen ? `composer-mode-menu-option-${modeSel}` : undefined
              }
              aria-label={`Mode: ${displayModeLabel(uiMode)}. Shift+Tab to cycle.`}
              title={`${displayModeLabel(uiMode)} mode · Shift+Tab to cycle`}
              onClick={() => setModeOpen((open) => !open)}
            >
              <span>{displayModeLabel(uiMode)}</span>
              <IconChevron open={modeOpen} size={13} />
            </button>
            {modeMenu}
          </div>
        </div>
        <div className="composer-status-trailing">
          <div
            className={`composer-metrics-slot${busy || metrics.length ? " has-content" : ""}`}
            aria-hidden={!busy && metrics.length === 0 ? true : undefined}
          >
            {busy ? (
              <span
                className="composer-chip composer-busy-cue"
                title="Working · Esc to interrupt"
                aria-label="Working"
              >
                <span className="spinner composer-busy-spinner" aria-hidden />
                <span>Working</span>
              </span>
            ) : null}
            {metrics.map((metric) => (
              <span
                key={metric.key}
                className="composer-chip composer-metric"
                title={metric.title ?? metric.label}
              >
                {metric.label}
              </span>
            ))}
          </div>
          {onCycleDensity ? (
            <button
              type="button"
              className="composer-chip composer-density"
              onClick={onCycleDensity}
              title={`${isTranscriptDensity(density) ? densityLabel(density) : density} · ⌘D`}
              aria-label={`Density ${density}. ${isTranscriptDensity(density) ? densityLabel(density) : ""}. Press to cycle.`}
            >
              {density}
            </button>
          ) : null}
          {typeof ctxPct === "number" && ctxPct > 0 && (
            <button
              type="button"
              className={`composer-chip ctx-ring${ctxPct >= 95 ? " hot" : ctxPct >= 80 ? " warn" : ""}`}
              style={{ "--ctx-fill": ctxPct } as CSSProperties}
              onClick={onOpenInspector}
              disabled={!onOpenInspector}
              aria-label={`Context window ${ctxPct} percent full. Open session panel.`}
              title={`Context window ${ctxPct}% full${onOpenInspector ? " · open session panel" : ""}`}
            >
              <span className="ctx-ring-dial" aria-hidden />
              {ctxPct}%
            </button>
          )}
          <button
            type="button"
            className="composer-chip composer-model"
            onClick={onOpenModel}
            disabled={!onOpenModel}
            title={onOpenModel ? `${model} · change model` : model}
            aria-label={onOpenModel ? `${model}. Change model` : model}
          >
            {model.split("/").at(-1) || model}
          </button>
          <div className="composer-submit-slot">
            {busy ? (
              <button
                type="button"
                className="composer-submit stop"
                onClick={onAbort}
                aria-label={
                  busyElapsed ? `Stop current turn · ${busyElapsed}` : "Stop current turn"
                }
                title={
                  busyElapsed
                    ? `Working ${busyElapsed} · Esc to interrupt`
                    : "Esc to interrupt"
                }
              >
                <IconStop />
                <span className="stop-label">Stop</span>
                <span className="stop-elapsed">{busyElapsed ?? "0.0s"}</span>
              </button>
            ) : (
              <button
                type="button"
                className="composer-submit"
                onClick={submitDraft}
                disabled={!draft.trim()}
                aria-label="Send message"
              >
                <IconSend />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
