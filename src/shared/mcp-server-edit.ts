/**
 * Pure helpers for MCP server settings edits (stdio ↔ remote type switch, etc.).
 */

import type { McpServerConfig } from "./config-schema";

/** Shared fields preserved when switching server transport type. */
export function mcpCommonFields(server: McpServerConfig): Pick<McpServerConfig, "enabled" | "timeoutMs"> {
  return {
    enabled: server.enabled,
    timeoutMs: server.timeoutMs,
  };
}

/**
 * Replace a server with a blank template of the chosen kind while preserving
 * `enabled` / `timeoutMs` so a newly-added disabled server cannot flip to
 * "enabled with empty url/command" and brick the whole Settings save.
 */
export function mcpServerTypeTemplate(
  kind: "stdio" | "remote",
  previous: McpServerConfig,
): McpServerConfig {
  const common = mcpCommonFields(previous);
  if (kind === "stdio") {
    return { command: "", args: [], ...common };
  }
  return { url: "", ...common };
}
