import type { ProjectSessionSummary, ProjectSummary } from "./protocol";

/** Relative path segments under the home dir for one-off chats (not a real repo). */
export const CHATS_DIR_SEGMENTS = [".vibe", "chats"] as const;

/**
 * Resolve the dedicated chats workspace path under a home directory.
 * Sessions here are one-off conversations — not tied to a code project.
 */
export function chatsCwdFromHome(home: string): string {
  const sep = home.includes("\\") && !home.includes("/") ? "\\" : "/";
  const base = home.replace(/[/\\]+$/, "");
  return `${base}${sep}${CHATS_DIR_SEGMENTS.join(sep)}`;
}

/** Normalize path separators for equality checks (macOS/Linux + Windows). */
export function normalizeCwd(path: string): string {
  return path.replace(/\\/g, "/").replace(/\/+$/, "") || "/";
}

export function isChatsCwd(cwd: string, chatsRoot: string): boolean {
  return normalizeCwd(cwd) === normalizeCwd(chatsRoot);
}

export function isChatsProject(project: ProjectSummary, chatsRoot: string): boolean {
  return isChatsCwd(project.cwd, chatsRoot);
}

/**
 * Split the host project index into one-off chats vs real code projects.
 * Chats may not appear until the first chat is started (empty → null).
 */
export function partitionProjects(
  projects: readonly ProjectSummary[],
  chatsRoot: string,
): { chats: ProjectSummary | null; projects: ProjectSummary[] } {
  let chats: ProjectSummary | null = null;
  const rest: ProjectSummary[] = [];
  for (const project of projects) {
    if (isChatsProject(project, chatsRoot)) chats = project;
    else rest.push(project);
  }
  return { chats, projects: rest };
}

/** Flat chat sessions for the Chats rail section (newest first — host already sorts). */
export function chatSessions(chats: ProjectSummary | null): ProjectSessionSummary[] {
  return chats?.sessions ?? [];
}

export function filterProjects(
  projects: readonly ProjectSummary[],
  rawQuery: string,
): ProjectSummary[] {
  const query = rawQuery.trim().toLocaleLowerCase();
  if (!query) return [...projects];
  return projects.flatMap((project) => {
    const projectMatch = `${project.name} ${project.cwd}`.toLocaleLowerCase().includes(query);
    const sessions = projectMatch
      ? project.sessions
      : project.sessions.filter((session) =>
          `${session.title} ${session.model} ${session.goal ?? ""}`
            .toLocaleLowerCase()
            .includes(query),
        );
    return projectMatch || sessions.length ? [{ ...project, sessions }] : [];
  });
}

/** Filter a flat chat session list by title/model/goal. */
export function filterChatSessions(
  sessions: readonly ProjectSessionSummary[],
  rawQuery: string,
): ProjectSessionSummary[] {
  const query = rawQuery.trim().toLocaleLowerCase();
  if (!query) return [...sessions];
  return sessions.filter((session) =>
    `${session.title} ${session.model} ${session.goal ?? ""}`.toLocaleLowerCase().includes(query),
  );
}

export function projectLabel(project: ProjectSummary, projects: readonly ProjectSummary[]): string {
  const duplicate = projects.some(
    (candidate) => candidate.cwd !== project.cwd && candidate.name === project.name,
  );
  if (!duplicate) return project.name;
  const parent = project.cwd.split(/[\\/]/).filter(Boolean).slice(-2, -1)[0];
  return parent ? `${project.name} — ${parent}` : project.name;
}

export function relativeSessionTime(timestamp: number, now = Date.now()): string {
  const elapsed = Math.max(0, now - timestamp);
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (elapsed < minute) return "now";
  if (elapsed < hour) return `${Math.floor(elapsed / minute)}m`;
  if (elapsed < day) return `${Math.floor(elapsed / hour)}h`;
  if (elapsed < 7 * day) return `${Math.floor(elapsed / day)}d`;
  return new Date(timestamp).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
