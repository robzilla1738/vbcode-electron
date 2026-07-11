import { isValidElement, type ComponentPropsWithoutRef, type ReactNode } from "react";
import { Streamdown, type Components, type ExtraProps } from "streamdown";
import { externalHref, parseSources } from "../../shared/sources";
import { richKind } from "../../shared/rich-blocks";
import { getTheme } from "../../shared/themes";
import { SourceList } from "./SourceList";
import { RichBlockView } from "./RichBlockView";

function ExternalLink({ href, children }: { href?: string; children?: ReactNode }) {
  const safeHref = externalHref(href);
  if (!safeHref) return <span>{children}</span>;
  return (
    <a
      href={safeHref}
      title={safeHref}
      onClick={(event) => {
        event.preventDefault();
        void window.vibe.openExternal(safeHref);
      }}
    >
      {children}
    </a>
  );
}

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
 * Plain semantic code — keeps our `.md` CSS in charge (no Tailwind chrome).
 * Rich fences (chart / sources / …) render as visual components.
 */
function Code({ className, children, ...props }: CodeProps) {
  const isBlock = "data-block" in props;
  if (!isBlock) {
    return <code className={className}>{children}</code>;
  }

  const lang = fenceLang(className);
  const body = fenceBody(children);
  const kind = richKind(lang);

  if (kind === "sources") {
    return <SourceList sources={parseSources(body)} />;
  }
  if (kind) {
    return <RichBlockView lang={lang} body={body} palette={currentPalette()} />;
  }

  return (
    <pre>
      <code className={className}>{children}</code>
    </pre>
  );
}

const components: Components = {
  a: ({ href, children }) => <ExternalLink href={href}>{children}</ExternalLink>,
  code: Code,
};

export function MarkdownView({
  children,
  streaming = false,
}: {
  children: string;
  streaming?: boolean;
}) {
  return (
    <Streamdown
      mode={streaming ? "streaming" : "static"}
      isAnimating={streaming}
      parseIncompleteMarkdown
      controls={false}
      lineNumbers={false}
      animated={false}
      components={components}
    >
      {children}
    </Streamdown>
  );
}
