# vbcode-electron — thorough logic audit & improvement backlog

**Date:** 2026-07-13  
**Commit audited:** `c8b60f9`  
**Scope:** Electron presentation shell only (main · preload · renderer · shared · scripts/tests/docs)  
**Role of this repo:** Render `UIEvent`s and send `EngineCommand`s over the NDJSON host protocol. Do **not** reimplement `@vibe/core`.

This document lists **real, evidence-backed** improvements. Generic advice without repo anchors is excluded. Recommendations respect hard product constraints in `AGENTS.md`.

---

## Executive summary

The shell is already unusually strong for its class: generation-isolated host lifecycle, protocol codec + runtime guards, busy-until-`engine-idle`, clear-scoped event suppression, atomic config writes, trusted-sender IPC, sandbox/contextIsolation, source-parity + bundle gates, hermetic fixture e2e, and real CI (Linux verify/e2e + mac packaged smoke).

The gap to **industry-leading** (Cursor / Claude Desktop / production Electron coding shells) is not “missing features” so much as:

1. **Host lifecycle edge cases** that can orphan processes on quit or soft-kill.
2. **Session handoff correctness** (trail reset, empty `sessionId` filter, optimistic busy).
3. **Long-session performance** (no true virtualization; Streamdown/Shiki cost on every stream flush).
4. **Git/config safety hardening** (ref injection, force-with-lease, secret file modes).
5. **Test automation honesty** (settings/git/dock untested; coverage gates absent; docs over-claim “complete”).

| Tier | Count (approx.) | Intent |
|------|-----------------|--------|
| **P0** | 6 | Correctness, data-loss, orphan process, security that changes op semantics |
| **P1** | 28 | Reliability, high-impact performance, security defense-in-depth, test holes |
| **P2** | 24 | Product quality, maintainability, packaging maturity |
| **P3** | 18 | Polish, a11y depth, DX niceties |

---

## Hard constraints (do not violate)

| Constraint | Implication for backlog |
|------------|-------------------------|
| No engine fork | Items that need new engine RPCs / loop behavior are labeled **engine-adjacent** or **out of shell** |
| Busy until `engine-idle` | Do not “fix” by clearing busy on `session-idle` / `turn-finished` |
| TUI-faithful themes + slash/mode/busy semantics | Prefer porting pure modules from vibe-codr TUI |
| Workspace dock lane contracts | Session / Changes / Git / Jobs mutually exclusive right lane on chat surface |
| Intentional non-parity | OpenTUI grid, mouse capture, plugin install UI, job-kill, DAG graph — **out of scope** |

---

## What is already strong (do not re-recommend as gaps)

- Bridge generations, lifecycle queue, ready timeout kill, invalid protocol → fatal (`src/main/engine-bridge.ts` + tests).
- Packaged host preferred over sibling checkout; stale compiled host rejected when sources newer (`src/main/host-resolver.ts`).
- `contextIsolation` + `sandbox` + trusted-sender IPC (`src/main/ipc-security.ts`) + `decodeInbound` revalidation.
- Atomic config write (temp+rename), per-path write serialization, pre-write validate.
- Busy-until-`engine-idle` + clear-scoped types + `/clear`/`/new` abort → local clear → slash.
- Path escape check on `fs:readTextFile`; external URL scheme allowlist; production CSP.
- Rich pure-module tests (`protocol`, `reducer` via parity, `config-*`, `git-ops`, `engine-bridge`).
- CI workflow exists (`.github/workflows/ci.yml`).

---

# 1. Main process

### P0 — Quit race can orphan the engine host
- **Evidence:** `src/main/index.ts:543–570` races finalize+stop against **5s**, then `app.exit(0)`. `bridge.rpc("finalize")` uses **20s** default timeout (`engine-bridge.ts:14, 220–228`). If finalize hangs past 5s, `stop()` often never runs.
- **Why:** Orphan `vibecodr-engine-host` processes, locked sessions — contradicts A03 / “no orphan process.”
- **Direction:** Short finalize budget (1–2s); **always** stop/kill in `finally`; await exit or SIGKILL; optional process-group kill.

