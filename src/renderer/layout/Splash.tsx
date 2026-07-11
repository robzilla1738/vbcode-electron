import { WORDMARK } from "../../shared/wordmark";
import { IconArrowRight } from "../icons";

export const STARTERS = [
  {
    title: "Understand the codebase",
    prompt: "Explain this codebase",
    detail: "Map the architecture and important paths",
  },
  {
    title: "Fix what’s broken",
    prompt: "Fix the failing test",
    detail: "Trace the failure and make the smallest sound fix",
  },
  {
    title: "Build a feature",
    prompt: "Add a --json flag",
    detail: "Implement it cleanly with existing conventions",
  },
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
      {STARTERS.map((starter) => (
        <li key={starter.prompt}>
          <button
            type="button"
            className="starter-pill"
            onClick={() => onStarter(starter.prompt)}
            aria-label={`Start with: ${starter.prompt}`}
          >
            <span className="starter-copy">
              <span className="starter-title">{starter.title}</span>
              <span className="starter-detail">{starter.detail}</span>
            </span>
            <IconArrowRight size={14} />
          </button>
        </li>
      ))}
    </ul>
  );
}
