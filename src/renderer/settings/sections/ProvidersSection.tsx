import { useState } from "react";
import type { ProviderConfig } from "../../../shared/config-schema";
import type { SectionProps } from "./types";
import { SettingBadge, SettingField, SettingSection, TextArea, TextInput } from "../FormControls";

export function ProvidersSection({ config, updateConfig }: SectionProps) {
  const providers = config.providers ?? {};
  const providerIds = Object.keys(providers);
  const [expanded, setExpanded] = useState<string | null>(providerIds[0] ?? null);
  const [showAdd, setShowAdd] = useState(false);
  const [newId, setNewId] = useState("");

  const updateProvider = (id: string, patch: Partial<ProviderConfig>) => {
    const next = { ...providers, [id]: { ...providers[id], ...patch } };
    updateConfig({ providers: next });
  };

  const confirmAdd = () => {
    const id = newId.trim();
    if (!id || providers[id]) return;
    updateProvider(id, {});
    setExpanded(id);
    setNewId("");
    setShowAdd(false);
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
                    {p.apiKey ? <SettingBadge>key set</SettingBadge> : p.tokenFile ? <SettingBadge>token file</SettingBadge> : <SettingBadge tone="warn">no key</SettingBadge>}
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
                      <TextArea
                        value={Object.entries(p.headers ?? {}).map(([k, v]) => `${k}: ${v}`).join("\n")}
                        onChange={(v) => {
                          const headers: Record<string, string> = {};
                          for (const line of v.split("\n")) {
                            const m = line.match(/^([^:]+):\s*(.*)$/);
                            if (m) headers[m[1]!.trim()] = m[2]!.trim();
                          }
                          updateProvider(id, { headers: Object.keys(headers).length ? headers : undefined });
                        }}
                        placeholder={"X-Account-Id: 12345"}
                        rows={3}
                        monospace
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
        <div className="git-create-row">
          <input
            type="text"
            className="setting-input is-mono"
            value={newId}
            placeholder="provider-id (e.g. openai, anthropic, ollama)"
            onChange={(e) => setNewId(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") confirmAdd();
              if (e.key === "Escape") { setShowAdd(false); setNewId(""); }
            }}
          />
          <button type="button" className="button primary" disabled={!newId.trim()} onClick={confirmAdd}>Add</button>
          <button type="button" className="button" onClick={() => { setShowAdd(false); setNewId(""); }}>Cancel</button>
        </div>
      ) : (
        <div className="setting-actions">
          <button type="button" className="button" onClick={() => setShowAdd(true)}>Add provider</button>
        </div>
      )}
    </SettingSection>
  );
}
