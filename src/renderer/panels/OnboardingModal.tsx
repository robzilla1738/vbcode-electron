/**
 * First-run provider setup wizard — the GUI equivalent of the CLI's
 * `vibecodr setup`. Shows the curated provider catalog, collects an API key
 * (or skips for keyless/local providers), and saves the config patch so the
 * engine can use the provider on the next bootstrap.
 *
 * Replaces the passive OnboardingHint strip with an actionable modal that
 * mirrors the CLI's onboarding choices, key URLs, and default models.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  PROVIDER_CHOICES,
  buildOnboardingPatch,
  initialChoiceIndex,
  type ProviderChoice,
} from "../../shared/providers-catalog";
import { IconClose, IconExternalLink } from "../icons";

export interface ProviderStatus {
  id: string;
  configured: boolean;
  keyless: boolean;
  env: string[];
}

export function OnboardingModal({
  providers,
  onSave,
  onDismiss,
  saving,
  saveError,
}: {
  /** Live provider status from the engine's listProviders RPC (may be empty
   * before the first bootstrap completes). */
  providers?: ProviderStatus[];
  onSave: (patch: Record<string, unknown>) => Promise<void>;
  onDismiss: () => void;
  saving?: boolean;
  saveError?: string | null;
}) {
  const configuredIds = useMemo(
    () => new Set((providers ?? []).filter((p) => p.configured).map((p) => p.id)),
    [providers],
  );

  const initialIdx = useMemo(
    () => initialChoiceIndex(PROVIDER_CHOICES, {}, configuredIds),
    [configuredIds],
  );

  const [selectedIdx, setSelectedIdx] = useState(initialIdx);
  const [apiKey, setApiKey] = useState("");
  const [baseURL, setBaseURL] = useState("");
  const [model, setModel] = useState(PROVIDER_CHOICES[initialIdx]?.defaultModel ?? "");
  const listRef = useRef<HTMLDivElement>(null);

  const choice: ProviderChoice = PROVIDER_CHOICES[selectedIdx] ?? PROVIDER_CHOICES[0]!;

  // Reset key/model when switching provider choice.
  useEffect(() => {
    setApiKey("");
    setBaseURL("");
    setModel(choice.defaultModel);
  }, [selectedIdx, choice.defaultModel]);

  const needsKey = !choice.localKeyless && !choice.customEndpoint && choice.registryId !== "";
  const needsBaseURL = choice.customEndpoint === true;
  const canSave = model.trim().length > 0 && (!needsKey || apiKey.trim().length > 0) && (!needsBaseURL || baseURL.trim().length > 0);

  const handleSave = () => {
    if (!canSave || saving) return;
    const patch = buildOnboardingPatch({
      model: model.trim(),
      providerId: choice.registryId,
      apiKey: needsKey ? apiKey.trim() || undefined : undefined,
      baseURL: needsBaseURL ? baseURL.trim() || undefined : undefined,
    });
    void onSave(patch);
  };

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="onboarding-modal-title">
      <div className="onboarding-modal">
        <header className="onboarding-modal-header">
          <div>
            <h2 id="onboarding-modal-title">Set up a model provider</h2>
            <p className="onboarding-modal-sub">
              Choose a provider to start coding. You can change this anytime in Settings.
            </p>
          </div>
          <button type="button" className="icon-button no-drag" onClick={onDismiss} aria-label="Dismiss setup">
            <IconClose size={16} />
          </button>
        </header>

        <div className="onboarding-modal-body">
          <div className="onboarding-provider-list" ref={listRef}>
            {PROVIDER_CHOICES.map((c, i) => (
              <button
                key={c.key}
                type="button"
                className={`onboarding-provider-item${i === selectedIdx ? " selected" : ""}`}
                onClick={() => setSelectedIdx(i)}
              >
                <span className="onboarding-provider-label">{c.label}</span>
                <span className="onboarding-provider-blurb">{c.blurb}</span>
                {configuredIds.has(c.registryId) && c.registryId !== "" && (
                  <span className="onboarding-provider-check">✓ configured</span>
                )}
              </button>
            ))}
          </div>

          <div className="onboarding-provider-detail">
            <h3 className="onboarding-detail-title">{choice.label}</h3>
            <p className="onboarding-detail-blurb">{choice.blurb}</p>
            {choice.note && <p className="onboarding-detail-note">{choice.note}</p>}

            {needsKey && (
              <div className="onboarding-field">
                <label htmlFor="onboarding-apikey">API key</label>
                <input
                  id="onboarding-apikey"
                  type="password"
                  className="setting-input is-mono"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={`${choice.env ?? "API key"}…`}
                  // biome-ignore lint/a11y/noAutofocus: single autofocus owner in the modal
                  autoFocus
                />
                {choice.keyUrl && (
                  <a
                    href={choice.keyUrl}
                    className="onboarding-key-link"
                    onClick={(e) => {
                      e.preventDefault();
                      void window.vibe.openExternal(choice.keyUrl!);
                    }}
                  >
                    <IconExternalLink size={12} /> Get a key
                  </a>
                )}
              </div>
            )}

            {needsBaseURL && (
              <div className="onboarding-field">
                <label htmlFor="onboarding-baseurl">Base URL</label>
                <input
                  id="onboarding-baseurl"
                  type="url"
                  className="setting-input is-mono"
                  value={baseURL}
                  onChange={(e) => setBaseURL(e.target.value)}
                  placeholder="https://api.example.com/v1"
                  // biome-ignore lint/a11y/noAutofocus: single autofocus owner in the modal
                  autoFocus
                />
              </div>
            )}

            <div className="onboarding-field">
              <label htmlFor="onboarding-model">Model</label>
              <input
                id="onboarding-model"
                type="text"
                className="setting-input is-mono"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder="provider/model-id"
              />
            </div>

            {choice.localKeyless && (
              <p className="onboarding-detail-hint">
                This is a local provider — no API key needed. Just make sure the
                server is running and pick a model.
              </p>
            )}

            {saveError && (
              <p className="onboarding-save-error" role="alert">{saveError}</p>
            )}
          </div>
        </div>

        <footer className="onboarding-modal-footer">
          <button type="button" className="button" onClick={onDismiss}>Skip for now</button>
          <button type="button" className="button primary" onClick={handleSave} disabled={!canSave || saving}>
            {saving ? "Saving…" : "Save & start"}
          </button>
        </footer>
      </div>
    </div>
  );
}
