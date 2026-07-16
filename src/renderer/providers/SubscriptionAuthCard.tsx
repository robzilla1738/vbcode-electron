import { useEffect, useState } from "react";
import {
  isSubscriptionAuthStart,
  isSubscriptionAuthStatus,
  type SubscriptionAuthMethod,
  type SubscriptionAuthStatus,
  type SubscriptionProviderId,
} from "../../shared/provider-auth";

export const SUBSCRIPTION_PROVIDERS: Array<{
  id: SubscriptionProviderId;
  title: string;
  description: string;
  model: string;
}> = [
  {
    id: "openai-codex",
    title: "ChatGPT · Codex",
    description: "Use your eligible ChatGPT plan through the official Codex sign-in.",
    model: "openai-codex/gpt-5.3-codex",
  },
  {
    id: "xai-oauth",
    title: "xAI · Grok",
    description: "Use your eligible Grok subscription, including Grok Build.",
    model: "xai-oauth/grok-build-0.1",
  },
];

export function SubscriptionAuthCard({
  provider,
  onStatusChange,
}: {
  provider: (typeof SUBSCRIPTION_PROVIDERS)[number];
  onStatusChange?: (status: SubscriptionAuthStatus) => void;
}) {
  const [status, setStatus] = useState<SubscriptionAuthStatus>({ providerId: provider.id, state: "disconnected" });
  const [busy, setBusy] = useState(false);

  const readStatus = async (sessionId?: string) => {
    const result = await window.vibe.rpc("providerAuthStatus", { providerId: provider.id, ...(sessionId ? { authSessionId: sessionId } : {}) });
    if (!result.ok) throw new Error(result.error);
    if (!isSubscriptionAuthStatus(result.value)) throw new Error("The provider returned an invalid authentication status.");
    setStatus(result.value);
    return result.value;
  };

  useEffect(() => {
    let active = true;
    void readStatus().catch((error) => {
      if (active) setStatus({ providerId: provider.id, state: "error", error: error instanceof Error ? error.message : String(error) });
    });
    return () => { active = false; };
  }, [provider.id]);

  useEffect(() => {
    if (status.state !== "pending" || !status.sessionId) return;
    const sessionId = status.sessionId;
    const timer = window.setInterval(() => {
      void readStatus(sessionId).catch((error) => {
        setStatus({ providerId: provider.id, state: "error", error: error instanceof Error ? error.message : String(error) });
      });
    }, 900);
    return () => window.clearInterval(timer);
  }, [provider.id, status.sessionId, status.state]);

  useEffect(() => {
    onStatusChange?.(status);
  }, [onStatusChange, status]);

  const connect = async (method: SubscriptionAuthMethod) => {
    setBusy(true);
    try {
      const result = await window.vibe.rpc("beginProviderAuth", { providerId: provider.id, authMethod: method });
      if (!result.ok) throw new Error(result.error);
      if (!isSubscriptionAuthStart(result.value)) throw new Error("The provider returned an invalid sign-in request.");
      const next: SubscriptionAuthStatus = { ...result.value, state: "pending" };
      setStatus(next);
      if (next.url) await window.vibe.openExternal(next.url);
    } catch (error) {
      setStatus({ providerId: provider.id, state: "error", error: error instanceof Error ? error.message : String(error) });
    } finally {
      setBusy(false);
    }
  };

  const cancel = async () => {
    if (!status.sessionId) return;
    await window.vibe.rpc("cancelProviderAuth", { providerId: provider.id, authSessionId: status.sessionId });
    setStatus({ providerId: provider.id, state: "cancelled" });
  };

  const logout = async () => {
    setBusy(true);
    const result = await window.vibe.rpc("logoutProviderAuth", { providerId: provider.id });
    setBusy(false);
    setStatus(result.ok
      ? { providerId: provider.id, state: "disconnected" }
      : { providerId: provider.id, state: "error", error: result.error });
  };

  return (
    <div className="setting-card provider-auth-card">
      <div className="setting-card-header">
        <div className="setting-card-toggle provider-auth-heading">
          <span className="setting-card-title">{provider.title}</span>
          <span className="setting-field-desc">{provider.description}</span>
        </div>
        <span className={`setting-badge${status.state === "error" ? " is-warn" : ""}`}>
          {status.state === "connected" ? "connected" : status.state === "pending" ? "waiting" : status.state}
        </span>
      </div>
      <div className="provider-auth-actions">
        {status.state === "connected" ? (
          <>
            <span className="provider-auth-model">{status.accountLabel || provider.model}</span>
            <button type="button" className="button" disabled={busy} onClick={() => void logout()}>Sign out</button>
          </>
        ) : status.state === "pending" ? (
          <>
            {status.userCode && (
              <button type="button" className="provider-device-code" onClick={() => void window.vibe.writeClipboardText(status.userCode!)}>
                <span>Device code</span><strong>{status.userCode}</strong>
              </button>
            )}
            <span className="setting-field-desc">Finish signing in in your browser.</span>
            <button type="button" className="button" onClick={() => void cancel()}>Cancel</button>
          </>
        ) : (
          <>
            <button type="button" className="button primary" disabled={busy} onClick={() => void connect("browser")}>Sign in with {provider.id === "openai-codex" ? "ChatGPT" : "xAI"}</button>
            {provider.id === "xai-oauth" && <button type="button" className="button" disabled={busy} onClick={() => void connect("device")}>Use device code</button>}
          </>
        )}
      </div>
      {status.error && <p className="settings-save-error" role="alert">{status.error}</p>}
    </div>
  );
}
