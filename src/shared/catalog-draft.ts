/**
 * Catalog draft detectors + option builders — TUI-faithful picker semantics
 * ported from vibe-codr/packages/tui (app.tsx + commands-catalog).
 */

import type {
  AgentInfo,
  McpServerInfo,
  ModelSummary,
  ProviderInfo,
  SkillInfo,
} from "./types";

/** Model picker target: main session, shared subagent default, or a named agent. */
export type ModelPickerTarget = "main" | "sub" | { agent: string };

export type ModelPick = { query: string; target: ModelPickerTarget };

/**
 * Detect when the draft opens the `/model` picker and which agent it configures.
 * Returns null for `/model key …`, `/model refresh`, and `/model agent` without a name.
 */
export function modelPicker(draft: string, target: "main" | "sub" = "main"): ModelPick | null {
  const am = /^\/model\s+agent\s+(\S+)\s*(.*)$/is.exec(draft);
  if (am) return { query: (am[2] ?? "").trim(), target: { agent: am[1]! } };
  const m = /^\/models?(?:\s+(.*))?$/is.exec(draft);
  if (!m) return null;
  const q = (m[1] ?? "").trim();
  const first = q.split(/\s+/)[0]?.toLowerCase() ?? "";
  if (first === "key" || first === "refresh" || first === "agent") return null;
  // `/model sub [filter]` — TUI uses Tab for sub; Electron also accepts typed `sub`.
  if (first === "sub") {
    const rest = q.slice(3).trim();
    return { query: rest, target: "sub" };
  }
  return { query: q, target };
}

/** `/providers [filter]` → provider list menu. */
export function providersPickerQuery(draft: string): string | null {
  const m = /^\/providers?(?:\s+(.*))?$/is.exec(draft);
  return m ? (m[1] ?? "").trim() : null;
}

/**
 * `/agents [filter]` → named-agents menu.
 * `/agents new …` is a create command, not the picker.
 */
export function agentsPickerQuery(draft: string): string | null {
  const m = /^\/agents?(?:\s+(.*))?$/is.exec(draft);
  if (!m) return null;
  const rest = (m[1] ?? "").trim();
  if (/^new(\s|$)/i.test(rest)) return null;
  return rest;
}

/**
 * `/skills [filter]` only — singular `/skill` is the invocation the menu prefills.
 */
export function skillsPickerFilter(draft: string): string | null {
  const m = /^\/skills(?:\s+(.*))?$/is.exec(draft);
  return m ? (m[1] ?? "").trim() : null;
}

/** Bare `/mcp` opens the roster (optional filter after space). */
export function mcpPickerQuery(draft: string): string | null {
  const m = /^\/mcp(?:\s+(.*))?$/is.exec(draft);
  return m ? (m[1] ?? "").trim() : null;
}

export interface CatalogOption {
  key: string;
  primary: string;
  secondary: string;
  /** Submit this line to the engine (or via EngineCommand path). */
  line?: string;
  /** Prefill composer draft without submitting. */
  prefill?: string;
  /** Open models picker after choose (agents → model agent). */
  openModelsForAgent?: string;
  /** Send typed EngineCommand instead of a slash line. */
  command?:
    | { type: "set-model"; model: string }
    | { type: "set-subagent-model"; model: string | null }
    | { type: "set-agent-model"; name: string; model: string | null };
}

export function mcpSecondary(server: McpServerInfo): string {
  const status = server.error
    ? "error"
    : server.connected
      ? "connected"
      : server.configured
        ? "disconnected"
        : "not configured";
  const bits = [status];
  if (server.connected || server.toolCount > 0) {
    bits.push(`${server.toolCount} tools`);
  }
  if (server.resourceCount > 0) bits.push(`${server.resourceCount} resources`);
  if (server.promptCount > 0) bits.push(`${server.promptCount} prompts`);
  if (server.error) bits.push(server.error);
  return bits.join(" · ");
}

