import { WORDMARK } from "../../shared/wordmark";

export function Splash() {
  return (
    <section className="splash" aria-labelledby="splash-brand-title">
      <div className="splash-inner">
        <h1 id="splash-brand-title" className="sr-only">
          Vibe Codr
        </h1>
        <div className="splash-brand" aria-hidden>
          <pre className="splash-wordmark">{WORDMARK.join("\n")}</pre>
        </div>

        <p className="splash-tagline">Ask Vibe Codr to plan, build, or review this project.</p>
      </div>
    </section>
  );
}
