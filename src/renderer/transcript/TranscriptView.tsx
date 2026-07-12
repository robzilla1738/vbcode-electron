import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import type { Block, Turn } from "../../shared/reducer";
import { collapsedHint, toolDurationLabel } from "../../shared/reducer";
import {
  showThinkingRows,
  thinkingCollapsed,
  toolCollapsed,
  type TranscriptDensity,
} from "../../shared/density";
import { isScrollAnchored } from "../../shared/scroll-anchor";
import { parseSearchResults } from "../../shared/sources";
import { SourceList } from "./SourceList";
import { MarkdownView } from "./MarkdownView";
import { stripToolGlyph, ToolGlyph } from "../tool-glyph";
import { IconBrain, IconChevron } from "../icons";
import { CopyButton } from "../CopyButton";

/** JS smooth-scroll must honor the OS reduced-motion setting (I19/P04); CSS
 *  `scroll-behavior: smooth` is already disabled by the media query, but
 *  `scrollTo({ behavior: "smooth" })` is not. */
function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  );
}

function scrollBehavior(pref: ScrollBehavior): ScrollBehavior {
  return pref === "smooth" && prefersReducedMotion() ? "auto" : pref;
}

function memoryNotice(text: string): { count: string; detail: string } | null {
  const match = text.match(
    /^Recalled\s+(\d+)\s+prior note\(s\)(?:\s*\([^)]*\))?:\s*([\s\S]*)$/i,
  );
  if (!match) return null;
  return {
    count: match[1] ?? "0",
    detail: (match[2] ?? "")
      .replace(/\s*##\s*/g, "  ·  ")
      .replace(/\s+/g, " ")
      .trim(),
  };
}

function DiffBody({ lines }: { lines: string[] }) {
  const text = lines.join("\n");
  return (
    <div className="tool-body has-copy">
      <CopyButton text={text} label="Copy diff" />
      {lines.map((line, i) => {
        const cls = line.startsWith("+")
          ? "diff-add"
          : line.startsWith("-")
            ? "diff-del"
            : line.startsWith("@@")
              ? "diff-hunk"
              : undefined;
        return (
          <div key={i} className={cls}>
            {line || " "}
          </div>
        );
      })}
    </div>
  );
}

function PlainToolBody({
  id,
  text,
  children,
}: {
  id?: string;
  text: string;
  children: ReactNode;
}) {
  return (
    <div className="tool-body has-copy" id={id}>
      {text ? <CopyButton text={text} label="Copy output" /> : null}
      {children}
    </div>
  );
}