export function normalizeMcpServer(raw: Record<string, unknown>): McpServerInfo {
  const connected = Boolean(raw.connected);
  const configured = raw.configured != null ? Boolean(raw.configured) : true;
  return {
    name: String(raw.name ?? ""),
    connected,
    configured,
    toolCount: Number(raw.toolCount ?? raw.tools ?? 0),
    resourceCount: Number(raw.resourceCount ?? 0),
    promptCount: Number(raw.promptCount ?? 0),
    error: typeof raw.error === "string" ? raw.error : undefined,
  };
}

export function modelCatalogOptions(
  items: ModelSummary[],
  target: ModelPickerTarget,
  current?: string | null,
): CatalogOption[] {
  const rows: CatalogOption[] = items.map((model) => {
    const full = `${model.providerId}/${model.id}`;
    if (typeof target === "object") {
      return {
        key: full,
        primary: full,
        secondary: model.name ?? "",
        command: { type: "set-agent-model", name: target.agent, model: full },
      };
    }
    if (target === "sub") {
      return {
        key: full,
        primary: full,
        secondary: model.name ?? "",
        command: { type: "set-subagent-model", model: full },
      };
    }
    return {
      key: full,
      primary: full,
      secondary: model.name ?? "",
      command: { type: "set-model", model: full },
    };
  });

  if (target === "sub" || typeof target === "object") {
    rows.unshift({
      key: "__clear__",
      primary: "Clear → inherit",
      secondary:
        typeof target === "object"
          ? `Agent "${target.agent}" uses session model`
          : "Subagents use main session model",
      command:
        typeof target === "object"
          ? { type: "set-agent-model", name: target.agent, model: null }
          : { type: "set-subagent-model", model: null },
    });
  }

  void current;
  return rows;
}

export function providerCatalogOptions(items: ProviderInfo[]): CatalogOption[] {
  return items.map((provider) => {
    const ready = provider.configured || provider.keyless;
    return {
      key: provider.id,
      primary: provider.id,
      secondary: ready
        ? provider.keyless
          ? "keyless · local"
          : `key set · ${provider.env[0] ?? ""}`
        : `no key — set ${provider.env[0] ?? "key"}`,
      prefill: ready ? `/model ${provider.id}/` : `/model key ${provider.id} `,
    };
  });
}

export function agentCatalogOptions(items: AgentInfo[]): CatalogOption[] {
  return [
    {
      key: "new-agent",
      primary: "New agent",
      secondary: "Create a file in .vibe/agents",
      prefill: "/agents new ",
    },
    ...items.map((agent) => ({
      key: agent.name,
      primary: agent.name,
      secondary: `${agent.model ?? "Inherit model"} · ${agent.description}`,
      prefill: `/model agent ${agent.name} `,
      openModelsForAgent: agent.name,
    })),
  ];
}

export function skillCatalogOptions(items: SkillInfo[]): CatalogOption[] {
  return items.map((skill) => ({
    key: skill.name,
    primary: skill.name,
    secondary: skill.description,
    prefill: `/skill ${skill.name} `,
  }));
}

export function mcpCatalogOptions(items: McpServerInfo[]): CatalogOption[] {
  return items.map((server) => ({
    key: server.name,
    primary: server.name,
    secondary: mcpSecondary(server),
  }));
}

export function modelTargetLabel(target: ModelPickerTarget): string {
  if (typeof target === "object") return `Agent: ${target.agent}`;
  return target === "sub" ? "Subagents" : "Main session";
}

export function currentModelForTarget(
  target: ModelPickerTarget,
  main: string,
  subagentModel: string | undefined,
  agents: AgentInfo[],
): string | undefined {
  if (typeof target === "object") {
    return agents.find((a) => a.name === target.agent)?.model ?? undefined;
  }
  if (target === "sub") return subagentModel;
  return main || undefined;
}
