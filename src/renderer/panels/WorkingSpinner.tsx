import { useEffect, useState } from "react";
import { workingLabel } from "../../shared/spinner";

export function WorkingSpinner({ thinking }: { thinking: string }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const start = Date.now();
    setElapsed(0);
    const timer = setInterval(() => setElapsed(Date.now() - start), 100);
    return () => clearInterval(timer);
  }, []);
  const label = workingLabel(elapsed);
  return (
    <div
      className="working-strip"
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label={`${label}. Press Escape to interrupt.`}
    >
      <span className="spinner" aria-hidden />
      <div className="working-copy">
        <div className="working-title">
          <span className="working-shimmer" aria-hidden>
            {label}
          </span>
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