function BlockView({
  block,
  density,
  theme,
  now,
  onToggle,
}: {
  block: Block;
  density: TranscriptDensity;
  theme: string;
  now: number;
  onToggle: (id: number) => void;
}) {
  switch (block.kind) {
    case "assistant":
      return (
        <div className={`block-assistant has-copy${block.streaming ? " streaming" : ""}`}>
          {!block.streaming && block.text ? (
            <CopyButton text={block.text} label="Copy answer" />
          ) : null}
          <div className="md">
            <MarkdownView streaming={block.streaming} theme={theme}>
              {block.text}
            </MarkdownView>
          </div>
        </div>
      );
    case "tool": {
      const collapsed = toolCollapsed(density, block);
      const dur = toolDurationLabel(block, now);
      const outputText = block.output.join("\n");
      return (
        <div className="tool-row">
          <button
            type="button"
            className={`tool-head${block.isError ? " error" : ""}${!block.done ? " live" : ""}`}
            onClick={() => onToggle(block.id)}
            aria-expanded={!collapsed}
            aria-controls={`tool-body-${block.id}`}
            aria-label={`${collapsed ? "Expand" : "Collapse"} ${block.label}`}
          >
            <span className="tool-label">
              <IconChevron open={!collapsed} size={13} />
              <ToolGlyph toolName={block.toolName} />
              <span>
                {stripToolGlyph(block.label)}
              </span>
            </span>
            <span className="tool-meta">
              {collapsed && block.done ? collapsedHint(block) : ""}
              {!block.done && block.tail ? " …" : ""}
              {dur ? ` ${dur}` : ""}
            </span>
          </button>
          {!collapsed && block.isDiff && (
            <div id={`tool-body-${block.id}`}>
              <DiffBody lines={block.output} />
            </div>
          )}
          {!collapsed && !block.isDiff && block.output.length > 0 && (
            <PlainToolBody
              id={`tool-body-${block.id}`}
              text={block.isSources ? "" : outputText}
            >
              {block.isSources ? (
                <SourceList sources={parseSearchResults(outputText)} />
              ) : block.isMarkdown ? (
                <div className="md">
                  <MarkdownView theme={theme}>{outputText}</MarkdownView>
                </div>
              ) : (
                outputText
              )}
            </PlainToolBody>
          )}
          {!block.done && block.tail && (
            <PlainToolBody
              id={collapsed || block.output.length === 0 ? `tool-body-${block.id}` : undefined}
              text={block.tail.slice(-400)}
            >
              {block.tail.slice(-400)}
            </PlainToolBody>
          )}
        </div>
      );
    }
    case "thinking": {
      if (!showThinkingRows(density)) return null;
      const collapsed = thinkingCollapsed(density, block.collapsed);
      const label =
        block.seconds != null && block.seconds >= 1
          ? `Thought for ${block.seconds}s`
          : "Thinking";
      return (
        <div className={`thinking-row${!collapsed ? " is-open" : ""}`}>
          <button
            type="button"
            className="thinking-head"
            onClick={() => onToggle(block.id)}
            aria-expanded={!collapsed}
            aria-controls={`thinking-body-${block.id}`}
            aria-label={`${collapsed ? "Expand" : "Collapse"} ${label}`}
          >
            <span className="thinking-label">
              <IconChevron open={!collapsed} size={13} />
              <IconBrain size={13} />
              <span>{label}</span>
            </span>
          </button>
          {!collapsed && (
            <div className="thinking-body has-copy" id={`thinking-body-${block.id}`}>
              {block.text ? <CopyButton text={block.text} label="Copy thinking" /> : null}
              {block.text}
            </div>
          )}
        </div>
      );
    }
    case "notice":
      {
        const memory = memoryNotice(block.text);
        return (
          <div
            className={`notice ${block.level}${memory ? " memory-notice" : ""}`}
            role={block.level === "error" ? "alert" : "status"}
          >
            {memory ? (
              <>
                <div className="memory-notice-head">
                  <span className="memory-notice-icon" aria-hidden="true">
                    <IconBrain size={15} />
                  </span>
                  <span className="memory-notice-title">Memory loaded</span>
                  <span className="memory-notice-count">
                    {memory.count} {memory.count === "1" ? "prior note" : "prior notes"}
                  </span>
                </div>
                {memory.detail ? <p className="memory-notice-detail">{memory.detail}</p> : null}
              </>
            ) : (
              block.text
            )}
          </div>
        );
      }
    default:
      return null;
  }
}

