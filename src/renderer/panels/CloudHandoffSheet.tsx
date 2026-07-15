import { useEffect, useRef, useState, type CSSProperties } from "react";
import type {
  CloudFailureDetails,
  CloudProviderId,
  CloudSessionCatalogEntry,
  CloudSettingsPublic,
  CloudStatusEvent,
} from "../../shared/cloud";
import { CLOUD_STARTUP_STAGES, cloudHandoffActionLabel } from "../../shared/cloud-progress";

export function CloudHandoffSheet({
  cwd,
  sessionId,
  cloudSession,
  busy,
  requestedTarget,
  requestedProvider,
  initialInstruction,
  progress,
  onClose,
  onComplete,
  onWorkingChange,
}: {
  cwd: string;
  sessionId: string;
  cloudSession: CloudSessionCatalogEntry | null;
  busy: boolean;
  requestedTarget?: "cloud" | "local";
  requestedProvider?: CloudProviderId;
  initialInstruction?: string;
  progress: CloudStatusEvent | null;
  onClose: () => void;
  onComplete: (message: string, cwd?: string) => void | Promise<void>;
  onWorkingChange?: (working: boolean) => void;
}) {
  const [settings, setSettings] = useState<CloudSettingsPublic | null>(null);
  const [provider, setProvider] = useState<CloudProviderId>("e2b");
  const [instruction, setInstruction] = useState(initialInstruction ?? "");
  const [keepCloudCopy, setKeepCloudCopy] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [failure, setFailure] = useState<CloudFailureDetails | null>(null);
  const [now, setNow] = useState(Date.now());
  const dialogRef = useRef<HTMLElement>(null);
  const resumeLocal = requestedTarget === "local" || (requestedTarget === undefined && cloudSession !== null);

  useEffect(() => {
    dialogRef.current?.focus();
  }, []);

  useEffect(() => {
    onWorkingChange?.(working);
    return () => onWorkingChange?.(false);
  }, [onWorkingChange, working]);

  useEffect(() => {
    if (!working) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [working]);

  useEffect(() => {
    void window.vibe.cloudSettings().then((result) => {
      if (!result.ok) { setError(result.error); return; }
      setSettings(result.value);
      setProvider(requestedProvider ?? result.value.lastProvider);
      if (resumeLocal && cloudSession) setKeepCloudCopy(!result.value.deleteOnReturn);
    });
  }, [cloudSession, requestedProvider, resumeLocal]);

  const configured = settings?.providers[provider].configured ?? false;
  const go = async () => {
    setWorking(true);
    setError(null);
    setFailure(null);
    if (resumeLocal) {
      if (!cloudSession) {
        setWorking(false);
        setError("This session is already running locally");
        return;
      }
      try {
        const result = await window.vibe.resumeCloudSessionLocally(sessionId, keepCloudCopy);
        if (!result.ok) { setError(result.error); return; }
        await onComplete(
          result.value.divergent ? "Cloud work resumed in a safe review worktree" : "Cloud work synced and resumed locally",
          result.value.cwd,
        );
      } catch (requestError) {
        setError(requestError instanceof Error ? requestError.message : "Cloud return could not be started");
      } finally {
        setWorking(false);
      }
      return;
    }
    try {
      const result = await window.vibe.handoffToCloud({ cwd, provider, instruction: instruction.trim() || undefined });
      if (!result.ok) {
        setError(result.error);
        setFailure(result.details ?? null);
        return;
      }
      await onComplete("Session is now running in Cloud");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Cloud handoff could not be started");
    } finally {
      setWorking(false);
    }
  };

  const activeStageIndex = progress?.stage ? CLOUD_STARTUP_STAGES.findIndex((stage) => stage.id === progress.stage) : -1;
  const elapsedSeconds = working && progress?.startedAt ? Math.max(0, Math.floor((now - progress.startedAt) / 1_000)) : 0;

  return (
    <div className="modal-overlay cloud-handoff-backdrop">
      <section ref={dialogRef} tabIndex={-1} className="cloud-handoff-sheet" role="dialog" aria-modal="true" aria-labelledby="cloud-handoff-title">
        <header className="cloud-handoff-header">
          <div>
            <h2 id="cloud-handoff-title">{resumeLocal ? "Resume locally" : "Continue in Cloud"}</h2>
            <p>{resumeLocal ? "Verify the cloud delta before changing local files." : "Review what crosses the local/cloud boundary."}</p>
          </div>
          <button type="button" className="icon-button" aria-label="Close" onClick={onClose} disabled={working}>×</button>
        </header>

        <div className="cloud-handoff-body">
          {resumeLocal && cloudSession ? (
            <>
              <div className="cloud-preflight-grid">
                <span>Session</span><strong>{sessionId}</strong>
                <span>Provider</span><strong>{cloudSession.provider === "e2b" ? "E2B" : "Vercel"}</strong>
                <span>Destination</span><strong>{cwd}</strong>
                <span>Conflict policy</span><strong>Safe worktree on any divergence</strong>
              </div>
              <label className="cloud-check-row"><input type="checkbox" checked={keepCloudCopy} onChange={(event) => setKeepCloudCopy(event.target.checked)} /><span>Keep the remote sandbox after the verified local start</span></label>
            </>
          ) : (
            <>
              <div className="cloud-provider-choice" role="radiogroup" aria-label="Cloud provider">
                {(["e2b", "vercel"] as const).map((id) => (
                  <button key={id} type="button" role="radio" aria-checked={provider === id} className={`setting-card cloud-provider-option${provider === id ? " selected" : ""}`} onClick={() => setProvider(id)}>
                    <strong>{id === "e2b" ? "E2B" : "Vercel"}</strong>
                    <span>{settings?.providers[id].configured ? "Connected" : "Setup required"}</span>
                  </button>
                ))}
              </div>
              <div className="cloud-preflight-grid">
                <span>Boundary</span><strong>{busy ? "Queues until engine-idle" : "Engine is idle"}</strong>
                <span>Workspace</span><strong>{cwd}</strong>
                <span>Included</span><strong>Git state, project files, portable session state</strong>
                <span>Excluded</span><strong>Ignored files, .env*, SSH and credential material</strong>
                <span>Mac-only tools</span><strong>Explicit relay or durable Needs your Mac pause</strong>
                <span>Remote processes</span><strong>Portable jobs restart from recorded commands</strong>
              </div>
              <label className="setting-field cloud-instruction-field">
                <span className="setting-label">Continue with (optional)</span>
                <textarea className="setting-textarea" rows={3} value={instruction} onChange={(event) => setInstruction(event.target.value)} placeholder="What should the cloud session do next?" />
              </label>
              {provider === "e2b" && <p className="setting-empty" role="note">E2B pause can retain guest memory. Use revocable, sandbox-scoped keys.</p>}
              {provider === "vercel" && <p className="setting-empty" role="note">Credential brokering is used when the connected Vercel plan supports it; otherwise the app warns before narrowly scoped injection.</p>}
              <p className="setting-empty" role="note">Your provider may continue billing until this sandbox auto-pauses or is deleted.</p>
            </>
          )}
          {resumeLocal && !cloudSession && <p className="settings-save-error" role="alert">This session is already running locally.</p>}
          {!settings?.experimentalEnabled && !resumeLocal && <p className="settings-save-error" role="alert">Enable experimental Cloud in Settings → Cloud first.</p>}
          {!configured && !resumeLocal && <p className="settings-save-error" role="alert">Connect and test {provider === "e2b" ? "E2B" : "Vercel"} in Settings → Cloud first.</p>}
          {error && <p className="settings-save-error" role="alert">{error}</p>}
          {failure && (
            <details className="cloud-failure-details">
              <summary>Technical details</summary>
              <pre>{`Stage: ${failure.stage}\nCode: ${failure.code}${failure.diagnostic ? `\n\n${failure.diagnostic}` : ""}`}</pre>
            </details>
          )}
          {!resumeLocal && working && (
            <section className="cloud-startup-progress" aria-label="Cloud handoff progress">
              <div className="cloud-progress-heading" role="status" aria-live="polite" aria-atomic="true">
                {working && <span className="spinner" aria-hidden />}
                <div>
                  <strong>{working ? progress?.message ?? "Starting cloud handoff…" : error ? "Cloud handoff stopped" : "Cloud handoff ready"}</strong>
                  {working && <span>{elapsedSeconds}s elapsed</span>}
                </div>
              </div>
              <div className="cloud-progress-track" aria-hidden>
                <span style={{ "--cloud-progress": progress?.progress ?? 0.03 } as CSSProperties} />
              </div>
              <ol className="cloud-stage-list">
                {CLOUD_STARTUP_STAGES.map((stage, index) => (
                  <li key={stage.id} className={index < activeStageIndex ? "is-complete" : index === activeStageIndex ? "is-active" : undefined}>
                    <span aria-hidden>{index < activeStageIndex ? "✓" : index === activeStageIndex ? "•" : ""}</span>
                    {stage.label}
                  </li>
                ))}
              </ol>
            </section>
          )}
        </div>

        <footer className="cloud-handoff-footer">
          <button type="button" className="button" disabled={working} onClick={onClose}>Cancel</button>
          <button type="button" className="button primary" disabled={working || (resumeLocal ? !cloudSession : (!settings?.experimentalEnabled || !configured))} onClick={() => void go()}>
            {resumeLocal
              ? working ? "Verifying and syncing…" : "Verify and resume locally"
              : cloudHandoffActionLabel(working, error, failure)}
          </button>
        </footer>
      </section>
    </div>
  );
}
