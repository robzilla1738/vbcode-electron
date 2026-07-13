/**
 * Pure helpers for MCP server settings edits (stdio ↔ remote type switch, etc.).
 */

import type { McpServerConfig } from "./config-schema";

/** Transport-independent fields preserved while the new endpoint is disabled. */
export function mcpCommonFields(server: McpServerConfig): Pick<McpServerConfig, "timeoutMs"> {
  return {
    timeoutMs: server.timeoutMs,
  };
}

/**
 * Replace a server with a blank template of the chosen kind while preserving
 * `timeoutMs`. A transport switch is disabled until the user confirms the new
 * endpoint; remote templates use a reserved, schema-valid placeholder because
 * the engine requires a valid URL even for disabled servers.
 */
export function mcpServerTypeTemplate(
  kind: "stdio" | "remote",
  previous: McpServerConfig,
): McpServerConfig {
  const common = mcpCommonFields(previous);
  if (kind === "stdio") {
    return { command: "", args: [], ...common, enabled: false };
  }
  return { url: "https://example.invalid/mcp", ...common, enabled: false };
}