export function TranscriptView({
  turns,
  hiddenCount,
  revealPage,
  foldedTurns,
  density,
  theme,
  itemWindowFor,
  onToggleBlock,
  onToggleTurn,
  onShowEarlier,
  onRevealTurnItems,
  followSignal,
}: {
  turns: Turn[];
  hiddenCount: number;
  revealPage: number;
  foldedTurns: Set<number>;
  density: TranscriptDensity;
  theme: string;
  itemWindowFor: (turnKey: number, itemCount: number) => {
    start: number;
    hidden: number;
    revealPage: number;
  };
  onToggleBlock: (id: number) => void;
  onToggleTurn: (key: number) => void;
  onShowEarlier: () => void;
  onRevealTurnItems: (turnKey: number, hidden: number) => void;
  followSignal: number;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [anchored, setAnchored] = useState(true);
  const [now, setNow] = useState(Date.now());
  const hasLiveTool = turns.some((turn) =>
    turn.items.some((block) => block.kind === "tool" && !block.done),
  );

  const scrollToLatest = (behavior: ScrollBehavior = "auto") => {
    const element = scrollRef.current;
    if (!element) return;
    element.scrollTo({ top: element.scrollHeight, behavior: scrollBehavior(behavior) });
  };

  useEffect(() => {
    if (!hasLiveTool) return;
    const timer = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(timer);
  }, [hasLiveTool]);

  useEffect(() => {
    setAnchored(true);
    window.requestAnimationFrame(() => scrollToLatest("auto"));
  }, [followSignal]);

  useLayoutEffect(() => {
    if (anchored) scrollToLatest("auto");
  }, [turns, foldedTurns, density, anchored]);

  const handleScroll = () => {
    const element = scrollRef.current;
    if (!element) return;
    setAnchored(isScrollAnchored(element));
  };

  return (
    <div className="transcript-shell">
      <div
        className="transcript"
        ref={scrollRef}
        onScroll={handleScroll}
        role="region"
        aria-label="Conversation transcript"
      >
        <div className="transcript-content">
          {hiddenCount > 0 && (
            <button type="button" className="earlier" onClick={onShowEarlier}>
              <span className="earlier-label">
                Load {revealPage} earlier turn{revealPage === 1 ? "" : "s"}
              </span>
              <span className="earlier-meta">{hiddenCount} hidden</span>
            </button>
          )}
          {turns.map((turn) => {
            const folded = foldedTurns.has(turn.key);
            const itemWindow = itemWindowFor(turn.key, turn.items.length);
            const visibleItems = turn.items.slice(itemWindow.start);
            // One-click expand-all-tools-in-turn (I23). Only meaningful when the
            // density allows expansion (quiet forces all tools collapsed) and
            // there are collapsed tool blocks to open — so it adds no standing chrome.
            const collapsedToolIds =
              density !== "quiet" && !folded
                ? visibleItems
                    .filter((b) => b.kind === "tool" && toolCollapsed(density, b))
                    .map((b) => b.id)
                : [];
            return (
              <section className="turn" key={turn.key} aria-label={turn.user ? "Conversation turn" : "Assistant activity"}>
                <div className="turn-content" id={`turn-items-${turn.key}`}>
                  {!turn.user && collapsedToolIds.length > 0 ? (
                    <button
                      type="button"
                      className="turn-expand-all"
                      onClick={() => collapsedToolIds.forEach((id) => { onToggleBlock(id); })}
                      aria-label={`Expand all ${collapsedToolIds.length} tool${collapsedToolIds.length === 1 ? "" : "s"} in this turn`}
                      title={`Expand all ${collapsedToolIds.length} tool${collapsedToolIds.length === 1 ? "" : "s"}`}
                    >
                      Expand all tools
                    </button>
                  ) : null}
                  {turn.user && (
                    <div className="block-user-row">
                      <div
                        className="block-user"
                        role="button"
                        tabIndex={0}
                        aria-expanded={!folded}
                        aria-controls={`turn-items-${turn.key}`}
                        aria-label={folded ? "Expand user message" : "Collapse user message"}
                        onClick={() => onToggleTurn(turn.key)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            onToggleTurn(turn.key);
                          }
                        }}
                      >
                        <span className="block-user-text">{turn.user.text}</span>
                        {folded ? (
                          <span className="folded-hint">{turn.items.length} hidden</span>
                        ) : null}
                      </div>
                    </div>
                  )}
                  {!folded && itemWindow.hidden > 0 && (
                    <button
                      type="button"
                      className="earlier earlier-items"
                      onClick={() => onRevealTurnItems(turn.key, itemWindow.hidden)}
                    >
                      Load {itemWindow.revealPage} earlier item{itemWindow.revealPage === 1 ? "" : "s"}
                      <span className="earlier-meta"> · {itemWindow.hidden} hidden</span>
                    </button>
                  )}
                  {!folded &&
                    visibleItems.map((b) => (
                      <BlockView
                        key={b.id}
                        block={b}
                        density={density}
                        theme={theme}
                        now={now}
                        onToggle={onToggleBlock}
                      />
                    ))}
                </div>
              </section>
            );
          })}
        </div>
      </div>
      {!anchored && (
        <button
          type="button"
          className="jump-latest"
          onClick={() => {
            setAnchored(true);
            scrollToLatest("smooth");
          }}
          aria-label="Jump to latest messages"
        >
          Jump to latest
        </button>
      )}
    </div>
  );
}
