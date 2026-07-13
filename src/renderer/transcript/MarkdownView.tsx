import { isValidElement, type ComponentPropsWithoutRef, type ReactNode } from "react";
import {
  CodeBlock,
  Streamdown,
  type Components,
  type ExtraProps,
  type ThemeInput,
} from "streamdown";
import { parseSources } from "../../shared/sources";
import { richKind } from "../../shared/rich-blocks";
import { getTheme } from "../../shared/themes";
import { shikiThemeFor } from "../../shared/shiki-theme";
import { CopyButton } from "../CopyButton";
import { ExternalLink } from "../primitives";
import { SourceList } from "./SourceList";
import { RichBlockView } from "./RichBlockView";

/** Resolve the current palette from `data-theme` (set by applyPalette). */
function currentPalette() {
  const themeName = document.documentElement.dataset.theme;
  return getTheme(themeName);
}

function fenceBody(children: ReactNode): string {
  if (typeof children === "string") return children.replace(/\n$/, "");
  if (isValidElement(children)) {
    const nested = (children.props as { children?: ReactNode }).children;
    if (typeof nested === "string") return nested.replace(/\n$/, "");
  }
  if (Array.isArray(children)) {
    return children.map((child) => (typeof child === "string" ? child : "")).join("").replace(/\n$/, "");
  }
  return "";
}

function fenceLang(className?: string): string {
  const match = className?.match(/language-(\S+)/);
  return match?.[1] ?? "";
}

type CodeProps = ComponentPropsWithoutRef<"code"> & ExtraProps;

/**
 * Static (finalized) fences: Shiki CodeBlock + line numbers + copy.
 * Streaming path must NEVER use this — see `streamingCodeComponents`.
 */
function Code({ className, children, ...props }: CodeProps) {
  const isBlock = "data-block" in props;
  if (!isBlock) {
    return (
      <code className={className} data-streamdown="inline-code">
        {children}
      </code>
    );
  }

  const lang = fenceLang(className);
  const body = fenceBody(children);
  const kind = richKind(lang);
  const incomplete = Boolean((props as { "data-incomplete"?: unknown })["data-incomplete"]);

  if (kind === "sources") {
    return <SourceList sources={parseSources(body)} />;
  }
  if (kind) {
    return <RichBlockView lang={lang} body={body} palette={currentPalette()} />;
  }

  return (
    <CodeBlock
      className="md-code-block"
      code={body}
      language={lang || "text"}
      lineNumbers
      isIncomplete={incomplete}
    >
      {!incomplete ? <CopyButton text={body} label="Copy code" /> : null}
    </CodeBlock>
  );
}

/** Streaming fences: plain pre/code only — no Shiki, no line numbers, no copy chrome. */
function StreamingCode({ className, children, ...props }: CodeProps) {
  const isBlock = "data-block" in props;
  if (!isBlock) {
    return (
      <code className={className} data-streamdown="inline-code">
        {children}
      </code>
    );
  }
  const lang = fenceLang(className);
  const body = fenceBody(children);
  const kind = richKind(lang);
  // Rich fences still render (cheap pure views); never CodeBlock/Shiki.
  if (kind === "sources") {
    return <SourceList sources={parseSources(body)} />;
  }
  if (kind) {
    return <RichBlockView lang={lang} body={body} palette={currentPalette()} />;
  }
  return (
    <pre className="md-code-block md-code-block-streaming" data-lang={lang || "text"}>
      <code>{body}</code>
    </pre>
  );
}

const staticComponents: Components = {
  a: ({ href, children }) => <ExternalLink href={href}>{children}</ExternalLink>,
  code: Code,
};

const streamingComponents: Components = {
  a: ({ href, children }) => <ExternalLink href={href}>{children}</ExternalLink>,
  code: StreamingCode,
};

export function MarkdownView({
  children,
  streaming = false,
  theme,
}: {
  children: string;
  streaming?: boolean;
  /** App theme name — drives Shiki highlighting. Falls back to `data-theme`. */
  theme?: string;
}) {
  const themeName = theme ?? document.documentElement.dataset.theme;
  const shikiTheme = shikiThemeFor(themeName) as [ThemeInput, ThemeInput];

  // While streaming: no Shiki theme, no lineNumbers, no CodeBlock component.
  // Re-highlighting growing markdown every flush was a main-thread hotspot.
  if (streaming) {
    return (
      <Streamdown
        mode="streaming"
        isAnimating
        parseIncompleteMarkdown
        controls={false}
        lineNumbers={false}
        animated={false}
        components={streamingComponents}
      >
        {children}
      </Streamdown>
    );
  }

  return (
    <Streamdown
      mode="static"
      isAnimating={false}
      parseIncompleteMarkdown
      controls={{ code: false, table: { copy: true, download: false }, mermaid: false }}
      lineNumbers
      shikiTheme={shikiTheme}
      animated={false}
      components={staticComponents}
    >
      {children}
    </Streamdown>
  );
}
