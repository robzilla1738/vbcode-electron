import { useEffect, useState } from "react";

export function WorkingSpinner({ thinking }: { thinking: string }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const start = Date.now();
    setElapsed(0);
    const timer = setInterval(() => setElapsed(Date.now() - start), 100);
    return () => clearInterval(timer);
  }, []);
  const elapsedLabel = elapsed >= 100 ? `${(elapsed / 1000).toFixed(1)}s` : null;
  return (
    <div
      className="working-strip"
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label="Vibe Codr is working. Press Escape to interrupt."
    >
      <span className="spinner" aria-hidden />
      <div className="working-copy">
        <div className="working-title">
          <span className="working-shimmer" aria-hidden>
            Working
          </span>
          {elapsedLabel ? <span className="working-elapsed" aria-hidden>{elapsedLabel}</span> : null}
          <span className="working-hint" aria-hidden>
            esc to interrupt
          </span>
        </div>
        {thinking && (
          <div className="working-detail">
            {thinking.replace(/\s+/g, " ").slice(-120)}
          </div>
        )}
      </div>
    </div>
  );
}
