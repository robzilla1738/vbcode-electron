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
- [x] Theme palette parity: DEFAULT = Graphite (white chrome + white selection), OPENCODE = #eeeeee
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
- [x] `/jobs` opens a jobs drawer overlay (chat stays); Esc / Close dismisses
- [x] Esc aborts in-flight turn
- [x] Graceful quit finalizes session (`finalize` RPC + shutdown)
- [x] Busy cue until engine-idle (composer Stop + Esc chip; no separate working strip)
- [x] `engine-idle.gate` red banner

## Transcript fidelity

- [x] Assistant markdown (Streamdown + GFM; live while streaming)
- [x] Diff blocks green/red hunk coloring
- [x] Tool icons + condensed labels; expand on click; auto-expand on error
- [x] Turn fold (chevron beside user bubble / ⌘O fold-all); density quiet/normal/verbose (⌘D)
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
- [x] Native catalog dialog: focus trap (Tab cycle + focusin guard; draft-linked allows composer), arrows, Enter, Esc, focus return, aria-modal
- [x] Catalog filtering, no-results state, current-model marker, and RPC failure feedback
- [x] Multi-project sessions rail with titles + new/resume/continue/filter
- [x] `/jobs` drawer + localhost links; focus trap + Close/Esc (single dialog landmark)
- [x] `@` fuzzy file attach (TUI `file-fuzzy` ranking)
- [x] Clipboard image → `@.vibe/clipboard/….png` (⌘V)
- [x] External-editor compose (⌘G; empty/non-zero keeps draft)
- [x] Theme / accent via engine events → CSS variables; value menu marks current
- [x] Theme palette also drives native control/dialog color scheme
- [x] Goal header ★ + phase/round; git dirty count / ahead / behind
- [x] Composer status: model · changed +/− · ctx% (hot ≥80%) · tokens · cost · queue · working
- [x] Inspector (⇧⌘I): dynamic title (session / subagent / file), shared activity sections, in-panel file preview + Reveal, checkpoints undo/redo, subagent stream
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

- [x] Theme palette DEFAULT synced: white selBg/selFg + heading (Graphite chrome); series ramp (source parity)
- [x] CSS :root fallbacks match synced default palette (no first-paint flash)
- [x] Selection colors: slash menu + catalog rows use --sel-bg/--sel-fg (white band on Graphite; `/accent` remaps)
- [x] Markdown headings use --heading (white on Graphite; follows `/accent` when set)
- [x] Table headers use --heading (TUI parity)
- [x] User message left accent border using --user color (TUI ❯ marker parity)
- [x] Splash wordmark brand gradient sweep (TUI brandSpans parity via CSS background-clip)
- [x] Busy cue shows elapsed time via workingLabel (TUI parity)
- [x] Busy cue shows "Esc" interrupt chip (TUI parity)
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
- [x] LivePanels (permission/plan cards): role=region, aria-labelledby, aria-keyshortcuts; no autofocus (composer keeps focus for revise/steer)
- [x] JobsView: role=region, article elements, aria-label on status/output, keyboard-focusable output pre
- [x] Inspector: h2 heading, aria-labels on file rows and subagent buttons, keyboard-scrollable subagent stream
- [x] ProjectRail: h2 heading, aria-controls, role=group, first menu item focus on open
- [x] Splash: section with aria-labelledby, aria-label on starter prompts
- [x] Busy cue: composer Stop + Esc chip with elapsed; sr-only busy/idle live status (WorkingSpinner removed)
- [x] OnboardingHint: aside with role=region, h2 heading; no autofocus (composer / perm / plan own focus)
- [x] SourceList + MarkdownView: role=status on empty state, aria-label on list, title on external links
- [x] App toast: aria-live and aria-atomic
- [x] Sidebar thinking trail: keyboard-scrollable live region (role=log, tabIndex, aria-live)
- [x] Transcript is not a live region (role=region); busy/idle announced via narrow sr-only status
- [x] Copy controls always visible at muted rest (not hover-gated opacity)
- [x] Busy-disabled rail actions/session rows expose the stop-turn reason via aria-label
- [x] Skip links: conversation, composer, projects (when open), session panel (when open)
- [x] Named breakpoints (`BREAKPOINTS` in shared + CSS comments): wide 1280 / laptop 1100 / tablet 900 / compact 720 / narrow 640
- [x] Shared `drawer-scrim` + `--drawer-start-w` / `--drawer-end-w` / `--shadow-drawer(-end)` for rail & inspector overlays
- [x] Narrow widths keep truncated model chip (12ch) instead of hiding it
- [x] Coarse-pointer: composer status reflows; chips stay compact; submit stays 44px
- [x] Shared `primitives.tsx` (`ExternalLink`, re-exports MetaRow/StatusDot/chrome formatters); context-line + splash + topbar use `projectLabel` / shared git·goal
- [x] Elevation tokens `--elev-rest|overlay|modal|strip`; shadows/z-index tokenized (`--z-*`, `--shadow-ink` / `--edge-lit`)
- [x] Composer: stable metrics slot (trailing); density chip (quiet/normal/verbose, click = ⌘D)
- [x] Inspector checkpoints / file preview use `.button` (not legacy `.chip`)
- [x] `ui:shots` adds toast, density-quiet/verbose, ctx-hot (busy-narrow covers compact activity strips)
- [x] CSS: margin:0 added to .rail-section-label, .onboarding-title, .topbar-title for h2/h1 elements
- [x] CSS: :focus-visible on .job-output for keyboard focus ring
- [x] CSS: literal hex #1b2430 replaced with #000 (design system rule: no literal hex outside :root)
- [x] CSS: duplicate .rail-section-label and .topbar-title blocks merged
- [x] StrictMode dev hang fixed: bootstrapGate.invalidate() removed from useEffect cleanup (redundant with begin() in bootstrap; was causing bootstrap to always return false in dev due to StrictMode double-invocation)
- [x] Composer aria-expanded fixed: false when slash menu open but has 0 items (was always true when palette.open)
- [x] Preview harness: orchestration-task events (running/completed/failed/skipped) added to busy scenario

