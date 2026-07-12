import { useState } from "react";
import type { McpServerConfig } from "../../../shared/config-schema";
import type { SectionProps } from "./types";
import { SettingBadge, SettingField, SettingSection, TextArea, TextInput, ToggleSwitch } from "../FormControls";

export function McpSection({ config, updateConfig }: SectionProps) {
  const servers = config.mcp?.servers ?? {};
  const serverNames = Object.keys(servers);
  const [expanded, setExpanded] = useState<string | null>(serverNames[0] ?? null);
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");

  const updateServer = (name: string, server: McpServerConfig) => {
    const next = { ...servers, [name]: server };
    updateConfig({ mcp: { servers: next } });
  };

  const removeServer = (name: string) => {
    const next = { ...servers };
    delete next[name];
    updateConfig({ mcp: { servers: next } });
  };

  const confirmAdd = () => {
    const name = newName.trim();
    if (!name || servers[name]) return;
    updateServer(name, { command: "", args: [] });
    setExpanded(name);
    setNewName("");
    setShowAdd(false);
  };

  return (
    <SettingSection title="MCP Servers" description="Model Context Protocol server connections. Tools register as mcp__<server>__<tool>.">
      {serverNames.length === 0 && !showAdd && (
        <p className="setting-empty">No MCP servers configured. Add a stdio or remote server to extend the agent's tools.</p>
      )}
      {serverNames.length > 0 && (
        <div className="setting-list">
          {serverNames.map((name) => {
            const server = servers[name];
            const isStdio = "command" in server;
            const isExpanded = expanded === name;
            return (
              <div key={name} className={`setting-card${isExpanded ? " expanded" : ""}`}>
                <div className="setting-card-header">
                  <button type="button" className="setting-card-toggle" onClick={() => setExpanded(isExpanded ? null : name)}>
                    <span className="setting-card-title">{name}</span>
                    <SettingBadge>{isStdio ? "stdio" : "remote"}</SettingBadge>
                    {server.enabled === false ? <SettingBadge tone="warn">disabled</SettingBadge> : <SettingBadge>enabled</SettingBadge>}
                  </button>
                  <button type="button" className="button danger" onClick={() => removeServer(name)}>Remove</button>
                </div>
                {isExpanded && (
                  <div className="setting-card-body">
                    <SettingField label="Type">
                      <div className="setting-radio-group">
                        <label>
                          <input
                            type="radio"
                            name={`mcp-type-${name}`}
                            checked={isStdio}
                            onChange={() => updateServer(name, { command: "", args: [] })}
                          />
                          Stdio (local process)
                        </label>
                        <label>
                          <input
                            type="radio"
                            name={`mcp-type-${name}`}
                            checked={!isStdio}
                            onChange={() => updateServer(name, { url: "" })}
                          />
                          Remote (HTTP/SSE)
                        </label>
                      </div>
                    </SettingField>
                    {isStdio ? (
                      <>
                        <SettingField label="Command" description="Executable to spawn. Supports ${VAR} expansion.">
                          <TextInput
                            value={server.command}
                            onChange={(v) => updateServer(name, { ...server, command: v })}
                            placeholder="npx -y @modelcontextprotocol/server-filesystem"
                            monospace
                          />
                        </SettingField>
                        <SettingField label="Args" description="One per line. Each supports ${VAR} / ${VAR:-default} expansion.">
                          <TextArea
                            value={(server.args ?? []).join("\n")}
                            onChange={(v) => updateServer(name, { ...server, args: v.split("\n").map((s) => s).filter((s, i, arr) => s.trim() || i < arr.length - 1) })}
                            placeholder={"/path/to/project"}
                            rows={3}
                            monospace
                          />
                        </SettingField>
                        <SettingField label="Environment" description="One per line: KEY=value. Values support ${VAR} expansion.">
                          <TextArea
                            value={Object.entries(server.env ?? {}).map(([k, v]) => `${k}=${v}`).join("\n")}
                            onChange={(v) => {
                              const env: Record<string, string> = {};
                              for (const line of v.split("\n")) {
                                const m = line.match(/^([^=]+)=(.*)$/);
                                if (m) env[m[1]!.trim()] = m[2]!;
                              }
                              updateServer(name, { ...server, env: Object.keys(env).length ? env : undefined });
                            }}
                            placeholder={"API_KEY=$" + "{MY_API_KEY}"}
                            rows={3}
                            monospace
                          />
                        </SettingField>
                        <SettingField label="Working directory" description="cwd for the spawned server process.">
                          <TextInput
                            value={server.cwd ?? ""}
                            onChange={(v) => updateServer(name, { ...server, cwd: v || undefined })}
                            placeholder="inherit"
                            monospace
                          />
                        </SettingField>
                      </>
                    ) : (
                      <>
                        <SettingField label="URL" description="Streamable HTTP or SSE endpoint. Supports ${VAR} expansion.">
                          <TextInput
                            value={server.url}
                            onChange={(v) => updateServer(name, { ...server, url: v })}
                            placeholder="https://api.example.com/mcp"
                            type="url"
                            monospace
                          />
                        </SettingField>
                        <SettingField label="Transport" description="http (Streamable HTTP, modern) or sse (legacy).">
                          <div className="setting-radio-group">
                            <label>
                              <input
                                type="radio"
                                name={`mcp-transport-${name}`}
                                checked={!server.transport || server.transport === "http"}
                                onChange={() => updateServer(name, { ...server, transport: "http" })}
                              />
                              HTTP
                            </label>
                            <label>
                              <input
                                type="radio"
                                name={`mcp-transport-${name}`}
                                checked={server.transport === "sse"}
                                onChange={() => updateServer(name, { ...server, transport: "sse" })}
                              />
                              SSE
                            </label>
                          </div>
                        </SettingField>
                        <SettingField label="Headers" description="Auth/identity headers. One per line: key: value. Values support ${VAR}.">
                          <TextArea
                            value={Object.entries(server.headers ?? {}).map(([k, v]) => `${k}: ${v}`).join("\n")}
                            onChange={(v) => {
                              const headers: Record<string, string> = {};
                              for (const line of v.split("\n")) {
                                const m = line.match(/^([^:]+):\s*(.*)$/);
                                if (m) headers[m[1]!.trim()] = m[2]!.trim();
                              }
                              updateServer(name, { ...server, headers: Object.keys(headers).length ? headers : undefined });
                            }}
                            placeholder={"Authorization: Bearer $" + "{MCP_TOKEN}"}
                            rows={3}
                            monospace
                          />
                        </SettingField>
                      </>
                    )}
                    <SettingField label="Enabled">
                      <ToggleSwitch
                        checked={server.enabled !== false}
                        onChange={(v) => updateServer(name, { ...server, enabled: v })}
                      />
                    </SettingField>
                    <SettingField label="Timeout (ms)" description="Per-server connect/list deadline. 0 = hub default.">
                      <TextInput
                        value={server.timeoutMs?.toString() ?? ""}
                        onChange={(v) => {
                          const n = Number(v);
                          updateServer(name, { ...server, timeoutMs: v && Number.isFinite(n) ? n : undefined });
                        }}
                        placeholder="default"
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
            value={newName}
            placeholder="server-name"
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") confirmAdd();
              if (e.key === "Escape") { setShowAdd(false); setNewName(""); }
            }}
          />
          <button type="button" className="button primary" disabled={!newName.trim()} onClick={confirmAdd}>Add</button>
          <button type="button" className="button" onClick={() => { setShowAdd(false); setNewName(""); }}>Cancel</button>
        </div>
      ) : (
        <div className="setting-actions">
          <button type="button" className="button" onClick={() => setShowAdd(true)}>Add MCP server</button>
        </div>
      )}
    </SettingSection>
  );
}
