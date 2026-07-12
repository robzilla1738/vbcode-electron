import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  filterProjects,
  projectLabel,
  relativeSessionTime,
} from "../../shared/project-index";
import type { ProjectSessionSummary, ProjectSummary } from "../../shared/protocol";
import {
  IconArchive,
  IconChevron,
  IconContinue,
  IconDelete,
  IconFolder,
  IconFolderOpen,
  IconMore,
  IconPlus,
  IconRename,
  IconSearch,
  IconSidebar,
} from "../icons";

type SessionMenu = {
  kind: "session";
  cwd: string;
  session: ProjectSessionSummary;
  x: number;
  y: number;
};

type ProjectMenu = {
  kind: "project";
  cwd: string;
  project: ProjectSummary;
  x: number;
  y: number;
};

type RailMenu = SessionMenu | ProjectMenu;

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
  onRenameProject,
  onArchiveProject,
  onDeleteProject,
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
  onRenameProject: (cwd: string, name: string) => Promise<boolean>;
  onArchiveProject: (cwd: string) => Promise<boolean>;
  onDeleteProject: (cwd: string) => Promise<boolean>;
  onRenameSession: (cwd: string, id: string, title: string) => Promise<boolean>;
  onDeleteSession: (cwd: string, id: string) => Promise<boolean>;
  onArchiveSession: (cwd: string, id: string) => Promise<boolean>;
}) {
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [menu, setMenu] = useState<RailMenu | null>(null);
  const [menuClosing, setMenuClosing] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [renamingProject, setRenamingProject] = useState<{ cwd: string; name: string } | null>(null);
  const [renaming, setRenaming] = useState<{ cwd: string; id: string; title: string } | null>(null);
  const [confirmAction, setConfirmAction] = useState<"archive" | "delete" | null>(null);
  const [confirmProjectAction, setConfirmProjectAction] = useState<"archive" | "delete" | null>(null);
  const filterRef = useRef<HTMLInputElement>(null);
  const projectRenameRef = useRef<HTMLInputElement>(null);
  const renameRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuTriggerRef = useRef<HTMLButtonElement | null>(null);
  const menuCloseTimerRef = useRef<number | null>(null);
  const searchTriggerRef = useRef<HTMLButtonElement>(null);
  const visibleProjects = useMemo(() => filterProjects(projects, query), [projects, query]);
  const searchIsOpen = searchOpen || query.length > 0;

  const closeMenu = useCallback((restoreFocus = false) => {
    if (!menu && !menuClosing) return;
    if (menuCloseTimerRef.current !== null) {
      window.clearTimeout(menuCloseTimerRef.current);
    }
    setConfirmAction(null);
    setConfirmProjectAction(null);
    setMenuClosing(true);
    menuCloseTimerRef.current = window.setTimeout(() => {
      setMenu(null);
      setMenuClosing(false);
      menuCloseTimerRef.current = null;
      if (restoreFocus) {
        window.requestAnimationFrame(() => menuTriggerRef.current?.focus());
      }
    }, 120);
  }, [menu, menuClosing]);

  useEffect(() => {
    if (!activeCwd) return;
    setExpanded((current) => new Set(current).add(activeCwd));
  }, [activeCwd]);

  useEffect(() => {
    if (!menu) return;
    const first = menuRef.current?.querySelector<HTMLButtonElement>("button[role='menuitem']");
    // Prefer keyboard focus without scrolling the rail under a pointer click.
    first?.focus({ preventScroll: true });
    const onPointer = (event: MouseEvent) => {
      const target = event.target as Node;
      if (menuRef.current?.contains(target)) return;
      // Let the trigger's click handler toggle closed — don't race mousedown→close
      // against click→reopen (that flicker is what made ⋯ feel glitched).
      if (menuTriggerRef.current?.contains(target)) return;
      closeMenu();
    };
    // The session menu fully owns keyboard interaction while open. The keydown
    // listener lives on document (bubble phase) so it fires before App's
    // window-level Esc stack; stopPropagation then shields App from also
    // clearing the draft / denying a permission / aborting on the same Esc
    // press (I13/I58).
    const onKey = (event: KeyboardEvent) => {
      const items = Array.from(
        menuRef.current?.querySelectorAll<HTMLButtonElement>("button[role='menuitem']") ?? [],
      );
      const current = items.indexOf(document.activeElement as HTMLButtonElement);
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        event.stopPropagation();
        if (items.length === 0) return;
        const direction = event.key === "ArrowDown" ? 1 : -1;
        items[(current + direction + items.length) % items.length]?.focus({ preventScroll: true });
      } else if (event.key === "Home") {
        event.preventDefault();
        event.stopPropagation();
        items[0]?.focus({ preventScroll: true });
      } else if (event.key === "End") {
        event.preventDefault();
        event.stopPropagation();
        items.at(-1)?.focus({ preventScroll: true });
      } else if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        if (confirmAction || confirmProjectAction) {
          setConfirmAction(null);
          setConfirmProjectAction(null);
          return;
        }
        closeMenu(true);
      }
    };
    window.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [closeMenu, menu, confirmAction, confirmProjectAction]);

  useEffect(() => {
    return () => {
      if (menuCloseTimerRef.current !== null) {
        window.clearTimeout(menuCloseTimerRef.current);
      }
    };
  }, []);

  // Clamp after paint so real menu size wins over a fixed estimate.
  useLayoutEffect(() => {
    if (!menu || !menuRef.current) return;
    const el = menuRef.current;
    const rect = el.getBoundingClientRect();
    const pad = 8;
    const x = Math.min(Math.max(pad, menu.x), Math.max(pad, window.innerWidth - rect.width - pad));
    const y = Math.min(Math.max(pad, menu.y), Math.max(pad, window.innerHeight - rect.height - pad));
    if (Math.abs(x - menu.x) > 0.5 || Math.abs(y - menu.y) > 0.5) {
      setMenu((current) => (current ? { ...current, x, y } : null));
    }
  }, [menu, confirmAction, confirmProjectAction]);

  useEffect(() => {
    if (!renamingProject) return;
    projectRenameRef.current?.focus();
    projectRenameRef.current?.select();
  }, [renamingProject]);

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

  /** Anchor to the trigger so the menu isn't born under the cursor (avoids the
   *  click/double-click landing on Rename). Flip above when near the bottom. */
  const menuPositionFor = (trigger: HTMLElement) => {
    const rect = trigger.getBoundingClientRect();
    const estimatedWidth = 176;
    const estimatedHeight = 120;
    const gap = 4;
    const pad = 8;
    const openBelow = rect.bottom + gap + estimatedHeight <= window.innerHeight - pad;
    return {
      x: Math.max(pad, rect.right - estimatedWidth),
      y: openBelow ? rect.bottom + gap : Math.max(pad, rect.top - estimatedHeight - gap),
    };
  };

  const beginMenuOpen = (trigger: HTMLButtonElement) => {
    if (menuCloseTimerRef.current !== null) {
      window.clearTimeout(menuCloseTimerRef.current);
      menuCloseTimerRef.current = null;
    }
    setMenuClosing(false);
    setConfirmAction(null);
    setConfirmProjectAction(null);
    menuTriggerRef.current = trigger;
  };

  const openMenu = (
    event: React.MouseEvent,
    cwd: string,
    session: ProjectSessionSummary,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    const trigger = event.currentTarget as HTMLButtonElement;
    if (menu?.kind === "session" && menu.session.id === session.id && !menuClosing) {
      closeMenu(true);
      return;
    }
    beginMenuOpen(trigger);
    // Right-click stays at the pointer; the ⋯ control anchors to itself.
    const pos =
      event.type === "contextmenu"
        ? { x: event.clientX, y: event.clientY }
        : menuPositionFor(trigger);
    setMenu({ kind: "session", cwd, session, ...pos });
  };

  const openProjectMenu = (event: React.MouseEvent, project: ProjectSummary) => {
    event.preventDefault();
    event.stopPropagation();
    const trigger = event.currentTarget as HTMLButtonElement;
    if (menu?.kind === "project" && menu.cwd === project.cwd && !menuClosing) {
      closeMenu(true);
      return;
    }
    beginMenuOpen(trigger);
    const { x, y } = menuPositionFor(trigger);
    setMenu({ kind: "project", cwd: project.cwd, project, x, y });
  };

  const commitRename = async () => {
    if (!renaming) return;
    const title = renaming.title.trim();
    const { cwd, id } = renaming;
    setRenaming(null);
    if (!title) return;
    await onRenameSession(cwd, id, title);
  };

  const commitProjectRename = async () => {
    if (!renamingProject) return;
    const name = renamingProject.name.trim();
    const { cwd } = renamingProject;
    setRenamingProject(null);
    if (!name) return;
    await onRenameProject(cwd, name);
  };

  const busyTitle = "Stop the current turn before switching sessions";
  const busyProjectTitle = "Stop the current turn before switching projects";
  const busyActionLabel = (action: string, reason = busyTitle) =>
    busy ? `${action}. ${reason}` : action;

  return (
    <aside
      id="project-rail"
      className={`project-rail${open ? " is-open" : ""}`}
      aria-label="Projects and sessions"
      aria-hidden={!open}
    >
      <div className="rail-chrome">
        <button type="button" className="icon-button rail-chrome-toggle no-drag" onClick={onClose} aria-label="Hide project rail">
          <IconSidebar size={15} />
        </button>
      </div>

      <div className="rail-title-row">
        <h1 className="rail-product-name">Vibe Codr</h1>
        <button
          ref={searchTriggerRef}
          type="button"
          className={`icon-button rail-search-toggle${searchIsOpen ? " active" : ""}`}
          onClick={() => {
            if (searchIsOpen) {
              setSearchOpen(false);
              setQuery("");
              searchTriggerRef.current?.focus();
              return;
            }
            setSearchOpen(true);
            window.requestAnimationFrame(() => filterRef.current?.focus());
          }}
          aria-label={searchIsOpen ? "Close project search" : "Search projects"}
          aria-expanded={searchIsOpen}
          aria-controls="project-filter"
          title={searchIsOpen ? "Close project search" : "Search projects"}
        >
          <IconSearch size={14} />
        </button>
      </div>

      <nav className="rail-actions" aria-label="Session actions">
        <button
          type="button"
          className="rail-action"
          onClick={onNewSession}
          disabled={!activeCwd || busy}
          title={busy ? busyTitle : undefined}
          aria-label={busyActionLabel("New session")}
        >
          <IconPlus size={14} />
          <span>New session</span>
        </button>
        <button
          type="button"
          className="rail-action"
          onClick={onOpenProject}
          disabled={busy}
          title={busy ? busyProjectTitle : undefined}
          aria-label={busyActionLabel("Open project", busyProjectTitle)}
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
          aria-label={busyActionLabel("Continue latest")}
        >
          <IconContinue size={14} />
          <span>Continue latest</span>
        </button>
      </nav>

      <label id="project-filter" className={`rail-filter${searchIsOpen ? " is-open" : ""}`}>
        <span className="sr-only">Filter projects and sessions</span>
        <IconSearch size={14} />
        <input
          ref={filterRef}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              if (query) setQuery("");
              else {
                setSearchOpen(false);
                window.requestAnimationFrame(() => searchTriggerRef.current?.focus());
              }
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
              {renamingProject?.cwd === project.cwd ? (
                <form
                  className="project-rename"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void commitProjectRename();
                  }}
                >
                  <input
                    ref={projectRenameRef}
                    className="project-rename-input"
                    value={renamingProject.name}
                    onChange={(event) => setRenamingProject({ ...renamingProject, name: event.target.value })}
                    onBlur={() => setRenamingProject(null)}
                    onKeyDown={(event) => {
                      if (event.key === "Escape") {
                        event.preventDefault();
                        setRenamingProject(null);
                      }
                    }}
                    aria-label="Rename project"
                  />
                </form>
              ) : (
                <div className="project-heading-row">
                  <button
                    type="button"
                    className={`project-heading${isActiveProject ? " active" : ""}`}
                    onClick={() => toggleProject(project.cwd)}
                    aria-expanded={isExpanded}
                    aria-controls={`project-sessions-${project.cwd.replace(/[^a-zA-Z0-9_-]/g, "_")}`}
                    aria-label={`${isExpanded ? "Collapse" : "Expand"} sessions for ${projectLabel(project, projects)}`}
                    title={`${project.cwd} · ${isExpanded ? "collapse" : "expand"} sessions`}
                  >
                    <span className="project-folder" aria-hidden>
                      {isExpanded ? <IconFolderOpen size={14} /> : <IconFolder size={14} />}
                    </span>
                    <span className="project-name">{projectLabel(project, projects)}</span>
                    <span className="project-heading-meta">
                      <IconChevron open={isExpanded} size={13} />
                    </span>
                  </button>
                  <button
                    type="button"
                    className="project-more"
                    aria-label={`Actions for project ${projectLabel(project, projects)}`}
                    aria-haspopup="menu"
                    aria-expanded={
                      menu?.kind === "project" && menu.cwd === project.cwd && !menuClosing
                    }
                    title="Project actions"
                    onClick={(event) => openProjectMenu(event, project)}
                  >
                    <IconMore size={14} />
                  </button>
                </div>
              )}
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
                    const isActive = session.id === activeSessionId;
                    return (
                      <div
                        key={session.id}
                        className={`session-row-wrap${isActive ? " active" : ""}`}
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
                              onBlur={() => setRenaming(null)}
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
                            className={`session-row${isActive ? " active" : ""}`}
                            onClick={() => onResume(project.cwd, session.id)}
                            onContextMenu={(event) => openMenu(event, project.cwd, session)}
                            disabled={busy}
                            aria-current={isActive ? "true" : undefined}
                            aria-label={
                              busy
                                ? `${session.title}. AI is working in this session. ${busyTitle}`
                                : undefined
                            }
                            title={busy ? busyTitle : `${session.title}\n${session.model}`}
                          >
                            <span className="session-title">{session.title}</span>
                            <time
                              className="session-time"
                              dateTime={new Date(session.updatedAt).toISOString()}
                            >
                              {relativeSessionTime(session.updatedAt)}
                            </time>
                            {isActive && busy ? (
                              <span
                                className="session-status-indicator is-busy"
                                aria-hidden="true"
                              />
                            ) : null}
                          </button>
                        )}
                        {!isRenaming && (
                          <button
                            type="button"
                            className="session-more"
                            aria-label={
                              busy
                                ? `Session actions for ${session.title}. ${busyTitle}`
                                : `Session actions for ${session.title}`
                            }
                            aria-haspopup="menu"
                            aria-expanded={
                              menu?.kind === "session" &&
                              menu.session.id === session.id &&
                              !menuClosing
                            }
                            disabled={busy}
                            title={busy ? busyTitle : undefined}
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

      {menu && createPortal(
        <div
          ref={menuRef}
          className={`session-menu${menuClosing ? " is-closing" : ""}${
            (menu.kind === "project" ? confirmProjectAction : confirmAction) ? " is-confirm" : ""
          }`}
          style={{ left: menu.x, top: menu.y }}
          role={menu.kind === "project" ? (confirmProjectAction ? "alertdialog" : "menu") : (confirmAction ? "alertdialog" : "menu")}
          aria-label={
            menu.kind === "project"
              ? confirmProjectAction
                ? `${confirmProjectAction === "delete" ? "Delete" : "Archive"} ${projectLabel(menu.project, projects)}`
                : `Actions for ${projectLabel(menu.project, projects)}`
              : confirmAction
                ? `${confirmAction === "delete" ? "Delete" : "Archive"} ${menu.session.title}`
                : `Actions for ${menu.session.title}`
          }
        >
          {menu.kind === "project" ? (
            confirmProjectAction ? (
              <div className="session-menu-confirm">
                <p className="session-menu-confirm-msg">
                  <span className="session-menu-confirm-title">
                    {confirmProjectAction === "delete"
                      ? `Delete ${projectLabel(menu.project, projects)}?`
                      : `Archive ${projectLabel(menu.project, projects)}?`}
                  </span>
                  <span className="session-menu-confirm-detail">
                    {confirmProjectAction === "delete"
                      ? "Removes it from project history and deletes its saved sessions."
                      : "Leaves the project list but remains on disk."}
                  </span>
                </p>
                <div className="session-menu-confirm-actions">
                  <button
                    type="button"
                    className="session-menu-confirm-cancel"
                    // biome-ignore lint/a11y/noAutofocus: focus the safe choice so Enter cancels, not confirms
                    autoFocus
                    onClick={() => setConfirmProjectAction(null)}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className={`session-menu-confirm-go${confirmProjectAction === "delete" ? " danger" : ""}`}
                    onClick={() => {
                      const { cwd } = menu;
                      const mode = confirmProjectAction;
                      setMenu(null);
                      setConfirmProjectAction(null);
                      if (mode === "delete") void onDeleteProject(cwd);
                      else void onArchiveProject(cwd);
                    }}
                  >
                    {confirmProjectAction === "delete" ? "Delete" : "Archive"}
                  </button>
                </div>
              </div>
            ) : (
              <>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setRenamingProject({ cwd: menu.cwd, name: menu.project.name });
                    setMenu(null);
                  }}
                >
                  <IconRename size={14} />
                  Rename
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => setConfirmProjectAction("archive")}
                >
                  <IconArchive size={14} />
                  Archive
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="danger"
                  onClick={() => setConfirmProjectAction("delete")}
                >
                  <IconDelete size={14} />
                  Delete
                </button>
              </>
            )
          ) : confirmAction ? (
            <div className="session-menu-confirm">
              <p className="session-menu-confirm-msg">
                <span className="session-menu-confirm-title">
                  {confirmAction === "delete"
                    ? `Delete “${menu.session.title}”?`
                    : `Archive “${menu.session.title}”?`}
                </span>
                <span className="session-menu-confirm-detail">
                  {confirmAction === "delete"
                    ? "This cannot be undone."
                    : "Leaves this project’s session list."}
                </span>
              </p>
              <div className="session-menu-confirm-actions">
                <button
                  type="button"
                  className="session-menu-confirm-cancel"
                  // biome-ignore lint/a11y/noAutofocus: focus the safe choice so Enter cancels, not confirms
                  autoFocus
                  onClick={() => setConfirmAction(null)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className={`session-menu-confirm-go${confirmAction === "delete" ? " danger" : ""}`}
                  onClick={() => {
                    const { cwd, session } = menu;
                    const mode = confirmAction;
                    setMenu(null);
                    setConfirmAction(null);
                    if (mode === "delete") void onDeleteSession(cwd, session.id);
                    else void onArchiveSession(cwd, session.id);
                  }}
                >
                  {confirmAction === "delete" ? "Delete" : "Archive"}
                </button>
              </div>
            </div>
          ) : (
            <>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setRenaming({ cwd: menu.cwd, id: menu.session.id, title: menu.session.title });
                  setMenu(null);
                }}
              >
                <IconRename size={14} />
                Rename
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => setConfirmAction("archive")}
              >
                <IconArchive size={14} />
                Archive
              </button>
              <button
                type="button"
                role="menuitem"
                className="danger"
                onClick={() => setConfirmAction("delete")}
              >
                <IconDelete size={14} />
                Delete
              </button>
            </>
          )}
        </div>,
        document.body,
      )}
    </aside>
  );
}
