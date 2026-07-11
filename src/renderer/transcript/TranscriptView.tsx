import { useEffect, useLayoutEffect, useRef, useState } from "react";
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

function DiffBody({ lines }: { lines: string[] }) {
  return (
    <div className="tool-body">
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

function BlockView({
  block,
  density,
  now,
  onToggle,
}: {
  block: Block;
  density: TranscriptDensity;
  now: number;
  onToggle: (id: number) => void;
}) {
  switch (block.kind) {
    case "assistant":
      return (
        <div className={`block-assistant${block.streaming ? " streaming" : ""}`}>
          <div className="md">
            <MarkdownView streaming={block.streaming}>{block.text}</MarkdownView>
          </div>
        </div>
      );
    case "tool": {
      const collapsed = toolCollapsed(density, block);
      const dur = toolDurationLabel(block, now);
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
              <IconChevron open={!collapsed} size={12} />
              <ToolGlyph toolName={block.toolName} />
              <span>
                {!block.done ? (
                  <span className="working-shimmer">{stripToolGlyph(block.label)}</span>
                ) : (
                  stripToolGlyph(block.label)
                )}
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
            <div className="tool-body" id={`tool-body-${block.id}`}>
              {block.isSources ? (
                <SourceList sources={parseSearchResults(block.output.join("\n"))} />
              ) : block.isMarkdown ? (
                <div className="md">
                  <MarkdownView>{block.output.join("\n")}</MarkdownView>
                </div>
              ) : (
                block.output.join("\n")
              )}
            </div>
          )}
          {!block.done && block.tail && (
            <div className="tool-body" id={collapsed || block.output.length === 0 ? `tool-body-${block.id}` : undefined}>
              {block.tail.slice(-400)}
            </div>
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
              <IconChevron open={!collapsed} size={12} />
              <IconBrain size={13} />
              <span>{label}</span>
            </span>
          </button>
          {!collapsed && (
            <div className="thinking-body" id={`thinking-body-${block.id}`}>
              {block.text}
            </div>
          )}
        </div>
      );
    }
    case "notice":
      return (
        <div className={`notice ${block.level}`} role={block.level === "error" ? "alert" : "status"}>
          {block.text}
        </div>
      );
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
    element.scrollTo({ top: element.scrollHeight, behavior });
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
        role="log"
        aria-label="Conversation transcript"
        aria-live="polite"
        aria-relevant="additions text"
      >
        <div className="transcript-content">
          {hiddenCount > 0 && (
            <button type="button" className="earlier" onClick={onShowEarlier}>
              {hiddenCount} earlier turn{hiddenCount === 1 ? "" : "s"} · load {revealPage} more
            </button>
          )}
          {turns.map((turn) => {
            const folded = foldedTurns.has(turn.key);
            const itemWindow = itemWindowFor(turn.key, turn.items.length);
            const visibleItems = turn.items.slice(itemWindow.start);
            return (
              <section className="turn" key={turn.key} aria-label={turn.user ? "Conversation turn" : "Assistant activity"}>
                <div className="turn-content" id={`turn-items-${turn.key}`}>
                  {turn.user && (
                    <button
                      type="button"
                      className="block-user"
                      onClick={() => onToggleTurn(turn.key)}
                      aria-expanded={!folded}
                      aria-controls={`turn-items-${turn.key}`}
                      aria-label={folded ? "Expand turn" : "Collapse turn"}
                    >
                      <span className="block-user-text">{turn.user.text}</span>
                      {folded ? <span className="folded-hint">{turn.items.length} hidden</span> : null}
                    </button>
                  )}
                  {!folded && itemWindow.hidden > 0 && (
                    <button
                      type="button"
                      className="earlier earlier-items"
                      onClick={() => onRevealTurnItems(turn.key, itemWindow.hidden)}
                    >
                      {itemWindow.hidden} earlier item{itemWindow.hidden === 1 ? "" : "s"} in this turn · load{" "}
                      {itemWindow.revealPage} more
                    </button>
                  )}
                  {!folded &&
                    visibleItems.map((b) => (
                      <BlockView
                        key={b.id}
                        block={b}
                        density={density}
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