### P0 / P1 — `isRunning` false after soft-kill while child may live
- **Evidence:** `isRunning` is `proc != null && !proc.killed` (`engine-bridge.ts:66–68`). `terminateFatal` / ready-timeout call `proc.kill()` without waiting for exit. `before-quit` returns early when `!isRunning` (`index.ts:544`).
- **Why:** Quit after partial host death skips finalize/stop cleanup.
- **Direction:** Track “owned child not yet exited”; treat as active until exit or escalated kill.

### P1 — `stopCurrent` does not escalate to SIGKILL
- **Evidence:** After shutdown + 2s race, only `proc?.kill()` (SIGTERM) then `this.proc = null` with no exit wait (`engine-bridge.ts:187–207`). Contrast `git-ops` SIGTERM→SIGKILL (`git-ops.ts:60–63`).
- **Why:** Wedged host unreferenced and can outlive the app.
- **Direction:** SIGTERM → wait → SIGKILL → await exit with hard ceiling.

### P1 — RPC allowed before `ready`
- **Evidence:** `rpc()` only checks `isRunning` (`engine-bridge.ts:220–221`), true after spawn. Quit may `rpc("finalize")` on non-ready host.
- **Why:** Spurious timeouts / odd host errors.
- **Direction:** Gate RPC on `didReady`; on quit, skip finalize if never ready.

### P1 — No single-instance lock
- **Evidence:** No `app.requestSingleInstanceLock()` in `src/main`.
- **Why:** Two instances → two hosts, concurrent config writes, session index races.
- **Direction:** Single-instance lock; focus existing window; optional path forward.

### P1 — Synchronous source mtime walk on every host resolve
- **Evidence:** `newestSourceMtime` recursive `statSync`/`readdirSync` over all engine packages (`host-resolver.ts:36–68, 83–90`) on every bootstrap.
- **Why:** Multi-second main-thread stalls on large vibe-codr trees during project switch.
- **Direction:** TTL cache / build-stamp file; never walk when packaged.

### P1 — Editor compose PATH + hang risk
- **Evidence:** `editor:compose` uses `process.env` not `enrichedEnv()`, `stdio: "inherit"`, no timeout (`index.ts:418–428`).
- **Why:** Dock-launched apps miss `code`/`nvim`; hung editor wedges IPC forever.
- **Direction:** `enrichedEnv()`, finite timeout + kill.

### P1 — Unbounded git/`gh` stream buffers on main
- **Evidence:** `runGit` / `spawnGh` append all stdout/stderr (`git-ops.ts:58–66`, `git-ipc.ts:58–65`).
- **Why:** Main-process memory spike on huge repos.
- **Direction:** Cap capture bytes; fail clearly when exceeded.

### P1 — Config secrets written with default file mode
- **Evidence:** `atomicWriteJson` / `writeMemoryFile` use plain `writeFile` without `mode: 0o600` (`config-io.ts:139–147`).
- **Why:** Provider keys in `~/.config/vibe-codr/config.json` can be world-readable (umask-dependent).
- **Direction:** `0o600` for global config/memory; chmod after rename if needed.

### P2 — Config validate-then-write not one critical section
- **Evidence:** `config:write` previews+validates outside `writeConfigFile` chain (`config-ipc.ts:61–71`; `config-io.ts:243–261`).
- **Why:** Concurrent patches can persist an unvalidated merge.
- **Direction:** Single scheduled path: read → merge → validate → atomic write.

### P2 — Memory writes unbounded and unserialized
- **Evidence:** `memory:write` any string length; not on `writeChains` (`config-ipc.ts:107–118`, `config-io.ts` memory write).
- **Why:** Huge paste / concurrent clobber.
- **Direction:** Size cap + same path serialization as config.

