import { WORDMARK } from "../../shared/wordmark";

export const STARTERS = [
  "Explain this codebase",
  "Fix the failing test",
  "Add a --json flag",
];

export function Splash({
  projectLabel,
  branch,
}: {
  projectLabel?: string | null;
  branch?: string | null;
}) {
  const crumb = [projectLabel, branch].filter(Boolean).join(" / ");

  return (
    <section className="splash" aria-labelledby="splash-title">
      <div className="splash-inner">
        <div className="splash-brand" role="img" aria-label="Vibe Codr">
          <pre className="splash-wordmark" aria-hidden>
            {WORDMARK.join("\n")}
          </pre>
          <div className="splash-brand-compact" aria-hidden>
            Vibe Codr
          </div>
        </div>

        <div className="splash-copy">
          <h1 id="splash-title">What should we build?</h1>
        </div>

        {crumb ? (
          <p className="empty-home-crumb" aria-label="Project context">
            {crumb}
          </p>
        ) : null}
      </div>
    </section>
  );
}

export function StarterPills({ onStarter }: { onStarter: (text: string) => void }) {
  return (
    <ul className="starter-pills" aria-label="Starter prompts">
      {STARTERS.map((s) => (
        <li key={s}>
          <button
            type="button"
            className="starter-pill"
            onClick={() => onStarter(s)}
            aria-label={`Start with: ${s}`}
          >
            {s}
          </button>
        </li>
      ))}
    </ul>
  );
}
