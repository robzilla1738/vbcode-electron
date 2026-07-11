import { useEffect, useMemo, useRef, useState } from "react";
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
  mcpCatalogOptions,
  modelCatalogOptions,
  modelTargetLabel,
  providerCatalogOptions,
  skillCatalogOptions,
  type CatalogOption,
  type ModelPickerTarget,
} from "../../shared/catalog-draft";

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
  return Boolean(option.command || option.prefill != null || option.line);
}

/** Split leading `[tag]` from skill/provider secondary copy for quieter chrome. */
function splitSecondary(secondary: string): { tag: string | null; body: string } {
  const m = secondary.match(/^\[([^\]]+)\]\s*(.*)$/);
  if (!m) return { tag: null, body: secondary };
  return { tag: m[1]!, body: m[2] ?? "" };
}

export function CatalogModal({
  picker,
  onClose,
  onChoose,
  onToggleModelTarget,
  autoFocusSearch = true,
}: {
  picker: CatalogPicker;
  onClose: () => void;
  onChoose: (choice: CatalogChoice) => void;
  onToggleModelTarget?: () => void;
  /** When false (live draft), keep focus in the composer. */
  autoFocusSearch?: boolean;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const [selected, setSelected] = useState(0);
  const [query, setQuery] = useState(picker.query ?? "");
  const allOptions = useMemo(() => catalogOptions(picker), [picker]);
  const options = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return allOptions;
    return allOptions.filter((option) => {
      if (!isActionable(option)) return true;
      return `${option.primary} ${option.secondary}`.toLowerCase().includes(normalized);
    });
  }, [allOptions, query]);
  const actionable = options.flatMap((option, index) => (isActionable(option) ? [index] : []));

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

  useEffect(() => {
    setQuery(picker.query ?? "");
  }, [picker.query, picker.kind]);

  useEffect(() => {
    const cur =
      picker.kind === "models"
        ? options.findIndex((o) => o.key === picker.current && o.key !== "__clear__")
        : -1;
    setSelected(cur >= 0 ? cur : (actionable[0] ?? 0));
  }, [query, picker.kind, picker.kind === "models" ? picker.target : "", picker.kind === "models" ? picker.current : ""]);

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
    const choice = toChoice(option);
    if (choice) onChoose(choice);
  };

  const title =
    picker.kind === "models"
      ? `Models · ${modelTargetLabel(picker.target)}`
      : picker.kind[0]!.toUpperCase() + picker.kind.slice(1);

  const canToggleTarget =
    picker.kind === "models" && typeof picker.target === "string" && onToggleModelTarget;

  return (
    <div
      ref={rootRef}
      className="catalog-popover"
      role="dialog"
      aria-labelledby="catalog-title"
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
      <div className="catalog-popover-header">
        <h2 id="catalog-title">{title}</h2>
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
      </div>

      <label className="catalog-search">
        <span className="sr-only">Filter {picker.kind}</span>
        <input
          data-catalog-search
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={`Filter ${picker.kind}…`}
          autoComplete="off"
          aria-controls="catalog-results"
          aria-autocomplete="list"
          aria-activedescendant={
            actionable.length ? `catalog-option-${selected}` : undefined
          }
        />
      </label>

      <div
        id="catalog-results"
        className="catalog-list"
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
            Nothing matches this filter.
          </div>
        )}
      </div>

      <div className="catalog-popover-footer">
        <span>
          <kbd className="action-kbd">↑↓</kbd> navigate
        </span>
        <span>
          <kbd className="action-kbd">Enter</kbd> choose
        </span>
        <span>
          <kbd className="action-kbd">Esc</kbd> close
        </span>
      </div>
    </div>
  );
}