### P2 — Clipboard image paste unbounded
- **Evidence:** Full `toPNG()` write (`index.ts:394–405`).
- **Why:** Multi-MB clipboard images under project `.vibe/clipboard`.
- **Direction:** Reject over N MB.

### P2 — No Chromium permission default-deny
- **Evidence:** No `setPermissionRequestHandler` / `setPermissionCheckHandler`.
- **Why:** Defense-in-depth if a dependency requests media/geolocation.
- **Direction:** Default-deny all; allow only explicit needs.

### P2 — `shell:showItem` accepts any path; git/config `cwd` fully trusted
- **Evidence:** `shell:showItem` string-only check (`index.ts:380–384`); git/config/listFiles trust renderer `cwd`.
- **Why:** Compromised renderer → broader FS/git blast radius than necessary.
- **Direction:** Allowlist of opened project roots + global vibe paths.

### P2 — Invalid `VIBE_CODR_ROOT` silently falls through
- **Evidence:** `host-resolver.ts:148–163` ignores failed env root.
- **Why:** “Wrong engine” debugging nightmares.
- **Direction:** If env set and invalid, fail loudly (at least unpackaged).

### P2 — macOS last-window close leaves host running with no UI sink
- **Evidence:** `window-all-closed` non-darwin only (`index.ts:573–575`); events dropped when `mainWindow` null.
- **Why:** Background host burns CPU/API after close.
- **Direction:** Stop host on last window close, or explicit hibernate policy.

### P2 — Unsigned builds / no auto-update / no crash reporter
- **Evidence:** `package.json` `"identity": null`; no `autoUpdater` / `crashReporter`.
- **Why:** Gatekeeper friction; no field updates; no production crash signal.
- **Direction:** Sign+notarize when credentials exist; opt-in crash reporter (no prompt content); update channel.

### P3 — stdin writes ignore backpressure; `dialog:openProject` uses `mainWindow!`; PATH-only bun missed
- **Evidence:** `engine-bridge.ts:244–247`; `index.ts:365`; `host-resolver.ts:71–80`.
- **Direction:** Drain queue; null-safe dialog; PATH search after conventional bun locations.

---

# 2. Preload

### P1 — Preload surface is a thin pass-through (good) but untested contract vs mock
- **Evidence:** `src/preload/index.ts` exposes ~40 `window.vibe` methods; `tools/ui-preview/mock-vibe.ts` is hand-built without `satisfies VibeApi`.
- **Why:** UI preview and future tests drift from real IPC silently.
- **Direction:** `satisfies VibeApi`; shared key-list contract test (preload vs mock).

### P2 — No runtime version handshake surface
- **Evidence:** Preload/API has no `getShellVersion` / host protocol version field for renderer banners.
- **Why:** Protocol skew UI is harder to diagnose (engine-adjacent if host must emit version).
- **Direction:** Expose app version + last launch description already known in main; optional host protocol version when available.

---

# 3. Renderer — session wiring & UI logic

### P0 / P1 — Thinking `Trail` not reset on new turn or bootstrap
- **Evidence:** `trail.current.reset()` only in `clearSessionLocal` (`useSession.ts:443`). `user-message` clears chrome `thoughtLog` (`session-state.ts:346`) but never resets the `Trail` instance. Bootstrap omits `trail.reset()` (`useSession.ts:455–481`). Append only on reasoning (`useSession.ts:256–258`).
- **Why:** Next turn / next session can show **previous-turn reasoning mixed into thoughtLog** after first append.
- **Direction:** `trail.current.reset()` on `user-message` and bootstrap start.

### P1 — Bootstrap clears `activeSessionId`, accepting foreign events mid-handoff
- **Evidence:** Session filter only when id truthy (`useSession.ts:179`); bootstrap sets `activeSessionId.current = ""` (`:462`) until snapshot (`:512`).
- **Why:** Late events from dying host can mutate still-visible previous transcript during switch.
- **Direction:** Keep previous id until seed, or “bootstrap in progress” drop-all-session-events token.

