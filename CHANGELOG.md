# Changelog

## 0.1.9 — 2026-07-15

### Fixed

- Cloud handoff now starts the permanent isolated engine on the exact imported
  session before the daemon can report healthy. A missing explicit resume is a
  hard failure and can never fall through to a replacement chat.
- Cloud health failures now surface the concrete final-workload resume error
  immediately while preserving the original Local session.

## 0.1.8 — 2026-07-15

### Fixed

- Prevented fresh Local → Cloud handoffs from reusing a stale same-name
  provisional sandbox. A stale resource is destroyed before creation, so an
  abandoned daemon cannot return a replacement session ID.
- Kept continuity failures fail-closed: the original local session retains
  ownership when remote identity, model, mode, subagent model, or conversation
  proof does not match.
- Removed the duplicate model selector from command discovery while retaining
  typed legacy aliases for compatibility.

### Improved

- Grouped slash discovery into Commands, Skills, and System with Tab/Shift+Tab
  cycling and accessible tab semantics.
- Added shared enter/exit presence motion to project and activity sidebars,
  drawer scrims, slash/mention menus, mode/insert menus, and catalog pickers.
- Preserved reduced-motion behavior and made leaving surfaces inert before their
  visual exit completes.
- Documented the minimal project-row new-chat affordance, running Cloud session
  indicator, canonical Vibe Dark palette, and current release verification.

## 0.1.7 — 2026-07-15

- Kept the renderer bundle within its release budget while retaining seamless
  handoff and shell polish from the 0.1.x release series.
