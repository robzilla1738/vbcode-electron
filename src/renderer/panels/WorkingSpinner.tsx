export function WorkingSpinner({ thinking }: { thinking: string }) {
  return (
    <div className="working-strip" role="status">
      <span className="spinner" aria-hidden />
      <div className="working-copy">
        <div className="working-title">
          <span className="working-shimmer">Working…</span>
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