### P1 — Optimistic `setBusy(true)` for every remaining slash / submit
- **Evidence:** `App.tsx:882–885` after local handlers: `session.setBusy(true)` then `sendMany`. Mode cycle correctly does **not** set busy. Many `run-slash` commands may not emit `engine-idle`.
- **Why:** Stuck Stop/busy chrome; rail blocks project switch until a later real turn.
- **Direction:** Set busy only for turn-starting commands (`submit-prompt`, etc.), or clear busy if send succeeds and no turn activity starts within a short window / snapshot.busy false.

### P1 — Reasoning stream forces full-tree re-renders
- **Evidence:** Each `reasoning-delta` dispatches `set-thinking` + `set-trail` (`useSession.ts:257–258`). No `React.memo` on transcript blocks; App depends on whole `session` object (`useSession` returns new object every render `:670–707`).
- **Why:** Multi-minute agent runs jank main thread; below industry desktop chat bar.
- **Direction:** Coalesce thinking/trail on 24ms flush timer; memoize block views; stabilize session API / split chrome vs transcript React trees.

### P1 — Transcript windowing ≠ memory bound; no virtualization
- **Evidence:** `WINDOW_TURNS = 40` only slices DOM (`useSession.ts:85–88, 614–619`); `transcript.blocks` retains full session; no `content-visibility` / list virtualization.
- **Why:** Long sessions grow RAM and slow `groupIntoTurns` forever.
- **Direction:** Cap retained blocks or externalize old turns; virtualize scroll list; aggressive quiet-density tool body truncation.

### P1 — Streamdown/Shiki cost every 24ms stream flush
- **Evidence:** `MarkdownView.tsx` always `Streamdown` + shiki; assistant deltas flush every 24ms (`useSession.ts:246–248`).
- **Why:** Known desktop-chat hotspot on growing markdown.
- **Direction:** Plain/fast markdown while streaming; full highlight on finalize; memo by text.

### P2 — Concurrent permission/plan resolve race
- **Evidence:** `answerPerm` / `answerPlan` (`App.tsx` ~614–650) no in-flight guard; Y/A/N and buttons can double-fire.
- **Direction:** Resolving ref; disable until `permission-settled`.

### P2 — Edit user message only prefills draft
- **Evidence:** `TranscriptView` onEdit → draft only; no abort/truncate/resubmit.
- **Why:** Industry UIs revise-and-rerun; this is silent copy.
- **Direction:** Document intentional non-parity **or** engine-backed edit when protocol allows (**engine-adjacent**).

### P2 — History hydrate drops file changes / diffs
- **Evidence:** `history-hydrate.ts` only user/assistant/tool; no `changedFiles`. Resume: `useSession.ts:536–538`.
- **Why:** Changes dock / Inspector empty after resume until new edits.
- **Direction:** Hydrate from history tool metadata **or** snapshot `changedFiles` field (**engine-adjacent** if snapshot must expand).

### P2 — Settings unmounts entire chat workspace
- **Evidence:** `App.tsx` ~1287–1294 swaps to `SettingsView` only.
- **Why:** Loses scroll/panel continuity; feels like full context switch.
- **Direction:** Keep chat mounted (hidden) or overlay settings.

### P2 — Global `N` skips permission deny-reason UI
- **Evidence:** App key handler denies immediately; card has two-step deny+reason.
- **Direction:** First `N` focuses deny field; second confirms.

### P2 — Host-down recovery is binary
- **Evidence:** `onFatal` → `bootError`, composer disabled; manual New/Retry only.
- **Direction:** Host watchdog + optional auto-bootstrap with preserve banner.

