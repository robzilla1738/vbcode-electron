# Changelog

## 0.1.16 — 2026-07-15

### Added

- Added built-in ChatGPT/Codex sign-in using the official PKCE flow, automatic
  token refresh, ChatGPT account routing, deterministic connection state, and
  sign-out from onboarding or Settings.
- Added xAI browser and device-code sign-in for eligible Grok subscriptions,
  including Grok Build, refresh-token rotation, cancellation, expiry, and retry.
- Expanded provider setup to the synchronized 166-provider models.dev catalog
  and arbitrary named custom providers with Chat Completions or Responses
  transport, explicit models, headers, base URLs, and deterministic Cloud envs.
- Subscription Cloud handoff exports only a current access token and optional
  account routing ID from main; refresh tokens remain in the local user-only
  credential store and are unavailable to renderer IPC.

## 0.1.15 — 2026-07-15

### Fixed

- Ollama Cloud handoff now pins the hosted endpoint and verifies the exact
  session model from inside the new sandbox before Local ownership commits.
  A Mac-local endpoint, unreachable route, invalid credential, or unavailable
  model fails safely without leaving the user in a broken Cloud session.
- Cloud-to-Local export now runs as the isolated workload owner that owns the
  restored workspace, handles tracked/concurrent deletions, and reports the
  real exception instead of the trailing Node.js version from a stack trace.
- The locked `vibe-codr` 0.5.8 runtime smoke exercises both exact Cloud resume
  and the protected return-export path.

## 0.1.14 — 2026-07-15

### Fixed

- The Cloud daemon now sends its validated `cloud/e2b` or `cloud/vercel`
  execution target directly in the engine bootstrap command. The final health
  preflight no longer reconstructs ownership authority from process environment.
- Ownership failures include the expected target, and the locked engine adds a
  regression test that resumes a Cloud-owned session with no Cloud environment.

## 0.1.13 — 2026-07-15

### Fixed

- The permanent Cloud daemon now receives the selected provider as an explicit,
  validated startup argument. E2B background-process environment handling can
  no longer make an imported `cloud/e2b` session appear locally owned during
  the authenticated health check.
- Fresh handoff and reconnect use the same explicit provider path, while owner,
  generation, session ID, model, and transcript checks remain fail-closed.

## 0.1.11 — 2026-07-15

### Fixed

- Cloud restore verification now authorizes the exact imported session and
  `cloud/e2b` target from the portable archive itself instead of depending on
  ownership environment variables surviving the sandbox identity boundary.
- The bundled runtime smoke removes those ambient ownership variables before
  resuming, preventing this production-only `session is owned by cloud/e2b`
  false rejection from recurring.

## 0.1.10 — 2026-07-15

### Fixed

- Cloud handoff now invokes the runtime's identity-safe restore entrypoint, so
  the imported session is created and verified by the same non-root workload
  identity that resumes it in the permanent daemon.
- Eliminated the live E2B root/non-root state boundary that could report
  `requested session not found` after an otherwise successful import.

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
