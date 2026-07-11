import type { ReactNode } from "react";
import { externalHref, type SourceItem } from "../../shared/sources";

function ExternalLink({ href, children }: { href?: string; children?: ReactNode }) {
  const safeHref = externalHref(href);
  if (!safeHref) return <span>{children}</span>;
  return (
    <a
      href={safeHref}
      onClick={(event) => {
        event.preventDefault();
        void window.vibe.openExternal(safeHref);
      }}
    >
      {children}
    </a>
  );
}

export function SourceList({ sources }: { sources: SourceItem[] }) {
  if (!sources.length) return <div className="source-empty">No sources returned.</div>;
  return (
    <ol className="source-list">
      {sources.map((source, index) => {
        const href = externalHref(source.url);
        return (
          <li key={`${source.url ?? source.title}-${index}`} className="source-card">
            {href ? (
              <ExternalLink href={href}>{source.title}</ExternalLink>
            ) : (
              <span className="source-title">{source.title}</span>
            )}
            {source.domain && <span className="source-domain">{source.domain}</span>}
            {source.snippet && <span className="source-snippet">{source.snippet}</span>}
          </li>
        );
      })}
    </ol>
  );
}