### P2 — Abort on `/clear`/`/new` not sequenced with host idle
- **Evidence:** `App.tsx:804–808` abort → clear local → slash without waiting for idle.
- **Why:** Residual ordering edge cases (suppress usually saves it).
- **Direction:** Optional wait for idle/ack with timeout before clear (check TUI).

### P3 — `suppressAfterClear` swallows `engine-error`; queueActive never shown; toast a11y; focus traps on Keys/Onboarding; dock Local/Files duplicate; Git Esc closes from fields; density toast ignores send failure; ErrorBoundary full reload; double menu-action subscriptions
- **Evidence:** `useSession.ts` CLEAR_SCOPED; `session-state.ts:239–240` vs QueuePanel; `App.tsx` toast; overlays; `WorkspaceDock.tsx`; `GitPanel.tsx`; `ErrorBoundary.tsx`.
- **Direction:** Allow errors through suppress; show active queue row; reuse focus-trap helper; Esc stack for git form; single menu router; soft remount first.

### P3 — App.tsx / Composer.tsx god-modules
- **Evidence:** ~1755 / ~1240 lines.
- **Why:** High change risk; hard review.
- **Direction:** Extract submit routing, catalog live-sync, keyboard stack pure modules with unit tests (no behavior change).

---

# 4. Shared pure modules & contracts

### P1 — Git ref/name args can be interpreted as flags
- **Evidence:** `createBranch`/`checkout`/`delete`/`merge` pass bare names (`git-ops.ts:267–420`); staging correctly uses `--` (`:332`). No reject of leading `-`.
- **Why:** Argv-safe spawn, but git option injection via name like `--delete`.
- **Direction:** `assertGitRef()` + pass refs after `--`; unit tests.

### P1 — Protocol allowlists not exhaustive vs TypeScript unions
- **Evidence:** `UI_EVENT_TYPES` / `ENGINE_COMMAND_TYPES` (`protocol.ts:76–92`) are subsets without exhaustiveness check.
- **Why:** New host events fail closed with silent UI gaps and no compile error.
- **Direction:** `satisfies Record<UIEvent["type"], 1>` (or equivalent) + unit test.

### P2 — Shallow `isUIEvent` + separate deep `isRenderableUIEvent`
- **Evidence:** `protocol.ts` shallow; deep only `runtime-guards.ts:188–204`; dual gates can diverge.
- **Direction:** Fold deep checks into decode path for all consumers.

### P2 — `validateConfig` holes vs Settings surface
- **Evidence:** `config-validate.ts` covers providers/MCP basics; misses many Settings-editable fields (permissions actions, budget, goal rounds, etc.).
- **Why:** Invalid config hits disk; engine fails on next bootstrap.
- **Direction:** Extend to every Settings field; ideally share schema with `@vibe/config` (**engine-adjacent** for single source of truth).

### P2 — Prototype pollution defense on config merge
- **Evidence:** `mergeForWrite` assigns keys freely (`config-io.ts:95–110`).
- **Direction:** Skip `__proto__` / `constructor` / `prototype`.

### P2 — Git porcelain not NUL-delimited
- **Evidence:** `status --porcelain` + line parse (`git-ops.ts:205–220, 226`).
- **Why:** Paths with spaces/quotes mis-parse; wrong path can be staged from UI.
- **Direction:** `--porcelain=v1 -z`; fixtures with spaces/renames.

### P2 — Force push is raw `--force`
- **Evidence:** `pushBranch` (`git-ops.ts:424–440`).
- **Why:** Remote work discard risk.
- **Direction:** Default `--force-with-lease`; explicit unsafe flag for true force; UI confirm.

### P2 — `Trail.#open` unbounded on newline-free streams
- **Evidence:** `trail.ts:35–42` only caps closed `#lines`.
- **Why:** Huge open string on main thread.
- **Direction:** Cap `#open` length.

