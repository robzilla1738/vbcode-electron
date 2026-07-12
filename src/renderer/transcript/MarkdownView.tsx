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
 * Rich fences (chart / sources / …) stay custom; normal fences use Streamdown’s
 * Shiki CodeBlock so we get highlighting + line numbers + our CopyButton.
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

const components: Components = {
  a: ({ href, children }) => <ExternalLink href={href}>{children}</ExternalLink>,
  code: Code,
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

  return (
    <Streamdown
      mode={streaming ? "streaming" : "static"}
      isAnimating={streaming}
      parseIncompleteMarkdown
      controls={{ code: false, table: { copy: true, download: false }, mermaid: false }}
      lineNumbers
      shikiTheme={shikiTheme}
      animated={false}
      components={components}
    >
      {children}
    </Streamdown>
  );
}
