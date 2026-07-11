# CLI ↔ Electron parity checklist

Manual smoke against OpenTUI / `vibecodr` in the **same project cwd**. Automated: `npm test` (50+) plus `npm run verify:source-parity`.

Engine ownership stays in `@vibe/core`; this app is a presentation shell over NDJSON (`macos-bridge` protocol). Public repo: [vbcode-electron](https://github.com/robzilla1738/vbcode-electron).

## Automated (unit)

- [x] Transcript reducer: user/assistant/tool/diff/thinking/notice
- [x] History hydrate from snapshot messages
- [x] Slash routing mirrors TUI `lineToCommands`
- [x] Permission answers + slash passthrough while pending
- [x] UiMode cycle + plan-pending does not flip optimistically
- [x] NDJSON codec (bootstrap encode / ready+fatal decode)
- [x] Theme registry covers all `THEME_NAMES`
- [x] Density overlay quiet/normal/verbose
- [x] chrome-seed merge (session-start + snapshot)
- [x] file-fuzzy ranking + `@` mention detect
- [x] keys-help essential chords
- [x] Palette merges custom `commandNames`
- [x] Project filtering, duplicate-name labels, and relative session time
- [x] Web-search/source parsing, task windowing, and native light/dark scheme
- [x] Catalog draft detectors + MCP normalize + provider/agent option builders
- [x] Theme palette parity: DEFAULT = Graphite (white chrome + violet), OPENCODE = #eeeeee
- [x] Rich-block richKind routing (chart/line/pie/weather/sources)

## Core session loop

- [x] Open project → engine bootstrap → wait for `ready` → snapshot
- [x] Last-cwd restore on launch
- [x] Resume hydrates transcript from `snapshot.history`
- [x] Submit prompt → streaming assistant text + tool rows
- [x] `busy` held until `engine-idle` (not per-turn idle)
- [x] Reasoning → collapsed ✻ thought rows; ⌘T toggles
- [x] Mode cycle PLAN / AGENT / YOLO (⇧Tab); plan-pending gate
- [x] Leaving plan mode dismisses plan card (mode-changed → plan: null)
- [x] user-message resets subagents list (per-turn clean slate)
- [x] Permission card: once / session / project / deny + y/a/n / ⌘P keys
- [x] Plan card: Enter accept / type revise / Esc keep / ⌘Y accept+YOLO
- [x] Queue steer + dequeue while busy
- [x] `/clear` & `/new` abort + full local reset + suppress stale stream (full clearScopedEventTypes parity)
- [x] `/jobs` toggles jobs sub-view; Esc dismisses
- [x] Esc aborts in-flight turn
- [x] Graceful quit finalizes session (`finalize` RPC + shutdown)
- [x] Working spinner until engine-idle
- [x] `engine-idle.gate` red banner

## Transcript fidelity

- [x] Assistant markdown (Streamdown + GFM; live while streaming)
- [x] Diff blocks green/red hunk coloring
- [x] Tool icons + condensed labels; expand on click; auto-expand on error
- [x] Turn fold (tap user / ⌘O fold-all); density quiet/normal/verbose (⌘D)
- [x] Windowed transcript (“N earlier turns”) with progressive reveal (20 at a time)
- [x] Per-turn item windowing for long tool runs (cap 120, step 24, reveal page)
- [x] Streaming follows only while anchored; upward scroll reveals Jump to latest
- [x] Notices as level-styled banners
- [x] Web-search results + `sources` fences as safe external source cards
- [x] Rich data views: bar/line/sparkline/pie/weather fenced blocks render as visual components (RichBlockView)
- [x] Active-task windowing; completed task panels retire with the CLI
- [x] Subagent stream capture + inspector drill-in
- [x] Narrow-mode tasks / subagents / thinking panels

## Catalogs & chrome

- [x] Slash palette (`/` / ⌘K) with enum submenus + custom commands
- [x] Exact-command input cue via `commandNames`
- [x] Model picker with main ⇄ subagent target toggle + agent target (`/model agent …`)
- [x] `subagentModel` tracked from snapshot; Clear → inherit for sub/agent
- [x] Providers: configured → prefill `/model id/`; keyless path → `/model key id `
- [x] Agents: prefill `/model agent name `; New agent prefills `/agents new ` (no empty submit)
- [x] Skills: prefill `/skill name ` (args editable)
- [x] MCP roster matches host `listMcp` shape (connected · toolCount · error)
- [x] Live draft catalogs: typing `/model …`, `/providers`, `/agents`, `/skills`, `/mcp` opens/filters pickers
- [x] Native catalog dialog: focus trap (Enter-opened), arrows, Enter, Esc, focus return
- [x] Catalog filtering, no-results state, current-model marker, and RPC failure feedback
- [x] Multi-project sessions rail with titles + new/resume/continue/filter
- [x] `/jobs` view + localhost links
- [x] `@` fuzzy file attach (TUI `file-fuzzy` ranking)
- [x] Clipboard image → `@.vibe/clipboard/….png` (⌘V)
- [x] External-editor compose (⌘G; empty/non-zero keeps draft)
- [x] Theme / accent via engine events → CSS variables; value menu marks current
- [x] Theme palette also drives native control/dialog color scheme
- [x] Goal header ★ + phase/round; git dirty count / ahead / behind
- [x] Composer status: model · changed +/− · ctx% (hot ≥80%) · tokens · cost · queue · working
- [x] Inspector (⇧⌘I): context, changed files, checkpoints undo/redo, DAG list, subagent stream
- [x] `/keys` local help surface
- [x] Onboarding points at shared `~/.config/vibe-codr/config.json`
- [x] Plugins / custom commands via `snapshot.commandNames` (no install UI — same as TUI)
- [x] Orchestration task list from `orchestration-task` events (no interactive DAG graph)

## Packaging & bridge

- [x] Host resolution: compiled dist → Bun source → bundled resources
- [x] `npm run copy-host` / `npm run pack` copies host
- [x] Ready timeout 45s, RPC timeout 20s
- [x] Read-only `listProjects` host index keeps session storage out of Electron
- [x] Bridge smoke: `npm run smoke:bridge`
- [x] Packaged renderer runs sandboxed with a CommonJS preload bridge
- [x] Packaged app prefers its release-matched bundled host over developer checkouts
- [x] Custom app icon; restrictive ATS; no unused hardware permission descriptions
- [ ] Full interactive GUI smoke of every slash against live paid models (manual)
- [ ] Release app without `VIBE_CODR_ROOT` end-user smoke (manual)

## Intentional non-parity

- OpenTUI cell-grid / mouse capture / `/mouse` (listed in palette as no-op)
- Pixel-perfect terminal glyph metrics
- Engine reimplementation in Electron
- Plugin install/enable UI (CLI has none — config + `commandNames` only)
- In-app MCP server editor / reconnect RPC (config-file at boot, same as TUI)
- Job-kill UI (none in TUI)
- Interactive orchestration DAG graph (list only; TUI ignores the event)
- Full-window Liquid Glass replacing CLI theme surfaces (glass tints chrome only; palettes still drive semantic roles)
- Permission/Plan button labels use human verbs with `<kbd>` hints (TUI key chords still work)
- Electron reading measure uses `--reading-max: 56rem` / assistant `72ch` (AGENTS ~130ch is TUI column guidance)
- TUI select-to-copy auto-clipboard toast (Electron uses native selection + Cmd/Ctrl+C)
- TUI `/mouse` capture (palette lists it; Electron UI ignores `mouse-changed`)
- Width-fitted footer key-hint bands (Electron uses composer metrics + `/keys` help)

## How to verify

```bash
cd ~/Code/vibe-codr && bun run build:macos-bridge
cd ~/Code/vbcode-electron
npm install && npm test && npm run typecheck && npm run build
npm run lint && npm run verify:bundle
npm run smoke:bridge
npm run dev
```

## Additional parity items (session 2)

- [x] Rich data views (bar/line/sparkline/pie/weather) render in assistant markdown via RichBlockView
- [x] Permission grant notices include toolLabel (TUI parity)
- [x] Usage label matches TUI formatUsage: `12.3k tok · $0.0421 · 1.1k cached`
- [x] Thinking trail persists across bursts + survives past turn end (Trail class wired in)
- [x] Per-event try/catch surfaces handler errors as transcript notices
- [x] Mode-changed dismisses plan card when leaving plan mode
- [x] user-message resets subagents + thoughtLog (per-turn clean slate)
- [x] subagent-activity only touches running subagents
- [x] plan-presented finalizes assistant text before showing card
- [x] flushDeltas before tool-finish and file-changed (TUI enqueue→landPending parity)
- [x] Source parity check covers themes, glyphs, wordmark (19 pairs)
- [x] Session chrome state tests: mode/plan dismissal, user-message reset, subagent-activity guard

## Additional parity items (session 3)

- [x] Theme palette DEFAULT synced: violet selBg/selFg, heading, series ramp (source parity fix)
- [x] CSS :root fallbacks match synced default palette (no first-paint flash)
- [x] Selection colors: slash menu + catalog rows use --sel-bg/--sel-fg (violet band, TUI parity)
- [x] Markdown headings use --heading (violet in default theme, TUI palette.heading)
- [x] Table headers use --heading (TUI parity)
- [x] User message left accent border using --user color (TUI ❯ marker parity)
- [x] Splash wordmark brand gradient sweep (TUI brandSpans parity via CSS background-clip)
- [x] Working spinner shows elapsed time via workingLabel (TUI parity)
- [x] Working spinner shows "esc to interrupt" hint (TUI parity)
- [x] Goal suffix: plan phase reads "planning" (not "plan"), no round/max until execute (TUI parity)
- [x] CycleMode shows notice when plan-pending prevents mode switch (TUI parity)
- [x] Stream flush interval matches TUI (24ms, was 32ms)
- [x] Tool progress chunks coalesced on flush timer (TUI landPending parity)
- [x] Model picker shows context window size via fmtContext (TUI parity)
- [x] Splash starters match TUI: explain / fix failing test / add --json flag
- [x] Ungrounded plan warning matches TUI wording: "⚠ ungrounded — presented without the research…"
- [x] Jobs view shows PID when running (TUI parity)
- [x] Inline panel titles show counts: "Tasks · N/M", "Subagents · N/M done" (TUI parity)
- [x] Inline subagent rows show activity, result glimpse, elapsed time (TUI parity)
- [x] Permission card shows toolLabel + TUI header wording "Permission required · 1/N"
- [x] Slash menu + catalog headers use --heading color (TUI palette.heading)
- [x] --focus CSS variable wired into --focus-ring (dead variable cleanup)
- [x] Clipboard temp dir cleanup on quit (TUI cleanupClipboardTempDir parity)
- [x] Z-index on .panels + .composer-stack prevents transcript pointer interception
- [x] E2e test assertions fixed: focus ring, ctx gauge, inspector label, thinking label
- [x] editor-compose.ts synced with full TUI JSDoc comments

## Hardening audit (session 4)

- [x] Host generations isolate stale ready/event/RPC output during rapid restart
- [x] Async child stdin/stdout/stderr failures become one actionable fatal state
- [x] NDJSON inbound/outbound messages, UI events, RPC results, and IPC inputs are runtime validated
- [x] Overlapping renderer bootstraps and project refreshes are latest-request-wins
- [x] Stale session events cannot mutate the active renderer session
- [x] Session mutation ids reject traversal/path components; missing delete/archive return failure
- [x] Host-level mutation and malformed/pre-bootstrap RPC coverage
- [x] Pure chrome/session state machine extracted from transport lifecycle
- [x] Biome lint, renderer bundle budget, Linux CI, and macOS packaged smoke gates
- [x] E2E session rename/archive/delete, fatal-host recovery, narrow layout, and reduced motion

## DAG status, accessibility, and StrictMode fix (session 5)

- [x] DAG sidebar/inspector render failed and skipped statuses with distinct colors (--task-failed/--task-skipped CSS tokens derived from --del/--muted)
- [x] StatusDot in both Sidebar and Inspector supports failed/skipped (was mapping to "pending" in Inspector — visual bug)
- [x] DAG rows show ellipsis truncation + title tooltips for long objectives
- [x] Orchestration rows cleared on user-message (per-turn clean slate, matching subagents reset)
- [x] Test added for orchestration reset on user-message (66 total unit tests)
- [x] ARIA combobox pattern in Composer (aria-autocomplete, aria-expanded, aria-controls, aria-activedescendant)
- [x] ARIA combobox pattern in CatalogModal (aria-controls, aria-autocomplete, aria-activedescendant, target toggle label)
- [x] Transcript aria-controls on expand/collapse buttons + aria-label on log and jump button
- [x] WelcomeGate: aria-busy, aria-labelledby, aria-live, focus primary action button
- [x] LivePanels (permission/plan cards): role=region, aria-labelledby, aria-keyshortcuts, focus default action
- [x] JobsView: role=region, article elements, aria-label on status/output, keyboard-focusable output pre
- [x] Inspector: h2 heading, aria-labels on file rows and subagent buttons, keyboard-scrollable subagent stream
- [x] ProjectRail: h2 heading, aria-controls, role=group, first menu item focus on open
- [x] Splash: section with aria-labelledby, aria-label on starter prompts
- [x] WorkingSpinner: aria-live, aria-busy, aria-label with escape hint, visual elements aria-hidden
- [x] OnboardingHint: aside with role=region, h2 heading, focus primary action
- [x] SourceList + MarkdownView: role=status on empty state, aria-label on list, title on external links
- [x] App toast: aria-live and aria-atomic
- [x] Sidebar thinking trail: keyboard-scrollable live region (role=log, tabIndex, aria-live)
- [x] CSS: margin:0 added to .rail-section-label, .onboarding-title, .topbar-title for h2/h1 elements
- [x] CSS: :focus-visible on .job-output for keyboard focus ring
- [x] CSS: literal hex #1b2430 replaced with #000 (design system rule: no literal hex outside :root)
- [x] CSS: duplicate .rail-section-label and .topbar-title blocks merged
- [x] StrictMode dev hang fixed: bootstrapGate.invalidate() removed from useEffect cleanup (redundant with begin() in bootstrap; was causing bootstrap to always return false in dev due to StrictMode double-invocation)
- [x] Composer aria-expanded fixed: false when slash menu open but has 0 items (was always true when palette.open)
- [x] Preview harness: orchestration-task events (running/completed/failed/skipped) added to busy scenario