## Agent-home polish + typography (session 6)

- [x] Empty-home: brand-first (wordmark/type), quiet tagline, text starters (not cards); container-query compact brand; WelcomeGate + SessionBoot shared boot copy; recent projects on cold start
- [x] ProjectRail: active session `--user` inset bar + dot (no blue glow); always-on search; measured context menus; busy switch banner; archive confirm; topbar brand when rail closed
- [x] Composer: no status divider; queue tray + composer share one continuous card (no seam)
- [x] Mode dropdown Plan / Agent / Yolo (`selectModeAction`); Shift+Tab still cycles; plan-pending guard unchanged
- [x] Lucide stroke icons for chrome + composer; tool-row glyphs via renderer `tool-glyph.tsx` (shared unicode `toolIcon` labels unchanged)
- [x] Sans UI chrome; mono reserved for real code (fences, tool/diff/job bodies, wordmark, rich charts)
- [x] Streamdown markdown fences use Shiki `CodeBlock` + line numbers; theme follows app palette via `shikiThemeFor` (not hardcoded github)
- [x] One copy control (`CopyButton`) for fences, tool output, answers, thinking, plans; Streamdown table copy enabled
- [x] Plan approval body renders as markdown; rich ASCII charts measure host width via ResizeObserver
- [x] `selectModeAction` unit coverage + Shiki theme registry coverage

## Sleek modern Codex alternative — opencode-inspired polish (session 7)

- [x] Token system: `--thinking-opacity`, `--bg-menu`, `--ctx-track`, `--composer-input-min`, rail widths 20vw/260 & 26vw/340, icon 16px, light shadows lifted, glass blur 24px/sat 140%
- [x] Composer: floating surface 14px radius with inner highlight `::before`, focus ring 32%/10%, status top border + surface bg, mode dropdown solid assistant/bg, ghost actions 26px subtle, context gauge pill with border + hot pulse, user bubble tokenized (`--bubble-user-*`)
- [x] Transcript: tool head 100% width no overflow hack, tool body side-border indented (Cursor-feel), thinking opacity token, code block 10px radius with bottom border header, diff 2.5px accent
- [x] Menus: slash/mention quiet surface-enter, header 10px bold uppercase, denser items 38px radius 8px, highlight `.hl`, catalog grouping (favorites via localStorage + recent 8 + provider buckets opencode-first, Free badge, clear ×)
- [x] Rails: active session left accent bar solid user (no glow); project row radius 7px, topbar 14px semibold, activity rail border 22% + blur 12px sticky header, meta-block tighter
- [x] Secondary: cards compact 12px, engine dot pulse, busy Stop + Esc cue, jobs drawer, earlier/jump pills refined, toast compact, toast + catalog origins bottom-center
- [x] Model pill bordered 18% + hover 68%, transcript gap 28px/10px, code 12.5px
- [x] Light scheme: restored edge-highlight + soft frost elevation; hairlines via `--border-soft` (not hard card borders)
- [x] `/accent` remaps `--sel-bg` / `--sel-fg` / `--heading` / focus ring with contrast-aware foreground

## Second-pass deep polish (session 8)

- [x] Text input: auto-resize overflow toggle (hidden until 200px then auto), floating surface `::before` inner gradient, placeholder 52% muted focus 38%, exact-cmd 500 weight, caret-color, status top border 14% + surface 22%, model pill bordered 18% + tabular-nums
- [x] Context gauge: pill with border, bg 36% → 56% hover, dial 14px + box-shadow 1px border, warn/notice/hot with bg tint
- [x] Mode dropdown: trigger + options menu (`selectModeAction`), label 11px 600 uppercase, ghost 26px radius 7px
- [x] Slash/mention menu: quiet surface-enter, shadow 0 0 0 1px + 4/16 + 16/48, header 10px 700, body 6px padding, footer bg surface 18%
- [x] Catalog popover: 46vh/440px max, 14px radius, origin bottom center, header/Footer borders 18%, section 10px 700, tag pill free variant, empty hint, clear button
- [x] Project rail: active bar 2.5px solid `--user` + session dot, row radius 7px, session row 72% assistant text
- [x] Side popups: activity rail 94% bg, heading 14px sticky blur 12px, meta-block 2px padding 10px radius + 1px 6% highlight, meta-label 10px 700 0.06em upper, sidebar-heading 14px padding
- [x] Transcript: user bubble max 92%/48rem, 14px radius + 1px 10% highlight, assistant prose optimizeLegibility, tool body margin 20px + 10px padding 36% bg, thinking 24% bg, source cards 10px radius softer, diff 2.5px solid + 82%/88% bg + 72% ctx, earlier/jump refined, composer-stack 14px radius 36% border + 1px 12% highlight
- [x] Composer stack single surface when queue present: 14px radius 36% border, queue tray 22% divider, busy Stop control (no separate working strip)
- [x] Source parity, typecheck, lint, tests green (73 tests)
