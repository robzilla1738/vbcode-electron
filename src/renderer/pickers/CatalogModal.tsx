import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import type {
  AgentInfo,
  McpServerInfo,
  ModelSummary,
  ProviderInfo,
  SkillInfo,
} from "../../shared/types";
import type { EngineCommand } from "../../shared/commands";
import {
  agentCatalogOptions,
  isSectionOption,
  mcpCatalogOptions,
  modelCatalogOptions,
  modelTargetLabel,
  pushModelRecent,
  providerCatalogOptions,
  skillCatalogOptions,
  type CatalogOption,
  type ModelPickerTarget,
} from "../../shared/catalog-draft";
import { useFloatingAnchor } from "../hooks/useFloatingAnchor";
import { IconClose, IconSearch } from "../icons";

export type CatalogPicker =
  | {
      kind: "models";
      items: ModelSummary[];
      target: ModelPickerTarget;
      query?: string;
      current?: string;
    }
  | { kind: "providers"; items: ProviderInfo[]; query?: string }
  | { kind: "agents"; items: AgentInfo[]; query?: string }
  | { kind: "skills"; items: SkillInfo[]; query?: string }
  | { kind: "mcp"; items: McpServerInfo[]; query?: string };

export type CatalogChoice =
  | { kind: "command"; command: EngineCommand }
  | { kind: "prefill"; draft: string; openModelsForAgent?: string }
  | { kind: "line"; line: string };

function catalogOptions(picker: CatalogPicker): CatalogOption[] {
  switch (picker.kind) {
    case "models":
      return modelCatalogOptions(picker.items, picker.target, picker.current);
    case "providers":
      return providerCatalogOptions(picker.items);
    case "agents":
      return agentCatalogOptions(picker.items);
    case "skills":
      return skillCatalogOptions(picker.items);
    case "mcp":
      return mcpCatalogOptions(picker.items);
  }
}

function toChoice(option: CatalogOption): CatalogChoice | null {
  if (option.command) return { kind: "command", command: option.command };
  if (option.prefill != null) {
    return {
      kind: "prefill",
      draft: option.prefill,
      openModelsForAgent: option.openModelsForAgent,
    };
  }
  if (option.line) return { kind: "line", line: option.line };
  return null;
}

function isActionable(option: CatalogOption): boolean {
  if (isSectionOption(option)) return false;
  return Boolean(option.command || option.prefill != null || option.line);
}

function splitSecondary(secondary: string): { tag: string | null; body: string } {
  const m = secondary.match(/^\[([^\]]+)\]\s*(.*)$/);
  if (!m) return { tag: null, body: secondary };
  return { tag: m[1]!, body: m[2] ?? "" };
}

