import { useEffect, useMemo, useRef, useState } from "react";
import type { ProjectSessionSummary, ProjectSummary } from "../../shared/protocol";
import {
  filterProjects,
  projectLabel,
  relativeSessionTime,
} from "../../shared/project-index";
import {
  IconChevron,
  IconContinue,
  IconFolder,
  IconFolderOpen,
  IconMore,
  IconPlus,
  IconSearch,
  IconSidebar,
} from "../icons";

type SessionMenu = {
  cwd: string;
  session: ProjectSessionSummary;
  x: number;
  y: number;
};

export function ProjectRail({
  projects,
  activeCwd,
  activeSessionId,
  open,
  loading,
  error,
  busy,
  onClose,
  onRetry,
  onOpenProject,
  onNewSession,
  onContinueLatest,
  onResume,
  onRenameSession,
  onDeleteSession,
  onArchiveSession,
}: {
  projects: ProjectSummary[];
  activeCwd: string | null;
  activeSessionId: string;
  open: boolean;
  loading: boolean;
  error: string | null;
  busy: boolean;
  onClose: () => void;
  onRetry: () => void;
  onOpenProject: () => void;
  onNewSession: () => void;
  onContinueLatest: () => void;
  onResume: (cwd: string, id: string) => void;
  onRenameSession: (cwd: string, id: string, title: string) => Promise<boolean>;
  onDeleteSession: (cwd: string, id: string) => Promise<boolean>;
  onArchiveSession: (cwd: string, id: string) => Promise<boolean>;
}) {
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [menu, setMenu] = useState<SessionMenu | null>(null);
  const [renaming, setRenaming] = useState<{ cwd: string; id: string; title: string } | null>(null);
  const filterRef = useRef<HTMLInputElement>(null);
  const renameRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const visibleProjects = useMemo(() => filterProjects(projects, query), [projects, query]);

  useEffect(() => {
    if (!activeCwd) return;
    setExpanded((current) => new Set(current).add(activeCwd));
  }, [activeCwd]);

  useEffect(() => {
    if (!menu) return;
    const first = menuRef.current?.querySelector<HTMLButtonElement>("button[role='menuitem']");
    first?.focus();
    const onPointer = (event: MouseEvent) => {
      if (menuRef.current?.contains(event.target as Node)) return;
      setMenu(null);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenu(null);
    };
    window.addEventListener("mousedown", onPointer);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onPointer);
      window.removeEventListener("keydown", onKey);
    };
  }, [menu]);

  useEffect(() => {
    if (!renaming) return;
    renameRef.current?.focus();
    renameRef.current?.select();
  }, [renaming]);

  const toggleProject = (cwd: string) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(cwd)) next.delete(cwd);
      else next.add(cwd);
      return next;
    });
  };

  const openMenu = (
    event: React.MouseEvent,
    cwd: string,
    session: ProjectSessionSummary,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    const pad = 8;
    const width = 168;
    const height = 120;
    const x = Math.min(event.clientX, window.innerWidth - width - pad);
    const y = Math.min(event.clientY, window.innerHeight - height - pad);
    setMenu({ cwd, session, x: Math.max(pad, x), y: Math.max(pad, y) });
  };

  const commitRename = async () => {
    if (!renaming) return;
    const title = renaming.title.trim();
    const { cwd, id } = renaming;
    setRenaming(null);
    if (!title) return;
    await onRenameSession(cwd, id, title);
  };

  const busyTitle = "Stop the current turn before switching sessions";

  return (
    <aside className={`project-rail${open ? " is-open" : ""}`} aria-label="Projects and sessions">
      <div className="rail-chrome">
        <button type="button" className="icon-button rail-chrome-toggle no-drag" onClick={onClose} aria-label="Hide project rail">
          <IconSidebar size={15} />
        </button>
      </div>

      <div className="rail-title-row">
        <h1 className="rail-product-name">Vibe Codr</h1>
        <button
          type="button"
          className="icon-button rail-title-search no-drag"
          onClick={() => {
            setSearchOpen(true);
            window.requestAnimationFrame(() => filterRef.current?.focus());
          }}
          aria-label="Search projects"
          aria-expanded={searchOpen || query.length > 0}
        >
          <IconSearch size={15} />
        </button>
      </div>

      <nav className="rail-actions" aria-label="Session actions">
        <button
          type="button"
          className="rail-action"
          onClick={onNewSession}
          disabled={!activeCwd || busy}
          title={busy ? busyTitle : undefined}
        >
          <IconPlus size={14} />
          <span>New session</span>
        </button>
        <button
          type="button"
          className="rail-action"
          onClick={onOpenProject}
          disabled={busy}
          title={busy ? "Stop the current turn before switching projects" : undefined}
        >
          <IconFolderOpen size={14} />
          <span>Open project</span>
        </button>
        <button
          type="button"
          className="rail-action"
          onClick={onContinueLatest}
          disabled={!activeCwd || busy}
          title={busy ? busyTitle : undefined}
        >
          <IconContinue size={14} />
          <span>Continue latest</span>
        </button>
      </nav>

      <label className={`rail-filter${searchOpen || query ? " is-open" : ""}`}>
        <span className="sr-only">Filter projects and sessions</span>
        <IconSearch size={14} />
        <input
          ref={filterRef}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              if (query) setQuery("");
              else if (searchOpen) setSearchOpen(false);
              else onClose();
            }
          }}
          placeholder="Search projects"
          type="search"
        />
      </label>

      <h2 className="rail-section-label" id="rail-projects-heading">Projects</h2>
      <div className="project-list" aria-busy={loading} aria-labelledby="rail-projects-heading">
        {loading && projects.length === 0 && <div className="rail-state">Loading projects…</div>}
        {loading && projects.length > 0 && <div className="rail-refresh" role="status">Refreshing…</div>}
        {error && (
          <div className="rail-state error" role="status">
            <span>{error}</span>
            <button type="button" className="rail-retry" onClick={onRetry}>Retry</button>
          </div>
        )}
        {!loading && !error && visibleProjects.length === 0 && (
          <div className="rail-state">{query ? "No matching sessions." : "Open a project to start a session."}</div>
        )}
        {visibleProjects.map((project) => {
          const isExpanded = query.length > 0 || expanded.has(project.cwd);
          const isActiveProject = project.cwd === activeCwd;
          return (
            <section className="project-group" key={project.cwd}>
              <button
                type="button"
                className={`project-heading${isActiveProject ? " active" : ""}`}
                onClick={() => toggleProject(project.cwd)}
                aria-expanded={isExpanded}
                aria-controls={`project-sessions-${project.cwd.replace(/[^a-zA-Z0-9_-]/g, "_")}`}
                title={project.cwd}
              >
                <span className="project-folder" aria-hidden>
                  {isExpanded ? <IconFolderOpen size={14} /> : <IconFolder size={14} />}
                </span>
                <span className="project-name">{projectLabel(project, projects)}</span>
                <span className="project-heading-meta">
                  <IconChevron open={isExpanded} size={12} />
                </span>
              </button>
              {isExpanded && (
                <div
                  className="session-list"
                  id={`project-sessions-${project.cwd.replace(/[^a-zA-Z0-9_-]/g, "_")}`}
                  role="group"
                  aria-label={`Sessions in ${projectLabel(project, projects)}`}
                >
                  {project.sessions.length === 0 && <div className="session-empty">No saved sessions.</div>}
                  {project.sessions.map((session) => {
                    const isRenaming = renaming?.cwd === project.cwd && renaming.id === session.id;
                    return (
                      <div
                        key={session.id}
                        className={`session-row-wrap${session.id === activeSessionId ? " active" : ""}`}
                      >
                        {isRenaming ? (
                          <form
                            className="session-rename"
                            onSubmit={(event) => {
                              event.preventDefault();
                              void commitRename();
                            }}
                          >
                            <input
                              ref={renameRef}
                              className="session-rename-input"
                              value={renaming.title}
                              onChange={(event) =>
                                setRenaming({ ...renaming, title: event.target.value })
                              }
                              onBlur={() => void commitRename()}
                              onKeyDown={(event) => {
                                if (event.key === "Escape") {
                                  event.preventDefault();
                                  setRenaming(null);
                                }
                              }}
                              aria-label="Rename session"
                            />
                          </form>
                        ) : (
                          <button
                            type="button"
                            className={`session-row${session.id === activeSessionId ? " active" : ""}`}
                            onClick={() => onResume(project.cwd, session.id)}
                            onContextMenu={(event) => openMenu(event, project.cwd, session)}
                            disabled={busy}
                            title={busy ? busyTitle : `${session.title}\n${session.model}`}
                          >
                            <span className="session-title">{session.title}</span>
                            <time
                              className="session-time"
                              dateTime={new Date(session.updatedAt).toISOString()}
                            >
                              {relativeSessionTime(session.updatedAt)}
                            </time>
                          </button>
                        )}
                        {!isRenaming && (
                          <button
                            type="button"
                            className="session-more"
                            aria-label={`Session actions for ${session.title}`}
                            disabled={busy}
                            onClick={(event) => openMenu(event, project.cwd, session)}
                          >
                            <IconMore size={14} />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          );
        })}
      </div>

      {menu && (
        <div
          ref={menuRef}
          className="session-menu"
          style={{ left: menu.x, top: menu.y }}
          role="menu"
          aria-label={`Actions for ${menu.session.title}`}
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setRenaming({ cwd: menu.cwd, id: menu.session.id, title: menu.session.title });
              setMenu(null);
            }}
          >
            Rename
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              const { cwd, session } = menu;
              setMenu(null);
              void onArchiveSession(cwd, session.id);
            }}
          >
            Archive
          </button>
          <button
            type="button"
            role="menuitem"
            className="danger"
            onClick={() => {
              const { cwd, session } = menu;
              setMenu(null);
              if (!window.confirm(`Delete “${session.title}”? This cannot be undone.`)) return;
              void onDeleteSession(cwd, session.id);
            }}
          >
            Delete
          </button>
        </div>
      )}
    </aside>
  );
}
