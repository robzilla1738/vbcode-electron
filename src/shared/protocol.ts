import type { EngineCommand } from "./commands";
import type { UIEvent } from "./events";

/** Electron main → vibecodr-engine-host (mirrors macos-bridge protocol). */
export type HostInbound =
  | {
      op: "bootstrap";
      cwd: string;
      resume?: string;
      continue?: boolean;
      model?: string;
      mode?: "plan" | "execute" | "yolo";
    }
  | { op: "send"; command: EngineCommand }
  | {
      op: "rpc";
      id: number;
      method:
        | "snapshot"
        | "listModels"
        | "listProviders"
        | "listAgents"
        | "listSkills"
        | "listMcp"
        | "finalize"
        | "listSessions"
        | "listProjects"
        | "renameSession"
        | "deleteSession"
        | "archiveSession";
      params?: {
        cwd?: string;
        id?: string;
        title?: string;
      };
    }
  | { op: "shutdown" };

/** Host → Electron main. */
export type HostOutbound =
  | { type: "ready"; sessionId: string }
  | { type: "event"; event: UIEvent }
  | { type: "resp"; id: number; ok: true; value: unknown }
  | { type: "resp"; id: number; ok: false; error: string }
  | { type: "fatal"; message: string };

export interface ProjectSessionSummary {
  id: string;
  title: string;
  model: string;
  mode: "plan" | "execute";
  goal: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface ProjectSummary {
  cwd: string;
  name: string;
  updatedAt: number;
  sessions: ProjectSessionSummary[];
}

export type RpcMethod = Extract<HostInbound, { op: "rpc" }>["method"];

export function encodeInbound(msg: HostInbound): string {
  return `${JSON.stringify(msg)}\n`;
}

export function decodeOutbound(line: string): HostOutbound | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed) as HostOutbound;
  } catch {
    return null;
  }
}
