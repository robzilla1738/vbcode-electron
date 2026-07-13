import { type ReactNode, useEffect, useRef } from "react";
import type { WorkspaceDockTarget } from "./WorkspaceDock";

export type ActivitySidebarTarget = Exclude<WorkspaceDockTarget, "files">;

const TABS: Array<{ target: ActivitySidebarTarget; label: string }> = [
  { target: "session", label: "Session" },
  { target: "changes", label: "Changes" },
  { target: "git", label: "Git" },
  { target: "terminal", label: "Terminal" },
  { target: "jobs", label: "Jobs" },
];

export function ActivitySidebar({
  active,
  changedCount,
  jobCount,
  onSelect,
  onClose,
  children,
}: {
  active: ActivitySidebarTarget;
  changedCount: number;
  jobCount: number;
  onSelect: (target: ActivitySidebarTarget) => void;
  onClose: () => void;
  children: ReactNode;
}) {
  const sidebarRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      const target = event.target;
      const ownsTarget =
        target === document.body ||
        target === document.documentElement ||
        (target instanceof Node && sidebarRef.current?.contains(target));
      if (!ownsTarget) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      onClose();
    };
    window.addEventListener("keydown", closeOnEscape, { capture: true });
    return () => window.removeEventListener("keydown", closeOnEscape, { capture: true });
  }, [onClose]);

  return (
    <aside
      ref={sidebarRef}
      className="activity-sidebar"
      data-active={active}
      aria-label="Workspace tools"
    >
      <nav className="activity-sidebar-tabs" aria-label="Activity sidebar views">
        {TABS.map((tab) => {
          const count = tab.target === "changes"
            ? changedCount
            : tab.target === "jobs"
              ? jobCount
              : 0;
          return (
            <button
              key={tab.target}
              type="button"
              className={`activity-sidebar-tab${active === tab.target ? " is-active" : ""}`}
              aria-current={active === tab.target ? "page" : undefined}
              onClick={() => onSelect(tab.target)}
            >
              <span>{tab.label}</span>
              {count > 0 ? <span className="activity-sidebar-tab-count">{count}</span> : null}
            </button>
          );
        })}
      </nav>
      <div className="activity-sidebar-content">{children}</div>
    </aside>
  );
}
