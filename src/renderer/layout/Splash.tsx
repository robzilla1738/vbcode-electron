import { WORDMARK } from "../../shared/wordmark";
import { IconArrowRight } from "../icons";

// Product-specific starters (I01/S06): each names a concrete vibe-codr
// workflow and shows its detail inline. Clicking inserts the prompt into the
// composer so it can be edited before sending (I02) — no accidental submits.
export const STARTERS = [
  {
    title: "Map this codebase",
    prompt: "Explain this codebase: the architecture and the most important files.",
    detail: "Architecture tour · key paths",
  },
  {
    title: "Fix failing tests",
    prompt: "Run the tests, then fix the failure with the smallest sound change.",
    detail: "Trace · patch · re-run",
  },
  {
    title: "Review my changes",
    prompt: "Review my uncommitted changes and flag risks before I commit.",
    detail: "Diff summary · risks",
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

        <p className="splash-tagline">Ask Vibe Codr to plan, build, or review this project.</p>

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
            aria-label={`Insert starter: ${starter.prompt}`}
          >
            <span className="starter-title">{starter.title}</span>
            <span className="starter-detail">{starter.detail}</span>
            <IconArrowRight size={13} />
          </button>
        </li>
      ))}
    </ul>
  );
}