function focusableIn(root: ParentNode | null): HTMLElement[] {
  if (!root) return [];
  return Array.from(
    root.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((el) => {
    if (el.getAttribute("aria-hidden") === "true") return false;
    // offsetParent is null for fixed/portaled nodes in some engines — keep
    // visibly rendered controls even when portaled to document.body.
    const style = window.getComputedStyle(el);
    return style.visibility !== "hidden" && style.display !== "none";
  });
}

export function CatalogModal({
  picker,
  onClose,
  onChoose,
  onToggleModelTarget,
  autoFocusSearch = true,
  draftLinked = false,
  anchorRef,
}: {
  picker: CatalogPicker;
  onClose: () => void;
  onChoose: (choice: CatalogChoice) => void;
  onToggleModelTarget?: () => void;
  autoFocusSearch?: boolean;
  /** Composer draft owns the filter — search looks linked, not idle. */
  draftLinked?: boolean;
  /** Positions the portaled popover above this element (composer stack). */
  anchorRef: RefObject<HTMLElement | null>;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const [selected, setSelected] = useState(0);
  const [query, setQuery] = useState(picker.query ?? "");
  const box = useFloatingAnchor(anchorRef, true);
  const allOptions = useMemo(() => catalogOptions(picker), [picker]);
  const options = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return allOptions;
    // Keep sections when they have matching children
    const filtered: CatalogOption[] = [];
    let currentSection: CatalogOption | null = null;
    let sectionHasMatch = false;
    let pendingSection: CatalogOption | null = null;

    for (const opt of allOptions) {
      if (isSectionOption(opt)) {
        if (pendingSection && sectionHasMatch) {
          filtered.push(pendingSection);
        }
        pendingSection = opt;
        currentSection = opt;
        sectionHasMatch = false;
        continue;
      }
      if (!isActionable(opt)) {
        continue;
      }
      if (`${opt.primary} ${opt.secondary}`.toLowerCase().includes(normalized)) {
        if (pendingSection) {
          // First match after a section header — emit the header
          filtered.push(pendingSection);
          pendingSection = null;
          sectionHasMatch = true;
        }
        filtered.push(opt);
        sectionHasMatch = true;
      }
    }

    // If no sections matched but plain options did, filtered is already populated
    // If sections exist but filter narrows to zero actionable, return empty
    void currentSection;
    return filtered;
  }, [allOptions, query]);

  const actionable = options.flatMap((option, index) => (isActionable(option) ? [index] : []));

  const canToggleTarget =
    picker.kind === "models" && typeof picker.target === "string" && Boolean(onToggleModelTarget);

  const focusOption = (index: number) => {
    setSelected(index);
    window.requestAnimationFrame(() => {
      rootRef.current
        ?.querySelector<HTMLButtonElement>(`[data-option-index="${index}"]`)
        ?.focus();
    });
  };

  useEffect(() => {
    triggerRef.current = document.activeElement as HTMLElement | null;
    if (autoFocusSearch) {
      window.requestAnimationFrame(() =>
        rootRef.current?.querySelector<HTMLInputElement>("[data-catalog-search]")?.focus(),
      );
    }
    return () => {
      if (autoFocusSearch) triggerRef.current?.focus();
    };
  }, [autoFocusSearch]);

  // Keep keyboard focus inside the catalog (and composer when draft-linked).
  useEffect(() => {
    if (!box) return;

    const trapTargets = (): HTMLElement[] => {
      const catalog = focusableIn(rootRef.current);
      if (!draftLinked) return catalog;
      const composer = focusableIn(document.getElementById("composer"));
      // Prefer catalog controls first so Tab cycles catalog → composer → catalog.
      return [...catalog, ...composer];
    };

    const pullFocusBack = () => {
      const targets = trapTargets();
      const fallback =
        rootRef.current?.querySelector<HTMLElement>("[data-catalog-search]") ??
        targets[0] ??
        rootRef.current;
      fallback?.focus();
    };

    const onFocusIn = (event: FocusEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (rootRef.current?.contains(target)) return;
      if (draftLinked && document.getElementById("composer")?.contains(target)) return;
      pullFocusBack();
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      // Models picker reserves Tab for main ⇄ sub target toggle.
      if (canToggleTarget) return;
      const targets = trapTargets();
      if (targets.length === 0) return;
      const active = document.activeElement as HTMLElement | null;
      const index = active ? targets.indexOf(active) : -1;
      if (index < 0) return;
      if (event.shiftKey && index === 0) {
        event.preventDefault();
        targets.at(-1)?.focus();
      } else if (!event.shiftKey && index === targets.length - 1) {
        event.preventDefault();
        targets[0]?.focus();
      }
    };

    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [box, draftLinked, canToggleTarget]);

  useEffect(() => {
    setQuery(picker.query ?? "");
  }, [picker.query, picker.kind]);

  useEffect(() => {
    const cur =
      picker.kind === "models"
        ? options.findIndex((o) => o.key === picker.current && o.key !== "__clear__")
        : -1;
    setSelected(cur >= 0 ? cur : (actionable[0] ?? 0));
  }, [
    query,
    picker.kind,
    picker.kind === "models" ? picker.target : "",
    picker.kind === "models" ? picker.current : "",
    options,
    actionable,
  ]);

  useEffect(() => {
    const onNav = (event: Event) => {
      const direction = (event as CustomEvent<1 | -1>).detail;
      if (direction === 1 || direction === -1) move(direction);
    };
    const onConfirm = () => {
      const option = options[selected];
      if (option && isActionable(option)) choose(option);
    };
    window.addEventListener("vibe-catalog-nav", onNav);
    window.addEventListener("vibe-catalog-confirm", onConfirm);
    return () => {
      window.removeEventListener("vibe-catalog-nav", onNav);
      window.removeEventListener("vibe-catalog-confirm", onConfirm);
    };
  });

  const move = (direction: 1 | -1) => {
    if (!actionable.length) return;
    const current = actionable.indexOf(selected);
    const next = actionable[(current + direction + actionable.length) % actionable.length] ?? actionable[0]!;
    setSelected(next);
    window.requestAnimationFrame(() => {
      rootRef.current
        ?.querySelector<HTMLButtonElement>(`[data-option-index="${next}"]`)
        ?.scrollIntoView({ block: "nearest" });
    });
  };

  const choose = (option: CatalogOption) => {
    // Track recent for main model picker (opencode-style)
    if (picker.kind === "models" && option.key && !option.key.startsWith("__")) {
      pushModelRecent(option.key);
    }
    const choice = toChoice(option);
    if (choice) onChoose(choice);
  };

  const title =
    picker.kind === "models"
      ? `Models · ${modelTargetLabel(picker.target)}`
      : picker.kind[0]!.toUpperCase() + picker.kind.slice(1);

  if (!box) return null;

  return createPortal(
    <div
      ref={rootRef}
      className="catalog-popover popover-surface catalog-popover-portal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="catalog-title"
      style={{
        left: box.left,
        width: box.width,
        bottom: window.innerHeight - box.top + 10,
        maxHeight: Math.min(440, Math.max(180, box.top - 24)),
      }}
      onKeyDown={(event) => {
        if (event.key === "ArrowDown") {
          event.preventDefault();
          move(1);
        } else if (event.key === "ArrowUp") {
          event.preventDefault();
          move(-1);
        } else if (event.key === "Home" && actionable.length) {
          event.preventDefault();
          focusOption(actionable[0]!);
        } else if (event.key === "End" && actionable.length) {
          event.preventDefault();
          focusOption(actionable.at(-1)!);
        } else if (event.key === "Tab" && canToggleTarget) {
          event.preventDefault();
          onToggleModelTarget?.();
        } else if (event.key === "Escape") {
          event.preventDefault();
          onClose();
        } else if (event.key === "Enter") {
          const option = options[selected];
          if (option && isActionable(option)) {
            event.preventDefault();
            choose(option);
          }
        }
      }}
    >
      <div className="catalog-popover-header popover-header">
        <div className="catalog-header-title">
          <h2 id="catalog-title">{title}</h2>
          {draftLinked ? (
            <span className="catalog-draft-hint">Filtering from composer</span>
          ) : null}
        </div>
        <div className="catalog-header-actions">
          {canToggleTarget && (
            <button
              type="button"
              className="catalog-target"
              onClick={onToggleModelTarget}
              aria-label={`Model target ${picker.target === "main" ? "Main" : "Subagents"}. Press Tab to switch.`}
              title="Tab to switch target"
            >
              {picker.target === "main" ? "Main" : "Subagents"}
            </button>
          )}
          <button type="button" className="catalog-close" onClick={onClose} aria-label={`Close ${title}`}>
            <IconClose size={14} />
          </button>
        </div>
      </div>

      <label className={`catalog-search${draftLinked ? " is-draft-linked" : ""}`}>
        <span className="sr-only">Filter {picker.kind}</span>
        <IconSearch size={14} />
        <input
          data-catalog-search
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={
            draftLinked
              ? "Type in composer to filter…"
              : `Filter ${picker.kind}…`
          }
          autoComplete="off"
          aria-controls="catalog-results"
          aria-autocomplete="list"
          aria-activedescendant={
            actionable.length ? `catalog-option-${selected}` : undefined
          }
        />
        {query && (
          <button
            type="button"
            className="catalog-search-clear"
            onClick={() => setQuery("")}
            aria-label="Clear filter"
          >
            <IconClose size={12} />
          </button>
        )}
      </label>

      <div
        id="catalog-results"
        className="catalog-list popover-body"
        role={actionable.length ? "listbox" : "list"}
        aria-label={`${picker.kind} results`}
      >
        {options.map((option, index) => {
          if (!isActionable(option)) {
            return (
              <div key={option.key} className="catalog-section" role="presentation">
                {option.primary}
              </div>
            );
          }
          const { tag, body } = splitSecondary(option.secondary);
          return (
            <button
              key={option.key}
              id={`catalog-option-${index}`}
              type="button"
              className={`catalog-row${index === selected ? " selected" : ""}`}
              data-catalog-option
              data-option-index={index}
              role="option"
              aria-selected={index === selected}
              aria-current={picker.kind === "models" && option.key === picker.current ? "true" : undefined}
              onFocus={() => setSelected(index)}
              onMouseMove={() => setSelected(index)}
              onClick={() => choose(option)}
            >
              <span className="catalog-row-primary">
                {option.primary}
                {option.free ? <span className="catalog-tag free">Free</span> : null}
                {picker.kind === "models" && option.key === picker.current ? (
                  <span className="catalog-current">Current</span>
                ) : null}
              </span>
              {(tag || body) && (
                <span className="catalog-row-secondary">
                  {tag ? <span className="catalog-tag">{tag}</span> : null}
                  {body}
                </span>
              )}
            </button>
          );
        })}
        {options.length === 0 && (
          <div className="catalog-empty" role="status">
            <div>Nothing matches this filter.</div>
            {query && <div className="catalog-empty-hint">Try different keywords</div>}
          </div>
        )}
      </div>

      <div className="catalog-popover-footer popover-footer">
        <span>
          <kbd className="action-kbd">↑↓</kbd> navigate
        </span>
        <span>
          <kbd className="action-kbd">Enter</kbd> choose
        </span>
        <span>
          <kbd className="action-kbd">Esc</kbd> close
        </span>
        {picker.kind === "models" && typeof picker.target === "string" ? (
          <span>
            <kbd className="action-kbd">Tab</kbd> {picker.target === "main" ? "subagents" : "main"}
          </span>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
