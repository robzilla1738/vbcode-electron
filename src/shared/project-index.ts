import type { ProjectSummary } from "./protocol";

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
