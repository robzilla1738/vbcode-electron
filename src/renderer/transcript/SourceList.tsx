import type { SourceItem } from "../../shared/sources";
import { ExternalLink } from "../primitives";

export function SourceList({ sources }: { sources: SourceItem[] }) {
  if (!sources.length) {
    return (
      <div className="source-empty" role="status">
        No sources returned.
      </div>
    );
  }
  return (
    <ol className="source-list" aria-label="Sources">
      {sources.map((source, index) => (
        <li key={`${source.url ?? source.title}-${index}`} className="source-card">
          {source.url ? (
            <ExternalLink href={source.url}>{source.title}</ExternalLink>
          ) : (
            <span className="source-title">{source.title}</span>
          )}
          {source.domain && <span className="source-domain">{source.domain}</span>}
          {source.snippet && <span className="source-snippet">{source.snippet}</span>}
        </li>
      ))}
    </ol>
  );
}
