import { WORDMARK } from "../../shared/wordmark";
import { IconArrowRight } from "../icons";

export const STARTERS = [
  {
    title: "Explore the codebase",
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
    <section className="splash" aria-labelledby="splash-brand-title">
      <div className="splash-inner">
        <h1 id="splash-brand-title" className="sr-only">
          Vibe Codr
        </h1>
        <div className="splash-brand" aria-hidden>
          <pre className="splash-wordmark">{WORDMARK.join("\n")}</pre>
          <div className="splash-brand-compact">Vibe Codr</div>
        </div>

        <p className="splash-tagline">What should we build?</p>

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
            title={starter.detail}
            aria-label={`Start with: ${starter.prompt}`}
          >
            <span className="starter-title">{starter.title}</span>
            <IconArrowRight size={13} />
          </button>
        </li>
      ))}
    </ul>
  );
}
