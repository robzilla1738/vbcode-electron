import {
  Bot,
  CheckSquare,
  FileText,
  GitBranch,
  Globe,
  List,
  ListTodo,
  Package,
  Pencil,
  Search,
  Sparkles,
  Square,
  Terminal,
  Wrench,
} from "lucide-react";
import type { ReactNode } from "react";

const STROKE = 1.5;
const SIZE = 13;

/** Map tool families → Lucide icons (renderer-only; shared tool-icons keep unicode). */
export function ToolGlyph({ toolName }: { toolName?: string }): ReactNode {
  const Icon = resolveToolIcon(toolName);
  return <Icon className="tool-glyph" size={SIZE} strokeWidth={STROKE} aria-hidden />;
}

function resolveToolIcon(toolName?: string) {
  const key = (toolName ?? "").toLowerCase();
  if (!key) return Wrench;
  if (key === "bash" || key === "shell") return Terminal;
  if (key === "read" || key === "write") return FileText;
  if (key === "edit" || key === "multiedit" || key === "apply_patch" || key === "think") return Pencil;
  if (key === "glob" || key === "grep" || key === "repo_map") return Search;
  if (key === "list" || key === "ls") return List;
  if (key.startsWith("web") || key === "crawl_docs" || key === "webfetch" || key === "web_fetch") return Globe;
  if (
    key.includes("subagent") ||
    key === "task" ||
    key === "spawn_tasks" ||
    key === "check_task" ||
    key === "read_report"
  ) {
    return Bot;
  }
  if (key.includes("todo") || key === "update_tasks" || key === "present_plan") return ListTodo;
  if (key.includes("memory") || key.includes("note") || key === "recall") return Sparkles;
  if (key === "use_skill") return Sparkles;
  if (key === "run_check" || key === "check_task") return CheckSquare;
  if (key === "package_info") return Package;
  if (key === "job_status") return ListTodo;
  if (key === "job_kill") return Square;
  if (key.startsWith("git")) return GitBranch;
  if (key.startsWith("mcp") || key.includes("mcp")) return Package;
  return Wrench;
}

/** Drop the leading unicode glyph + space from a shared `toolLabel` string. */
export function stripToolGlyph(label: string): string {
  // Most labels are `{glyph} {summary}`; glyphs are 1 BMP / occasional astral.
  return label.replace(/^\S\s+/, "");
}
