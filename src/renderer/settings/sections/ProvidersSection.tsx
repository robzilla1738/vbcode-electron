import { useState } from "react";
import type { ProviderConfig } from "../../../shared/config-schema";
import { PROVIDER_CHOICES } from "../../../shared/providers-catalog";
import type { SectionProps } from "./types";
import { KeyValueTextArea, SettingBadge, SettingField, SettingSection, TextInput } from "../FormControls";

export function ProvidersSection({ config, scope, updateConfig, cwd }: SectionProps) {
  const providers = config.providers ?? {};
  const providerIds = Object.keys(providers);
  const providerOptions = Array.from(
    new Map(
      PROVIDER_CHOICES
        .filter((choice) => choice.registryId && !choice.customEndpoint && !providers[choice.registryId])
        .map((choice) => [choice.registryId, choice]),
    ).values(),
  );
  const [expanded, setExpanded] = useState<string | null>(providerIds[0] ?? null);
  const [showAdd, setShowAdd] = useState(false);
  const [newId, setNewId] = useState("");
  const [useCustom, setUseCustom] = useState(false);

  const updateProvider = (id: string, patch: Partial<ProviderConfig>) => {
    const next = { ...providers, [id]: { ...providers[id], ...patch } };
    updateConfig({ providers: next });
  };

  const confirmAddForId = (id: string) => {
    const trimmed = id.trim();
    if (!trimmed || providers[trimmed]) return;
    updateProvider(trimmed, {});
    setExpanded(trimmed);
    setNewId("");
    setShowAdd(false);
    setUseCustom(false);
  };

  const confirmAdd = () => {
    confirmAddForId(newId);
  };

  const removeProvider = (id: string) => {
    const next = { ...providers };
    delete next[id];
    updateConfig({ providers: next });
  };

  return (
    <SettingSection title="Providers" description="API keys, base URLs, and token files for each provider. Env vars take precedence over values here.">
      {providerIds.length === 0 && !showAdd && (
        <p className="setting-empty">No providers configured. Add one to set credentials.</p>
      )}
      {providerIds.length > 0 && (
        <div className="setting-list">
          {providerIds.map((id) => {
            const p = providers[id] ?? {};
            const isExpanded = expanded === id;
            return (
              <div key={id} className={`setting-card${isExpanded ? " expanded" : ""}`}>
                <div className="setting-card-header">
                  <button type="button" className="setting-card-toggle" onClick={() => setExpanded(isExpanded ? null : id)}>
                    <span className="setting-card-title">{id}</span>
                    {p.apiKey ? <SettingBadge>key set</SettingBadge> : p.tokenFile ? <SettingBadge>token file</SettingBadge> : <SettingBadge tone="warn">no saved credential</SettingBadge>}
                  </button>
                  <button type="button" className="button danger" onClick={() => removeProvider(id)}>Remove</button>
                </div>
                {isExpanded && (
                  <div className="setting-card-body">
                    <SettingField label="API key" description="Provider API key. Env var (e.g. OPENAI_API_KEY) takes precedence.">
                      <TextInput
                        value={p.apiKey ?? ""}
                        onChange={(v) => updateProvider(id, { apiKey: v || undefined })}
                        placeholder="sk-…"
                        type="password"
                        monospace
                      />
                    </SettingField>
                    <SettingField label="Base URL" description="Override the provider's default endpoint.">
                      <TextInput
                        value={p.baseURL ?? ""}
                        onChange={(v) => updateProvider(id, { baseURL: v || undefined })}
                        placeholder="https://api.example.com/v1"
                        type="url"
                        monospace
                      />
                    </SettingField>
                    <SettingField label="Token file" description="Path to a credential file (supports ~). Reuse OAuth tokens from other CLIs.">
                      <TextInput
                        value={p.tokenFile ?? ""}
                        onChange={(v) => updateProvider(id, { tokenFile: v || undefined })}
                        placeholder="~/.codex/auth.json"
                        monospace
                      />
                    </SettingField>
                    <SettingField label="Token path" description="Dot-path into a JSON token file (e.g. tokens.access_token).">
                      <TextInput
                        value={p.tokenPath ?? ""}
                        onChange={(v) => updateProvider(id, { tokenPath: v || undefined })}
                        placeholder="tokens.access_token"
                        monospace
                      />
                    </SettingField>
                    <SettingField label="Extra headers" description="One per line: key: value">
                      <KeyValueTextArea
                        value={p.headers}
                        onChange={(headers) => updateProvider(id, { headers })}
                        separator=":"
                        resetKey={`${scope}:${cwd ?? ""}:${id}:headers`}
                        placeholder="X-Account-Id: 12345"
                      />
                    </SettingField>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      {showAdd ? (
        useCustom ? (
          <div className="git-create-row">
            <input
              type="text"
              className="setting-input is-mono"
              value={newId}
              placeholder="provider-id (e.g. openai, anthropic, ollama)"
              onChange={(e) => setNewId(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") confirmAdd();
                if (e.key === "Escape") { setShowAdd(false); setNewId(""); setUseCustom(false); }
              }}
              // biome-ignore lint/a11y/noAutofocus: single autofocus owner in the custom add row
              autoFocus
            />
            <button type="button" className="button primary" disabled={!newId.trim()} onClick={confirmAdd}>Add</button>
            <button type="button" className="button" onClick={() => { setShowAdd(false); setNewId(""); setUseCustom(false); }}>Cancel</button>
          </div>
        ) : (
          <div className="provider-add-row">
            <select
              className="setting-select"
              value={newId}
              onChange={(e) => {
                const choice = PROVIDER_CHOICES.find((c) => c.registryId === e.target.value && c.registryId !== "");
                setNewId(e.target.value);
                if (choice && e.target.value) confirmAddForId(e.target.value);
              }}
              // biome-ignore lint/a11y/noAutofocus: single autofocus owner in the add row
              autoFocus
            >
              <option value="">Select a provider…</option>
              {providerOptions.map((c) => (
                <option key={c.key} value={c.registryId}>{c.label}</option>
              ))}
            </select>
            <button type="button" className="button" onClick={() => { setUseCustom(true); setNewId(""); }}>
              Type manually
            </button>
            <button type="button" className="button" onClick={() => { setShowAdd(false); setNewId(""); setUseCustom(false); }}>Cancel</button>
          </div>
        )
      ) : (
        <div className="setting-actions">
          <button type="button" className="button" onClick={() => { setShowAdd(true); setUseCustom(false); setNewId(""); }}>Add provider</button>
        </div>
      )}
    </SettingSection>
  );
}
