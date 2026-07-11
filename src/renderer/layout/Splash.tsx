import { WORDMARK } from "../../shared/wordmark";

const STARTERS = [
  "Explain this codebase",
  "Fix the failing test",
  "Add a --json flag",
];

export function Splash({ onStarter }: { onStarter: (text: string) => void }) {
  return (
    <div className="splash">
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
          <h1>What should we build?</h1>
          <p>
            Describe the outcome. Vibe Codr will inspect the project, make the change, and show its
            work.
          </p>
        </div>

        <ul className="starters">
          {STARTERS.map((s) => (
            <li key={s} className="starter-item">
              <button
                type="button"
                className="starter"
                onClick={() => onStarter(s)}
              >
                <span>{s}</span>
                <span className="starter-arrow" aria-hidden>
                  ›
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
