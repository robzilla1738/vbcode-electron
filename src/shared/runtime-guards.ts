import type { EngineSnapshot } from "./types";
import type { ProjectSummary, RpcMethod } from "./protocol";

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function finite(value: unknown): boolean {
  return typeof value === "number" && Number.isFinite(value);
}

function recordsWithString(value: unknown, key: string): boolean {
  return Array.isArray(value) && value.every((item) => typeof record(item)?.[key] === "string");
}

function everyRecord(value: unknown, predicate: (item: Record<string, unknown>) => boolean): boolean {
  return Array.isArray(value) && value.every((item) => {
    const parsed = record(item);
    return !!parsed && predicate(parsed);
  });
}

export function isEngineSnapshot(value: unknown): value is EngineSnapshot {
  const snap = record(value);
  const usage = record(snap?.usage);
  return !!snap
    && typeof snap.sessionId === "string" && !!snap.sessionId
    && typeof snap.model === "string"
    && (snap.mode === "plan" || snap.mode === "execute")
    && (snap.goal === null || typeof snap.goal === "string")
    && Array.isArray(snap.history)
    && Array.isArray(snap.tasks)
    && !!usage && finite(usage.inputTokens) && finite(usage.outputTokens)
    && typeof snap.busy === "boolean"
    && typeof snap.theme === "string"
    && typeof snap.accentColor === "string"
    && (snap.details === "quiet" || snap.details === "normal" || snap.details === "verbose")
    && typeof snap.mouse === "boolean"
    && (snap.approvalMode === "ask" || snap.approvalMode === "auto")
    && Array.isArray(snap.commandNames) && snap.commandNames.every((item) => typeof item === "string");
}

export function isProjectSummaryArray(value: unknown): value is ProjectSummary[] {
  return Array.isArray(value) && value.every((item) => {
    const project = record(item);
    if (!project || typeof project.cwd !== "string" || typeof project.name !== "string" || !finite(project.updatedAt) || !Array.isArray(project.sessions)) return false;
    return project.sessions.every((sessionValue) => {
      const session = record(sessionValue);
      return !!session
        && typeof session.id === "string"
        && typeof session.title === "string"
        && typeof session.model === "string"
        && (session.mode === "plan" || session.mode === "execute")
        && (session.goal === null || typeof session.goal === "string")
        && finite(session.createdAt)
        && finite(session.updatedAt);
    });
  });
}

export function isRpcResult(method: RpcMethod, value: unknown): boolean {
  switch (method) {
    case "snapshot": return isEngineSnapshot(value);
    case "listProjects": return isProjectSummaryArray(value);
    case "listModels": return everyRecord(value, (item) => typeof item.id === "string" && typeof item.providerId === "string" && optionalFinite(item.contextWindow));
    case "listProviders": return everyRecord(value, (item) => typeof item.id === "string" && typeof item.configured === "boolean" && typeof item.keyless === "boolean" && stringList(item.env));
    case "listAgents": return everyRecord(value, (item) => typeof item.name === "string" && typeof item.description === "string" && optionalStringOrNull(item.model) && (item.mode === "plan" || item.mode === "execute"));
    case "listSkills": return everyRecord(value, (item) => typeof item.name === "string" && typeof item.description === "string");
    case "listMcp": return everyRecord(value, (item) => typeof item.name === "string" && typeof item.connected === "boolean" && typeof item.configured === "boolean" && finite(item.toolCount) && finite(item.resourceCount) && finite(item.promptCount));
    case "listSessions": return recordsWithString(value, "id");
    case "renameSession":
    case "deleteSession":
    case "archiveSession": return typeof record(value)?.id === "string";
    case "finalize": return value === null;
  }
}

function optionalFinite(value: unknown): boolean {
  return value === undefined || finite(value);
}

function optionalStringOrNull(value: unknown): boolean {
  return value === undefined || value === null || typeof value === "string";
}

function stringList(value: unknown): boolean {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}
