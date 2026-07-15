import { useEffect, useRef, useState } from "react";
import type { CloudProviderId, CloudSessionCatalogEntry, CloudSettingsPublic } from "../../shared/cloud";

export function CloudHandoffSheet({
  cwd,
  sessionId,
  cloudSession,
  busy,
  requestedTarget,
  requestedProvider,
  initialInstruction,
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
    if (resumeLocal) {
      if (!cloudSession) {
        setWorking(false);
        setError("This session is already running locally");
        return;
      }
      const result = await window.vibe.resumeCloudSessionLocally(sessionId, keepCloudCopy);
      setWorking(false);
      if (!result.ok) { setError(result.error); return; }
      await onComplete(
        result.value.divergent ? "Cloud work resumed in a safe review worktree" : "Cloud work synced and resumed locally",
        result.value.cwd,
      );
      return;
    }
    const result = await window.vibe.handoffToCloud({ cwd, provider, instruction: instruction.trim() || undefined });
    setWorking(false);
    if (!result.ok) { setError(result.error); return; }
    await onComplete("Session is now running in Cloud");
  };

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
        </div>

        <footer className="cloud-handoff-footer">
          <button type="button" className="button" disabled={working} onClick={onClose}>Cancel</button>
          <button type="button" className="button primary" disabled={working || (resumeLocal ? !cloudSession : (!settings?.experimentalEnabled || !configured))} onClick={() => void go()}>
            {working ? (resumeLocal ? "Verifying and syncing…" : "Preparing handoff…") : resumeLocal ? "Verify and resume locally" : "Confirm and continue in Cloud"}
          </button>
        </footer>
      </section>
    </div>
  );
}