### P2 — Missing pure tests for Trail cap, git ref safety, porcelain, protocol exhaustiveness
- **Evidence:** No dedicated Trail tests; `git-ops.test.ts` lacks flag-name/space-path cases.
- **Direction:** Add focused pure tests listed under each finding.

### P3 — `buildConfigPatch` array equality via `JSON.stringify`; JSONC unclosed comment; empty commit message; duplicate sources/skills helpers; `modelCatalogOptions` ignores `current`; expandable URL trusts `${`; chrome-seed `mouse: true`; negative tokens allowed
- **Evidence:** `config-diff.ts`, `config-io.ts`, `git-ops.ts:commit`, `sources.ts` vs `rich-blocks.ts`, `catalog-draft.ts:261–265`, `config-validate.ts:32–36`, `chrome-seed.ts`, protocol optionalNumber.
- **Direction:** Structural deep equal; stricter validation; dedupe helpers; wire current-model marker.

---

# 5. Packaging, scripts, CI, tests, docs

### P0 / P1 — Critical modules untested
- **Evidence:** No unit tests for `host-resolver.ts`, `ipc-security.ts`, `index.ts` IPC/quit, `useSession.ts`, `App.tsx`, Settings/Git UI. 19 test files vs ~104 TS modules; almost all pure `shared/*` + bridge + session-state.
- **Why:** Highest-risk regressions sit outside unit net.
- **Direction:** Injectable seams for host-resolver; extract pure event application from useSession; Testing Library for composer/dock; IPC integration tests.

### P0 / P1 — E2E misses major product surfaces
- **Evidence:** `test/e2e/harness.spec.ts` (10 scenarios) covers chat/protocol well; **not** Settings write, Git mutations, dock lane reservation, turn-changes, rail resize, Finder drop, onboarding, continue-latest, project switch mid-busy.
- **Why:** ACCEPTANCE marks many of these `pass` via review/manual only.
- **Direction:** Hermetic e2e for dock exclusivity + scroll stability; config write reject; git status fixture; onboarding flag; drop path resolution.

### P1 — E2E shared app + fixed sleeps
- **Evidence:** Single `beforeAll` Electron; `waitForTimeout(900)` for clear case; order-coupled mutations.
- **Why:** Flake under xvfb.
- **Direction:** Isolation for mutating tests; event-driven waits; beforeEach reset.

### P1 — No coverage measurement/gate
- **Evidence:** `vitest.config.ts` has no coverage provider/thresholds.
- **Direction:** V8 coverage; floors on `src/shared` + bridge + host-resolver first.

### P1 — `verify` ≠ full CI / release gate
- **Evidence:** `package.json` `verify` = lint+unit+parity+typecheck+build+bundle; CI adds e2e + pack smoke; `smoke:bridge` not in CI.
- **Direction:** `verify:fast` / `verify:ci` matching workflow; document local vs release.

### P1 — UI shots are not visual regression
- **Evidence:** `tools/ui-preview/shoot.mjs` captures PNGs, no baseline compare, no non-zero exit on failure, not in CI; does not start preview server.
- **Direction:** Playwright screenshot asserts + webServer; fail on error.

### P1 — Mock `window.vibe` drift; copy-host no freshness/arch
- **Evidence:** mock-vibe hand-built; `scripts/copy-engine-host.mjs` first-candidate copy only.
- **Why:** Stale packed host sticky when packaged prefers bundle.
- **Direction:** `satisfies VibeApi`; fail copy if binary older than sources / wrong arch.

### P1 — Docs over-claim “implementation complete”
- **Evidence:** ACCEPTANCE header “implementation complete”; all P0 `pass` including review-only rows; frozen “174 unit / 10 e2e” counts in multiple docs.
- **Why:** Agents and humans stop improving quality when the contract says done.
- **Direction:** Tag verification method honestly (`pass-automated` / `pass-review` / `residual`); residual risks section; stop hardcoding test counts.

