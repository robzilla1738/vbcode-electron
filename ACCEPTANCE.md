# Acceptance Spec

> Reference: sibling [vibe-codr](https://github.com/robzilla1738/vibe-codr) CLI TUI and `packages/macos-bridge`
> Last updated: 2026-07-13 (public-release hardening pass)
> Status: shell product complete for P0 acceptance rows; residual risks and verification methods documented below — do not treat frozen unit/e2e counts as a live baseline

## Summary

Vibe Codr Electron is a presentation shell over the same `@vibe/core` engine used by the CLI. Parity means every user-visible CLI workflow that can sensibly exist in a desktop shell has equivalent behavior, state transitions, keyboard access, failure handling, and persistence without forking engine logic. Terminal-cell rendering and mouse-capture details are intentionally excluded; semantic themes and harness behavior are not.

## Residual risks (honest automation gaps)

Rows marked `pass` below may still rely on **review** or **manual** verification for some sub-behaviors. Known residual automation gaps (not product non-goals):

- Settings write / Git mutation / Finder multi-drop / onboarding first-run are not fully covered by Playwright e2e (unit + preview + review cover most; dock mutual exclusivity has a hermetic e2e case).
- Visual regression screenshots (`ui:shots`) fail on capture errors but are not pixel-diff gated in CI.
- Executing public signing/notarization requires the protected release
  environment's Apple credentials; the tag workflow and verification steps are
  implemented (see VERIFICATION.md). Local crashReporter is on without upload.
- Engine-adjacent: edit-message resubmit protocol, host protocol version
  handshake, and snapshot-native full diff map if history lacks tool inputs.

Prefer `npm run verify` / `verify:ci` + CI for automated gates; do not treat frozen unit/e2e counts in prose as a live baseline. Hardening residual status: [plans/IMPROVEMENT-AUDIT.md](./plans/IMPROVEMENT-AUDIT.md).

## Areas

- Engine lifecycle and protocol
- Session and project navigation
- Prompt, plan, approval, and queue control
- Transcript and streaming
- Commands, catalogs, files, and editor integration
- Status, tasks, jobs, and inspector
- Themes, layout, accessibility, and resilience
- Packaging and release readiness

## Checklist

| ID | Priority | Area | Feature | Expected behavior | Verification | Status |
|----|----------|------|---------|-------------------|--------------|--------|
| A01 | P0 | Lifecycle | Bootstrap | Opening a cwd starts one host, waits for `ready`, then hydrates a snapshot before accepting input. | test:`src/shared/parity.test.ts`; manual: open a project and confirm restored state before submit | pass |
| A02 | P0 | Lifecycle | Host failures | Missing host, startup timeout, malformed output, fatal host events, and RPC timeouts surface actionable errors without hanging the renderer. | test: bridge failure cases; manual: launch with invalid host root | pass |
| A03 | P0 | Lifecycle | Shutdown | Window/app shutdown finalizes the session, sends shutdown, and leaves no orphan engine host. | test: main lifecycle test; manual: quit during idle and active turns, inspect processes | pass |
| A04 | P0 | Protocol | Boundary ownership | Electron only uses bootstrap/send/rpc/shutdown and shared contracts; it does not read engine persistence or reimplement the agent loop. | review:`src/main`,`src/preload`,`src/renderer`; test: protocol codec | pass |
| A05 | P0 | Sessions | New, clear, resume, continue | New and clear abort when busy, reset all local transient state, suppress stale events, then forward the engine command; resume/continue hydrate history. | test: session state and history hydrate; manual: clear mid-stream then resume | pass |
| A06 | P0 | Sessions | Multi-project navigation | Project/session lists load through host RPC, disambiguate duplicate names, filter, switch cwd, resume by id, continue latest, and restore last cwd. | test: project index helpers; manual: switch two projects and resume titled sessions | pass |
| A07 | P0 | Prompting | Submit and steer | Plain prompts submit once; prompts entered while busy queue/steer exactly as the CLI and can be removed individually. | test: slash/queue routing; manual: enqueue two prompts and remove one | pass |
| A08 | P0 | Prompting | Slash routing | Built-in, custom, hyphenated, plan/execute, compact, model, and path-like input follow the CLI parser without swallowing ordinary text. | test:`src/shared/parity.test.ts` slash cases compared with TUI | pass |
| A09 | P0 | Modes | PLAN/AGENT/YOLO | Shift-Tab and commands produce the CLI mode/approval combinations; pending plan state does not change optimistically. | test: mode reducer; manual: cycle all modes around a pending plan | pass |
| A10 | P0 | Plans | Plan approval | Plan cards support accept, revise, keep planning, accept-and-YOLO, cited sources, assumptions, and ungrounded warnings. | test: plan event reducer; manual: exercise Enter/Esc/Cmd-Y and typed revision | pass |
| A11 | P0 | Permissions | Permission decisions | Once/session/project/deny and deny feedback map exactly to engine decisions; slash commands remain usable while a card is pending. | test: permission parser/routing; manual: y/a/Cmd-P/n/free-text | pass |
| A12 | P0 | Busy state | Engine idle gate | Busy and spinner remain active through follow-up turns and clear only on `engine-idle`; gate failures are prominent and actionable. | test: event-state reducer; manual: trigger follow-up and gate failure | pass |
| A13 | P0 | Abort | Escape behavior | Escape dismisses the topmost overlay, denies pending permission where applicable, or aborts an active turn without corrupting the session. | e2e:`harness.spec.ts` inspector/catalog Escape; review:`App.tsx` priority stack | pass |
| A14 | P0 | Transcript | Event coverage | User, assistant, reasoning, tool, diff, notice, source, task, and subagent events render with stable identity and correct ordering. | test: reducer event matrix; e2e: streaming and activity scenarios | pass |
| A15 | P0 | Transcript | Markdown safety | GFM, code, links, tables, and source cards render legibly; external links are safe and untrusted HTML/scripts do not execute. | test: markdown/source parsing and URL policy; manual: hostile markdown fixture | pass |
| A16 | P0 | Transcript | Tool and diff detail | Tool rows use meaningful labels/icons, expand on demand, auto-expand errors, and display diff additions/deletions clearly. | test: rich-block/tool helpers; manual: successful and failed edit tools | pass |
| A17 | P0 | Transcript | Reasoning and folding | Reasoning is collapsed by default, Cmd-T toggles it, user messages fold individually by click/keyboard without a persistent arrow, Cmd-O folds all, and density matches CLI semantics without rendering redundant density acknowledgement notices. | test: density/folding helpers; manual: toggle during and after a turn | pass |
| A18 | P0 | Transcript | Streaming anchor | Output follows only near the bottom; upward scrolling disengages follow; Jump to latest restores it without losing content. | test:`parity.test.ts` scroll threshold; review:`TranscriptView.tsx` anchor restoration | pass |
| A19 | P0 | Transcript | Long-session resilience | Transcript windowing preserves active work and exposes earlier turns without unbounded DOM growth or losing resumed history. | test:`parity.test.ts` turn/item windows; review:`useSession.ts` progressive reveal | pass |
| A20 | P0 | Catalogs | Command palette | Slash/Cmd-K palette includes live engine command names, enum values, filtering, no-results, keyboard navigation, and correct input cues. | test: command catalog and draft detectors; manual: keyboard-only palette tour | pass |
| A21 | P0 | Catalogs | Models/providers/agents | Main/subagent/agent targets, current markers, inherit clearing, configured/keyless provider flows, and new-agent prefills produce valid CLI commands. | test: catalog option builders; manual: each target/provider path | pass |
| A22 | P0 | Catalogs | Skills and MCP | Skills prefill editable invocations; MCP status reflects connected state, tool count, and error data from host RPC. | test: catalog normalization; manual: live skills and MCP rosters | pass |
| A23 | P0 | Catalogs | Dialog semantics | Catalog dialogs trap focus, support arrows/Enter/Escape, restore focus, report RPC failure, and never submit empty placeholders. | e2e: all live catalogs + Escape; review:`CatalogModal.tsx` native dialog semantics | pass |
| A24 | P0 | Files | At mentions and drop attachments | `@` detects the active query, fuzzy-ranks project files like the CLI, inserts the selection, and handles empty/error results. Finder drag/drop accepts images and files, resolves native Electron paths or `file://`/plain-text fallbacks, previews images, and supports removal. | test: mention/fuzzy parity; e2e: README selection; preview: `attachments`; manual: Finder image/file drop | pass |
| A25 | P0 | Files | Clipboard images | Cmd-V writes a clipboard image through main/preload and inserts a usable `.vibe/clipboard` mention; failures preserve the draft. | e2e: native clipboard image creates and inserts project-relative path | pass |
| A26 | P0 | Editor | External compose | Cmd-G round-trips the draft through `$VISUAL`/`$EDITOR`; empty or nonzero exits preserve the original draft and focus. | test:`editor-compose.test.ts`; e2e: replacement + focus restoration | pass |
| A27 | P0 | Jobs | Jobs activity sidebar | `/jobs` opens the shared edge-attached activity sidebar with accurate status and safe localhost links; Escape, close, or the dock toggle returns to the unchanged transcript, with a scrim only in compact drawer mode. | e2e: empty and active jobs, localhost link, Escape | pass |
| A28 | P0 | Inspector | Context, review, terminal, and checkpoints | The shared activity sidebar exposes context, changed files, Diff/File review with line gutters and Reveal, a main-owned project-cwd PTY terminal with detach/reconnect and bounded replay, checkpoints with undo/redo commands, and DAG/task state without duplicating engine state. Session/Changes, Git, Terminal, and Jobs remain visible in the top switcher and use the same full-height geometry, divider, and persisted resize behavior; selecting one replaces only the sidebar body. | e2e: checkpoint, persistent terminal command, sidebar switching/resizing, DAG, static subagent rows, Escape; preview: `git`/`inspector` | pass |
| A29 | P0 | Status | Session telemetry | Header/composer show model, mode, goal phase/round, git state, changed lines, context pressure, tokens, cost, queue, and working state from snapshots/events. | test: chrome/event reducers; manual: live session status comparison | pass |
| A30 | P0 | Themes | CLI theme semantics | Every CLI theme/accent maps semantic roles, updates from engine events, marks the current value, and drives native control color scheme. | test: theme registry/scheme; manual: light and dark theme sweep | pass |
| A31 | P0 | Keyboard | Reachability | All essential CLI-equivalent actions are keyboard reachable with documented shortcuts and deterministic priority when states overlap. | test: key help/parsers; e2e: dialogs, cards, Escape, editor, composer | pass |
| A32 | P0 | Accessibility | Desktop accessibility | Controls have names, focus indicators, semantic roles, reduced-motion support, AA contrast, and work at 200% zoom without lost actions. | e2e: role-based controls, flat focus state, 200% zoom; review: reduced-motion CSS | pass |
| A33 | P0 | Resilience | Empty/error/narrow states | First run, no sessions, no catalog results, RPC errors, host disconnect, long text, and narrow window states remain understandable and recoverable. | test: bridge/error cases; e2e: empty jobs + 200% zoom; review: empty/error surfaces | pass |
| A34 | P0 | Quality | Source parity guard | Pure modules ported from TUI have drift-detection coverage or shared fixtures so upstream changes cannot silently break parity. | script: source parity audit; test: shared behavioral vectors | pass |
| A35 | P0 | Quality | Verification gates | Lint, unit tests, source/config parity, typecheck, production build, bundle budget, coverage, bridge smoke, Electron E2E, and packaged-host smoke are documented and must pass before release. | script:`npm run verify:ci && npm run pack && npm run smoke:packaged` | pass |
| A36 | P0 | Packaging | Standalone app | Packaged app includes/resolves the engine host without `VIBE_CODR_ROOT`, launches, opens a project, runs a turn, and shuts down cleanly. | script:`npm run pack && npm run smoke:packaged` | pass |
| A37 | P1 | Layout | Desktop composition and resizing | Rail, edge-to-edge transcript pane, composer, approval panels, and the shared activity sidebar preserve the CLI information hierarchy at wide, 140ch, and narrow breakpoints; output and composer share the reading measure, and the activity column is reserved rather than occluding chat. Desktop rails resize by pointer or keyboard, persist their widths, and become drawer-safe on narrow layouts. | review: responsive shell CSS; e2e: 200% zoom reachability; manual: drag and keyboard rail/activity handles | pass |
| A38 | P1 | Typography | Dense readability | Prose, labels, metadata, and controls use a uniform sans system with normal tracking; monospace is reserved for real code (terminal grids, fences, tool/diff/job output, wordmark). Source cards and memory notices have readable hierarchy. | review: locked tokens + Streamdown Shiki code blocks; preview: `settings`/`git` | pass |
| A39 | P1 | Interaction | Motion and feedback | Hover, focus, open/close, streaming, folding, and spinner feedback are restrained, interruptible, and reduced-motion aware. | design lint; e2e: focus/working states; review: reduced-motion CSS | pass |
| A40 | P1 | Polish | Native desktop finish | Chrome tint, continuous full-surface frosted composer + bottom veil, backgroundless white Copy/Edit icons, optically sized macOS app icon, portal menus, dialogs, overlay scrollbars, truncation, source cards, shared activity-sidebar geometry, no decorative section divider lines, and empty/error copy feel intentional while preserving theme semantics. | design lint + renderer code audit | pass |

## Audit log

| Date | Auditor | P0 pass | P1 pass | Notes |
|------|---------|---------|---------|-------|
| 2026-07-10 | Codex | 22/36 | 0/4 | Hermetic Electron E2E now proves streaming, plans, permissions, tools/diffs, hostile markdown containment, queues, catalogs, telemetry, and themes. Task is not done. |
| 2026-07-10 | Codex | 36/36 | 4/4 | Eight Electron harness scenarios, 57 unit checks, 19 source-pair guards, bridge smoke, production pack, and clean-environment packaged smoke pass. |
| 2026-07-11 | Claude | n/a | n/a | Presentation-only design-system pass (A32/A37–A40 surfaces): motion/focus/elevation tokens, mono system voice, context gauge, state coverage. 57/57 unit + typecheck green; `src/shared` untouched so parity gates unchanged; 13 UI states screenshot-compared before/after (dark, light, opencode) via the new `tools/ui-preview` harness. |
| 2026-07-11 | Codex | 36/36 | 4/4 | Adversarial lifecycle/protocol/persistence hardening: 65 unit checks, 10 Electron E2E scenarios, runtime boundary guards, host-generation isolation, Biome/CI/bundle gates, live bridge and packaged smokes. |
| 2026-07-11 | Codex | 36/36 | 4/4 | DAG failed/skipped status rendering (--task-failed/--task-skipped CSS tokens, Inspector StatusDot parity), orchestration rows cleared per-turn, ARIA accessibility pass (combobox pattern, labeled regions, keyboard focus, screen-reader live regions), StrictMode dev hang fix (bootstrapGate.invalidate removed from useEffect cleanup), CSS cleanup (margin:0 for heading elements, :focus-visible on scrollable pre, literal hex removal, duplicate block merge). 66 unit checks, all gates green. |
| 2026-07-11 | Codex | 36/36 | 4/4 | Agent-home + composer polish: centered empty home (wordmark/crumb/pills), ProjectRail density + active dot, segmented Plan\|Agent\|Yolo (`selectModeAction`), Lucide icons + tool-row glyphs, sans UI / mono-for-code, Streamdown Shiki fences + line numbers, seamless queue+composer card. 67 unit checks; docs (README/AGENTS/PARITY/ACCEPTANCE/VERIFICATION) updated. |
| 2026-07-11 | Codex | 36/36 | 4/4 | Sleek modern Codex alternative — opencode-inspired: tokens (--thinking-opacity, --bg-menu, --ctx-track), slimmer rails 20vw/260, glass blur 24px/sat 140%, composer floating 14px + inner highlight + focus ring 32%/10%, ctx gauge pill with border + hot pulse, mode solid assistant/bg, ghost 26px subtle, user neutral, tool side-border indented, catalog grouping favorites/recent/providers + Free badge + clear ×, mention @.hl, diff 2.5px accent. 70 tests. |
| 2026-07-11 | Codex | 36/36 | 4/4 | Second-pass deep polish: text input (auto-resize overflow toggle, inner gradient ::before, placeholder 52%→38% focus, 450 weight, caret-color, status top border 14% + 22% bg, model pill bordered 18%), ctx gauge pill with border + hover 36%→56%, mode segment 11px 600 uppercase, ghost 26px radius 7px scale 1.06 hover, slash/mention menu springy bottom-center origin 10px/0.98 + shadows 0/1px + 4/16 + 16/48, activity rail 94% bg sticky blurred heading, meta-block tighter 10px radius, catalog 14px radius 46vh, project active 2.5px solid + glow 2.2s, transcript 28px/10px gaps, diff 2.5px solid + 82%/88% bg. 70 tests, typecheck + lint + build green. |
| 2026-07-11 | Grok | 36/36 | 4/4 | Exhaustive UI polish (layout→a11y→responsive→design-system): portal menus, busy Stop/Esc, shared primitives/elevation/z-index tokens, light frost, accent→selection mapping, catalog focus trap, named breakpoints, density chip, jobs drawer focus trap. 73 unit tests; PARITY/README/AGENTS/preview shots synced. |
| 2026-07-11 | Codex | 36/36 | 4/4 | UI.md interaction-hygiene + visual-restraint pass (all I01–I61 / S01–S12 / P01–P10 resolved): Esc ownership for mode+session menus (stopPropagation + focus restore), toast severity/dismiss/TTL, copy-failure state, session ⋯ discoverability, in-menu archive/delete confirm + rename blur=cancel, rail Stop control, insert menu (paste/⌘G), model+ctx real buttons, permission autofocus + honest plan Esc + deny-reason + expandable preview + YOLO separation, catalog inline loading/error/retry + kind-specific empty copy + Tab no longer hijacks, inspector drawer focus trap + checkpoint confirm + subagent Back + richer preview states, onboarding localStorage persist, /keys overlay, reduced-motion JS (scroll+sidebar), one busy language (removed shimmer/pulse), glass/depth restraint, radius+shadow+type+icon-size tokens, hit targets, empty-home copy. Intentional non-parity respected (I22/I48/S12). 73 tests, typecheck + lint green, 24/24 preview shots; `src/shared` untouched; PARITY.md updated for changed busy/permission contracts. |
| 2026-07-11 | Grok | 36/36 | 4/4 | Chrome cleanup pass: remove Esc/Working busy chips + rail busy banner + session blue accent bar/dot; unify composer status chips; human permission/plan cards; live auto-follow `/jobs` terminal. Docs (PARITY/README/UI/ACCEPTANCE) synced. |
| 2026-07-11 | Grok | 36/36 | 4/4 | Single Session panel: remove auto LiveSidebar; Inspector is the only session side view; opens on message send / plan accept; topbar toggle + user close. |
| 2026-07-11 | Grok | n/a | n/a | Composer measure: `--composer-max: 40rem`, shared by current transcript and approval output; taller resting input `--composer-input-min: 44px`. |
| 2026-07-11 | Codex | n/a | n/a | Current UI consolidation: shared 40rem output/approval/composer measure, explicit-toggle Session panel, portal-mounted project menus, click-to-fold user messages, structured source cards, neutral memory notices, and updated E2E expectations. Unit/lint/typecheck/build pass; local sibling source parity and the 1.85 MB single-chunk budget need follow-up. |
| 2026-07-11 | Grok | 36/36 | 4/4 | Presentation polish: VC app icon, Cursor-like queue card, composer frost/veil, fixed ⋯ menu anchor/toggle, overlay scrollbars, hover copy gutters, Streamdown hierarchy + table/source polish. 74 tests; lint/typecheck green; docs fully synced. |
| 2026-07-12 | Codex | 36/36 | 4/4 | Final UI and host hardening: optically padded macOS icon, edge-to-edge chat pane, continuous composer blur, clean white Copy/Edit icons, static subagent spinner/check rows, stale compiled-host fallback, and approved background-dev-server flow. 74 unit tests, 10 E2E scenarios, lint, typecheck, build, bridge smoke, and diff checks pass; sibling source parity and bundle budget remain attention gates. |
| 2026-07-12 | Codex | n/a | n/a | Renderer interaction polish: compact grouped Thinking disclosure with uniform tool/thought rows, quiet expandable memory notes, busy-only active-session spinner, normalized Workspace sans typography, and tightened project-rail affordances. 76 unit tests, typecheck, lint, diff checks, browser interaction checks, and the full UI preview matrix pass. |
| 2026-07-12 | Codex | 36/36 | 4/4 | Complete attachment/review/resize and documentation pass: Finder image/file drops resolve native paths with URI/plain-text fallback, duplicate and inaccessible states are distinct, changed files support Diff/File review and Reveal, desktop rails resize by pointer or keyboard with persistence, and message actions are positioned beside user bubbles with hover timestamps. 98 unit tests, 10 E2E scenarios, lint, typecheck, build, bundle budget, source parity, bridge smoke, and docs checks pass. |

| 2026-07-12 | Codex | 36/36 | 4/4 | Production hardening: atomic config writes (temp+rename), per-path write serialization, deep-diff settings save (clear-values fix), NumberInput NaN guard, pre-write config validation (URLs/enums/numerics), first-run onboarding wizard (33-provider catalog ported from CLI), React ErrorBoundary, dev-mode CSP relaxation, application menu (macOS roles + app actions), theme list fix (was completely wrong — midnight/solarized/github don't exist), git commit --amend arg construction bug fix, menu IPC listener leak fix, settings parity gaps closed (structuredMaxAttempts, maxArtifactBytes, build.recon, gate.checks, plan gate, pricing, contextWindow, matchExact), accent preset swatches, curated provider dropdown, dead code removed. 140 unit tests, 10 E2E, 31/31 UI preview scenarios, all gates green. |
| 2026-07-12 | Grok | 36/36 | 4/4 | Shell product pass: Projects+Chats collapsible rail (+ only), seamless workspace dock (Session/Changes/Git/Jobs/Files), turn-changes card + Diff/File review, thinking/transcript spacing, user actions under bubble, Instructions dirty keep-mount, fatal New session recovery, git commit msg clear-on-success. 171 unit tests, 10/10 E2E, verify + smoke:bridge green; docs fully synced. |
| 2026-07-12 | Codex | 36/36 | 4/4 | Unified end-panel pass: Session, Changes, Git, and Jobs now share one right-side lane with reserved chat space, stable open/close geometry, and no full-workspace Git jump. Documentation and the canonical design system were reconciled with the live tokens and panel behavior. 174 unit tests, lint, source parity, typecheck, build, bundle budget, and diff checks pass. |

## Sign-off

- [x] All P0 rows are `pass`
- [x] No P0 row is `visual-only`
- [x] Verification commands were run (list below)

| 2026-07-13 | Grok | 36/36 | 4/4 | Shell hardening + design direction: host lifecycle (dispose/reap/single-instance), session Trail/handoff/busy optimism, git ref safety + force-with-lease, host-resolver tests, long-session stream/markdown bounds, quiet dock contract (Session/Changes/Git/Jobs/Files only). 226 unit tests, typecheck green. |
| 2026-07-13 | Grok | 36/36 | 4/4 | Residual audit implementation: disposeForQuit bootstrap preemption, busy-on-send-failure policy, realpath+capped reads, cwd allowlist, stream/gh capture caps, stdin write queue with epoch, plain streaming markdown, block retention, CI coverage+bridge smoke, preload VibeApi key contract, dock exclusivity e2e. 259 unit + 11 e2e; typecheck green. |
| 2026-07-13 | Codex | 36/36 | 4/4 | Design-polish completion: structural five-view activity sidebar, persistent main-owned project PTY with bounded replay, compact terminal typography, responsive invariant ASCII wordmark, quieter notices/queue state, transcript/diff/plan spacing, and project-rail interaction cleanup. 269 unit + 12 e2e scenarios at the release baseline. |
| 2026-07-13 | Codex | 36/36 | 4/4 | Public-release hardening: engine commit lock, SHA-pinned CI/release actions, deterministic Electron 43 binary prefetch, signed/notarized tag workflow, bounded LRU/file/config state, timer cleanup, project-path allowlist, authoritative config validation including MCP/OAuth and queue timeout, plus permanent 40-field config-shape parity. 289 unit + 12 e2e scenarios; locked-engine packaged smoke green. |

**Current verification snapshot (2026-07-13):**

```text
npm test                         # 289/289 pass
npm run test:coverage            # floors on shared + bridge modules
npm run lint                     # clean
npm run typecheck                # pass
npm run test:e2e                 # 12 scenarios (incl. persistent terminal + dock exclusivity)
npm run verify:source-parity     # pass (19 source pairs)
npm run verify:config-shape      # pass (40 top-level fields)
npm run verify:bundle            # pass
npm run verify                   # pass
npm run smoke:bridge             # pass; ready, snapshot, and project-list checks
npm run verify:ci                # verify + coverage + bridge smoke + e2e
```
