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
  return (
    <div className="working-strip" role="status">
      <span className="spinner" aria-hidden />
      <div className="working-copy">
        <div className="working-title">
          <span className="working-shimmer">{workingLabel(elapsed)}</span>
          <span className="working-hint">esc to interrupt</span>
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