### P2 — Source-parity is declaration-AST with large allowlists
- **Evidence:** `scripts/check-source-parity.mjs` + `ALLOW_EXTRAS` / `drift`.
- **Direction:** Keep alarm; add golden behavioral fixtures; pin vibe-codr SHA in CI.

### P2 — Smokes don’t assert orphan-free quit; fixture host ≠ real host in e2e
- **Evidence:** `smoke-bridge.mjs` bypasses `EngineBridge`; packaged smoke is theme-only; e2e uses fixture host.
- **Direction:** Quit + process-table assert; nightly real-host smoke; keep fixture for UI.

### P2 — Bundle budget coarse (one fat renderer chunk); no host binary size budget
- **Evidence:** `check-bundle-size.mjs` total/largest JS only.
- **Direction:** Code-split Shiki/streamdown; gzip report; host binary budget in pack smoke.

### P2 — CI Linux e2e ≠ mac-native paths; no crash telemetry
- **Evidence:** e2e on ubuntu; mac job is pack smoke only.
- **Direction:** Subset e2e on macOS; privacy-preserving crash log under userData.

### P3 — Biome formatter off; Playwright retries/artifacts thin; frozen doc test counts
- **Direction:** Enable format gate; CI retries + screenshots; dynamic counts.

---

# 6. Industry-leading product direction (shell-scope only)

These are **options**, not bugs. Each is grounded in current architecture.

### D1 — Long-session performance budget as a first-class feature
- Virtualized transcript + capped tool bodies + deferred syntax highlight while streaming.
- **Evidence:** Windowing only (`useSession` + `trail.ts` comments on freeze history); Streamdown always on.
- **Trade-off:** More render complexity; huge win for hour-long agent runs.

### D2 — Continuity UX (settings overlay, edit-resubmit, reconnect)
- Keep chat mounted under settings; optional engine edit/resubmit; host auto-reconnect with banner.
- **Evidence:** Settings unmount; edit prefill only; fatal is binary.
- **Trade-off:** Edit/resubmit may need engine protocol; reconnect must not dual-host.

### D3 — Release engineering maturity
- Signed/notarized app+host, auto-update channel, crash breadcrumbs (version + launch description, no user prompts).
- **Evidence:** `identity: null`, no updater/reporter.
- **Trade-off:** Needs Apple credentials and privacy policy.

### D4 — Security posture for a desktop coding agent
- Cwd allowlist, secret file modes, force-with-lease, Chromium permission deny, git ref validation.
- **Evidence:** Sections 1 & 4.
- **Trade-off:** Slight friction on multi-root workflows if allowlist is too strict.

### D5 — Verification honesty + automation depth
- Coverage floors, visual regression, dock/settings/git e2e, host-resolver tests, residual ACCEPTANCE tags.
- **Evidence:** Section 5.
- **Trade-off:** CI time; maintenance of baselines.

**Not recommended as shell work:** reimplement agent loop, plugin store UI, job-kill without TUI, interactive DAG graph, OpenTUI cell metrics (see intentional non-parity).

---

# 7. Scope honesty

## In-scope shell improvements
Everything in sections 1–5 that mutates only this repo’s main/preload/renderer/shared/scripts/tests/docs, without forking the engine loop.

## Engine-adjacent (coordinate with vibe-codr)
| Item | Why |
|------|-----|
| Resume `changedFiles` from snapshot | May need snapshot field from host |
| Edit message / regenerate turn | Needs protocol + engine history semantics |
| Shared Zod/config schema package | Avoid dual validation drift |
| Host protocol version handshake | Host must emit version |
| Real-host e2e beyond fixture | CI must pin host revision |

## Intentional non-goals (do not backlog as shell bugs)
From `PARITY.md` / `AGENTS.md`:

- OpenTUI cell grid / mouse capture / `/mouse`
- Pixel-perfect terminal glyph metrics
- Engine reimplementation in Electron
- Plugin install/enable UI
- In-app MCP server editor / reconnect RPC
- Job-kill UI
- Interactive orchestration DAG graph
- Subagent detail drill-in (static status rows intentional)
- Full-window Liquid Glass replacing CLI themes
- Manual full slash smoke vs paid models (process)
- Release end-user smoke without `VIBE_CODR_ROOT` (manual packaging check)

## Deferred / stage-appropriate
- Public signing/notarization (credential-gated; already noted in VERIFICATION.md)
- Cross-platform Windows/Linux first-class packaging (repo is mac-primary today)

---

# 8. Recommended execution order

1. **Host lifecycle correctness** — quit race, stop/SIGKILL, `isRunning`, RPC-before-ready, single-instance (P0–P1 main).
2. **Session correctness** — Trail reset, sessionId handoff, optimistic busy (P0–P1 renderer).
3. **Git/config hardening** — ref validation, porcelain `-z`, force-with-lease, 0o600 secrets, validated write chain.
4. **Host-resolver perf + tests** — mtime cache + pure unit matrix for AGENTS rule #6.
5. **Long-session perf** — memoization, stream markdown defer, virtualization roadmap.
6. **Test/docs honesty** — host-resolver/useSession tests, dock/settings e2e, coverage, ACCEPTANCE residual tags, mock `satisfies VibeApi`.
7. **Packaging maturity** — copy-host freshness, richer packaged smoke (orphan assert), signing when ready.

Dependency note: characterization tests for `useSession` / host-resolver should land **before** large refactors of those modules.

---

# 9. Layer inventory (for verification)

| Layer | Paths surveyed | Improvement sections |
|-------|----------------|----------------------|
| Main | `src/main/engine-bridge.ts`, `host-resolver.ts`, `ipc-security.ts`, `config-ipc.ts`, `git-ipc.ts`, `index.ts` | §1 |
| Preload | `src/preload/index.ts` | §2 |
| Renderer | `src/renderer/hooks/useSession.ts`, `session-state.ts`, `App.tsx`, composer, transcript, layout, panels, settings, git | §3 |
| Shared | `src/shared/protocol.ts`, `reducer.ts`, `config-io.ts`, `git-ops.ts`, slash/modes/guards/… | §4 |
| Tests/tooling | `test/e2e/harness.spec.ts`, `scripts/*`, `tools/ui-preview`, CI, docs | §5 |
| Contracts | `AGENTS.md`, `PARITY.md`, `UI.md`, `ACCEPTANCE.md`, `VERIFICATION.md` | §7 |

**Approx. item counts:** P0: 6 · P1: 28 · P2: 24 · P3: 18 · Direction: 5 · Total actionable shell items: **~76** (excluding intentional non-goals).

---

# 10. Spot-check anchors (selected)

These were re-verified against source at audit time:

| # | Claim | Anchor |
|---|--------|--------|
| 1 | Quit 5s race vs 20s RPC | `index.ts:543–570`, `engine-bridge.ts:14` |
| 2 | `isRunning` uses `!killed` | `engine-bridge.ts:66–68` |
| 3 | Trail reset only on clear | `useSession.ts:443` vs `256–258` |
| 4 | Bootstrap empties sessionId | `useSession.ts:462` |
| 5 | setBusy on generic submit | `App.tsx:882–885` |
| 6 | Force push raw `--force` | `git-ops.ts:424–440` |
| 7 | Git refs lack `--` | `git-ops.ts:274–298` vs stage `:332` |
| 8 | No single-instance lock | `src/main` grep empty |
| 9 | Host mtime walk | `host-resolver.ts:36–68` |
| 10 | Config no 0o600 | `config-io.ts:139–147` |
| 11 | Windowing not GC | `useSession.ts:85–88` |
| 12 | CI exists; verify ≠ e2e | `.github/workflows/ci.yml`, `package.json` |

---

*End of audit. Implementation is out of scope for this document; use this backlog to prioritize follow-up worktrees / PRs.*
