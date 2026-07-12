# CLI ↔ Electron parity checklist

Manual smoke against OpenTUI / `vibecodr` in the **same project cwd**. Automated: `npm test` (currently 98 tests), `npm run test:e2e` (10 scenarios), plus `npm run verify:source-parity`.

Engine ownership stays in `@vibe/core`; this app is a presentation shell over NDJSON (`macos-bridge` protocol). Public repo: [vbcode-electron](https://github.com/robzilla1738/vbcode-electron).

The parity script compares declaration ASTs with the sibling checkout selected
by `VIBE_CODR_ROOT` or `~/Code/vibe-codr`. Run it against the synchronized
engine revision. A local sibling checkout can legitimately be ahead or carry
provider/protocol changes; that state is a release attention item, not a reason
to weaken the parity guard.

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
- [x] Reasoning → compact grouped Thinking disclosure with collapsed thought rows; ⌘T toggles
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
- [x] Busy cue until engine-idle (composer Stop + elapsed; Esc via keyboard / Stop title)
- [x] `engine-idle.gate` red banner

## Transcript fidelity

- [x] Assistant markdown (Streamdown + GFM; live while streaming)
- [x] Diff blocks green/red hunk coloring
- [x] Tool icons + condensed labels; expand on click; auto-expand on error
- [x] Consecutive tool/thinking activity groups under `Thinking · N steps`; individual rows retain click-to-expand bodies
- [x] Turn fold (click or keyboard-activate the user bubble / ⌘O fold-all; no persistent arrow); density quiet/normal/verbose (⌘D)
- [x] Windowed transcript (“N earlier turns”) with progressive reveal (20 at a time)
- [x] Per-turn item windowing for long tool runs (cap 120, step 24, reveal page)
- [x] Streaming follows only while anchored; upward scroll reveals Jump to latest
- [x] Notices as level-styled banners
- [x] Web-search results + `sources` fences as safe external source cards
- [x] Rich data views: bar/line/sparkline/pie/weather fenced blocks render as visual components (RichBlockView)
- [x] Active-task windowing; completed task panels retire with the CLI
- [x] Subagent activity rows show status/result/elapsed state without an expandable detail transcript
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
- [x] Project/session rename, archive, and delete menus with in-app confirmation; project menus escape rail clipping
- [x] `/jobs` drawer: live auto-follow terminal (full outputTail, stick-to-bottom, jump-to-latest); Close without Esc chip; quiet status/link chips
- [x] `@` fuzzy file attach (TUI `file-fuzzy` ranking)
- [x] Finder drag/drop for images and files: removable chips, mixed batches,
  duplicate normalization, native Electron path resolution, and `file://` /
  plain-text path fallbacks
- [x] Clipboard image → `@.vibe/clipboard/….png` (⌘V)
- [x] External-editor compose (⌘G; empty/non-zero keeps draft)
- [x] Theme / accent via engine events → CSS variables; value menu marks current
- [x] Theme palette also drives native control/dialog color scheme
- [x] Goal header ★ + phase/round; git dirty count / ahead / behind
- [x] Composer status: model · changed +/− · ctx% (hot ≥80%) · tokens · cost · queue · working
- [x] Inspector (⇧⌘I): dynamic session/file title, shared activity sections,
  changed-file Diff/File review with line gutters, in-panel file preview +
  Reveal, checkpoints undo/redo; subagent rows remain static and non-expandable
- [x] Project and Session rails: pointer and Arrow/Home/End keyboard resizing,
  persisted widths, and hidden handles in narrow drawer layouts
- [x] `/keys` local help surface
- [x] Onboarding points at shared `~/.config/vibe-codr/config.json`
- [x] Plugins / custom commands via `snapshot.commandNames` (no install UI — same as TUI)
- [x] Orchestration task list from `orchestration-task` events (no interactive DAG graph)

## Packaging & bridge

- [x] Host resolution: fresh compiled dist → Bun source fallback when runtime sources are newer → bundled resources
- [x] `npm run copy-host` / `npm run pack` copies host
- [x] Ready timeout 45s, RPC timeout 20s
- [x] Read-only `listProjects` host index keeps session storage out of Electron
- [x] Bridge smoke: `npm run smoke:bridge`
- [x] Packaged renderer runs sandboxed with a CommonJS preload bridge
- [x] Packaged app prefers its release-matched bundled host over developer checkouts
- [x] Custom macOS app icon with optical safe-area padding; restrictive ATS; no unused hardware permission descriptions
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
- Subagent detail drill-in (Electron intentionally renders compact static status rows with spinner/check completion state)
- Full-window Liquid Glass replacing CLI theme surfaces (glass tints chrome only; palettes still drive semantic roles)
- Permission/Plan button labels use human verbs with `<kbd>` hints (TUI key chords still work)
- Electron transcript output, approval panels, and composer share `--composer-max: 40rem`; composer uses a taller resting input (`--composer-input-min: 44px`)
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
npm run test:e2e
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
- [x] Busy cue: Stop button is the primary interrupt (elapsed + Esc hint via title; no separate Esc chip)
- [x] Goal suffix: plan phase reads "planning" (not "plan"), no round/max until execute (TUI parity)
- [x] CycleMode shows notice when plan-pending prevents mode switch (TUI parity)
- [x] Stream flush interval matches TUI (24ms, was 32ms)
- [x] Tool progress chunks coalesced on flush timer (TUI landPending parity)
- [x] Model picker shows context window size via fmtContext (TUI parity)
- [x] Empty home keeps a quiet wordmark and composer without automatic prompt suggestions
- [x] Ungrounded plan warning matches TUI wording: "⚠ ungrounded — presented without the research…"
- [x] Jobs view shows PID when running (TUI parity)
- [x] Inline panel titles show counts: "Tasks · N/M", "Subagents · N/M done" (TUI parity)
- [x] Inline subagent rows show activity, result glimpse, elapsed time (TUI parity)
- [x] Permission card: human kind title (not raw tool id); soft neutral chrome; Deny reveals reason; technical JSON collapsed
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
- [x] LivePanels (permission/plan cards): role=region, aria-labelledby, aria-keyshortcuts; permission card autofocuses primary action, plan keeps composer focus for revise/steer
- [x] JobsView: role=region, article elements, aria-label on status/output, keyboard-focusable output pre
- [x] Inspector: h2 heading, aria-labels on file rows and static subagent status rows; no expandable subagent stream
- [x] ProjectRail: h2 heading, aria-controls, role=group, first menu item focus on open
- [x] Splash: section with aria-labelledby and quiet empty-state copy; no suggestion controls
- [x] Busy cue: composer Stop + elapsed; sr-only busy/idle live status; Esc via keyboard / Stop title
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

- [x] Empty-home: brand-first wordmark/type, quiet tagline, centered composer, no automatic suggestions; container-query compact brand; WelcomeGate + SessionBoot shared boot copy; recent projects on cold start
- [x] ProjectRail: active session surface highlight (no accent bar/dot); always-on search; measured context menus; archive confirm; topbar brand when rail closed
- [x] Composer: shared transcript/approval/composer measure (`--composer-max: 40rem`), taller resting input (`--composer-input-min: 44px`); queue is one card above the composer (flat list, hover steer/dequeue)
- [x] Mode dropdown Plan / Agent / Yolo (`selectModeAction`); Shift+Tab still cycles; plan-pending guard unchanged
- [x] Lucide stroke icons for chrome + composer; tool-row glyphs via renderer `tool-glyph.tsx` (shared unicode `toolIcon` labels unchanged)
- [x] Sans UI chrome; mono reserved for real code (fences, tool/diff/job bodies, wordmark, rich charts)
- [x] Streamdown markdown fences use Shiki `CodeBlock` + line numbers; theme follows app palette via `shikiThemeFor` (not hardcoded github)
- [x] One copy control (`CopyButton`) for fences, tool output, answers, thinking, plans; Streamdown table copy enabled
- [x] GFM tables: Streamdown 2.5 wrapper is flex (no float); scroll on the table shell; fixed layout so prose columns don’t clip or hog width
- [x] Streamdown markdown hierarchy: `[data-streamdown="strong"]` / headings / nested lists / inline-code tokens; nested detail on `--text-secondary`
- [x] SourceList cards: heading titles (not `.md a` blue), quiet domain, 2-line snippet clamp, light hairline cards
- [x] Plan approval body renders as markdown in the chat column; sources/assumptions as quiet footers; Accept / Keep / YOLO row
- [x] `selectModeAction` unit coverage + Shiki theme registry coverage

## Sleek modern Codex alternative — opencode-inspired polish (session 7)

- [x] Token system: `--thinking-opacity`, `--bg-menu`, `--ctx-track`, `--composer-input-min`, rail widths 20vw/260 & 26vw/340, icon 16px, light shadows lifted, glass blur 24px/sat 140%
- [x] Composer: dense full-surface frost with continuous blur + chat-column veil; focus ring; status row; mode dropdown; context gauge; tokenized user bubble (`--bubble-user-*`)
- [x] Transcript: compact aligned tool/thinking rows, readable tool bodies, thinking opacity token, code block 10px radius with bottom border header, diff 2.5px accent, structured source cards
- [x] Menus: slash/mention quiet surface-enter, sentence-case compact typography, keyboard containment, catalog grouping (favorites via localStorage + recent 8 + provider buckets, Free badge, clear ×)
- [x] Session panel (Inspector): sole session side view; closed by default; explicit topbar toggle; user can close; LiveSidebar removed
- [x] Rails: active session uses surface highlight only; project row radius 7px, topbar 14px semibold, Session panel border 22% + blur 12px sticky header, meta-block tighter
- [x] Secondary: restrained cards, single Stop + Esc interrupt language, jobs drawer, earlier/jump controls, compact toast, memory notice, and source/article cards
- [x] Model pill bordered 18% + hover 68%, transcript gap 28px/10px, code 12.5px
- [x] Light scheme: restored edge-highlight + soft frost elevation; hairlines via `--border-soft` (not hard card borders)
- [x] `/accent` remaps `--sel-bg` / `--sel-fg` / `--heading` / focus ring with contrast-aware foreground

## Second-pass deep polish (session 8)

- [x] Text input: auto-resize overflow toggle (hidden until 200px then auto), floating surface `::before` full-surface blur, placeholder 52% muted focus 38%, exact-cmd 500 weight, caret-color, status top border 14% + surface 22%, model pill bordered 18% + tabular-nums
- [x] Context gauge: pill with border, bg 36% → 56% hover, dial 14px + box-shadow 1px border, warn/notice/hot with bg tint
- [x] Mode dropdown: trigger + options menu (`selectModeAction`) with uniform sentence-case menu typography and keyboard focus
- [x] Slash/mention menu: quiet surface-enter, restrained overlay shadow, sentence-case headers, keyboard focus containment, and compact footer hints
- [x] Catalog popover: 46vh/440px max, floating origin, uniform sans typography, compact section labels, Free tags, empty hint, clear button, and inline loading/error states
- [x] Project rail: active session surface + weight; row radius 7px, session row 72% assistant text, working-only spinner on the active busy session
- [x] Side popups: activity rail 94% bg, heading 14px sticky blur 12px, meta-block 2px padding 10px radius + 1px 6% highlight, meta-label 10px 700 0.06em upper, sidebar-heading 14px padding
- [x] Transcript: user bubble max 92%/48rem, 14px radius + 1px 10% highlight, assistant prose optimizeLegibility, tool body margin 20px + 10px padding 36% bg, thinking 24% bg, source cards 10px radius softer, diff 2.5px solid + 82%/88% bg + 72% ctx, earlier/jump refined, composer-stack 14px radius 36% border + 1px 12% highlight
- [x] Composer stack: queue as its own quiet card above the composer (not a merged surface); busy Stop control (no separate working strip)
- [x] Typecheck, lint, build, and unit tests green (76 tests); source parity and bundle budget remain explicit release gates documented in `VERIFICATION.md`

## Current UI consolidation (2026-07-12)

- [x] Default palette aligned to the requested graphite roles: `#111111`,
  `#1a1a1a`, `#242424`, `#393939`, and `#88b0e0`.
- [x] Project rail actions are hover/focus revealed, portal-mounted, and
  overlaid inside rows without a permanent action-column gutter.
- [x] Session inspector is explicit-toggle only; sending a message does not
  reopen it.
- [x] Approval panels and transcript output share the composer measure.
- [x] User turns fold from the message itself without a persistent arrow.
- [x] Memory notices use a quiet `Memory · N notes` disclosure with an
  expandable note list; no emoji or decorative brain/sparkle glyph is used.
- [x] Source/article results use numbered cards with title, domain, and snippet
  hierarchy.

## Presentation polish (2026-07-11 evening)

- [x] App icon: optically padded `assets/icon.png` source → `build:icon` →
  `icon.icns`; unpackaged macOS dock via `app.dock.setIcon`
- [x] Queue: one quiet card, “N Queued” header, flat list, hover steer/dequeue
- [x] Continuous composer frost + chat-column veil so transcript is blurred
  across the full input surface; empty home has no veil; reduced-motion drops
  live blur
- [x] Project/session ⋯ menus: trigger-anchored (flip above near bottom), toggle
  on second click, no mousedown/click race, `aria-haspopup`/`aria-expanded`,
  hidden triggers `pointer-events: none`, and no permanent action gutter
- [x] Delete/archive confirm: title + detail, right-aligned Cancel / action pills
- [x] Overlay scrollbars; backgroundless white hover Copy/Edit icons with
  reserved gutters; Streamdown
  strong/heading/list/code hierarchy; GFM table scroll shell; quieter source cards
- [x] Preview scenarios `table`, `docs`, `sources`; docs synced
  (UI/PARITY/README/AGENTS/VERIFICATION/ACCEPTANCE)

## Renderer interaction polish (2026-07-12)

- [x] Thinking/tool activity uses one compact sans/icon scale and groups
  contiguous activity behind a click-to-expand `Thinking · N steps` row.
- [x] Memory notices are quiet expandable rows with readable note entries,
  replacing the previous brain-icon/clamped-preview treatment.
- [x] Project rail session spinner renders only for the active busy session,
  with a restrained rotating arc and reduced-motion support.
- [x] Workspace eyebrow labels use the primary sans typography rather than a
  letter-spaced micro-label treatment.

## Logic audit and hardening (2026-07-12)

- [x] Delta flush ordering: `flushDeltas()` now runs before `landReasoning()` and
  before every non-delta transcript dispatch, matching TUI's `landPending` →
  `commitThinking` → `reduceTranscript` sequence (was reversed/missing in
  `endTurn`, `user-message`, `assistant-text-delta`, `tool-call-started`,
  `plan-presented`, and all notice/checkpoint/verify/loop handlers)
- [x] Subagent-started deduplication: `continue_subagent` reuses the same child
  ID; existing row is updated in place (preserving position) instead of
  filtering and re-appending (TUI parity); `activity` and `result` cleared on
  re-start
- [x] Quit handler: 5-second hard budget via `Promise.race` (was unbounded —
  `finalize` RPC 20s + `stop()` 2s = 22s worst case); re-entrancy guard via
  `quitting` flag
- [x] Clipboard temp dir cleanup on quit (TUI `cleanupClipboardTempDir` parity);
  `rm(join(tmpdir(), \`vibe-clips-${process.pid}\`))` in quit race
- [x] Ctrl+C only fires in the composer or outside any text input (was quitting
  the app from rename fields, search filters, deny-reason inputs)
- [x] Escape in deny-reason input closes it, clears the reason, and returns
  focus to the "Allow once" button (was a dead end — no handler, window-level
  Esc returned early for non-composer inputs)
- [x] `CLEAR_SCOPED_TYPES` moved to module level (was recreated on every render)
- [x] `verify-finished` notice uses `truncate()` (cell-aware, code-point-safe)
  instead of `.slice(0, 120)` (could strand half a surrogate pair)
- [x] Source parity script: `ALLOW_EXTRAS` set with `{ extras, drift }` flags for
  reducer/density/tool-icons/themes/protocol; whitespace normalization for
  formatting-only drift
- [x] Formatting in markdown-blocks, rich-blocks, spinner synced to match
  upstream TUI exactly (import paths only difference)
- [x] 2 new unit tests: subagent-started in-place update + fresh-id append
- [x] 98 unit tests, 10 e2e tests, 19 source pairs, lint, typecheck all green

## Settings & Git integration (2026-07-12)

- [x] Full-workspace settings view: replaces the left rail with section
  navigation + scope toggle and the center with the scrollable form area
  (not a narrow side drawer)
- [x] 15 settings sections: Models, Providers, MCP Servers, Permissions,
  Appearance, Behavior, Subagents, Build & Verify, Memory, Search & Web,
  Compaction, Budget & Retry, Hooks, Custom Instructions, Advanced
- [x] Settings read/write via direct config file I/O (global + project scope),
  mirroring `@vibe/config`'s JSONC parsing and deep-merge write semantics
- [x] Config scope toggle (Global / Project) with save/reset/dirty indicator
- [x] Custom instructions (VIBE.md) editor with global and project scope, live
  save, and dirty tracking
- [x] Provider management: API keys, base URLs, token files, extra headers per
  provider with expand/collapse cards and inline add form (no window.prompt)
- [x] MCP server management: stdio + remote (HTTP/SSE) with env-var expansion,
  per-server enable/disable, timeout, inline add form
- [x] Permission rules editor: tool/match/action with add/remove
- [x] Hooks editor: 8 lifecycle events, shell command or URL, async toggle
- [x] Full-workspace git view: left rail shows branch status + quick actions +
  tab navigation; center shows the active tab content
- [x] Git tabs: Branches (create/switch/delete), Changes (stage/unstage/commit/
  amend), History (recent commits), Remotes (URLs + host/owner/repo),
  Pull Requests (list/create via gh CLI)
- [x] Git quick actions: fetch, pull, push from the rail sidebar
- [x] GitHub PR workflow: list PRs, create PR (title/body/base/draft), open in
  browser, gh CLI availability check
- [x] Settings & Git icons at the bottom of the project rail (rail-footer),
  not in the chat-area topbar
- [x] Keyboard shortcuts: ⌘, for settings, ⌘⇧B for git; Esc closes either view
- [x] Slash commands: /settings, /config, /git, /branches
- [x] Preview scenarios: ?scenario=settings and ?scenario=git
- [x] IPC security: all new handlers assert trusted sender via shared
  ipc-security module; inline styles removed (token-driven CSS only)
- [x] 22 new unit tests: config I/O (JSONC parsing, deep merge, null-delete,
  trailing commas, string-aware comment stripping) + git operations (repo
  detection, status parsing, branch listing, commit history)
- [x] 98 unit tests, lint, typecheck, build, bundle, source parity all green

## Attachments, review, and final renderer polish (2026-07-12)

- [x] Finder drag/drop accepts image and file batches with removable chips,
  image previews, duplicate normalization, and project-aware `@` references
- [x] Native dropped-file resolution uses Electron `webUtils.getPathForFile`,
  then `text/uri-list` and `text/plain` Finder path fallbacks for environments
  where `File.path` is empty
- [x] Session inspector changed files retain their latest unified diff and open
  in a toggleable Diff/File review surface with line gutters and Reveal
- [x] Project and Session rails expose pointer and Arrow/Home/End keyboard
  resizing with persisted desktop widths and responsive drawer fallbacks
- [x] User-message Copy/Edit/time actions sit beside the bubble; assistant
  actions remain below assistant responses
- [x] Metadata, costs, model/session telemetry, and section headings use the
  shared sans UI font; mono remains reserved for code and raw output
- [x] Preview harness covers `attachments`, `settings`, `git`, light mode, and
  Finder-style URI fallback behavior
- [x] 98 unit tests, 10 E2E scenarios, lint, typecheck, build, bundle, source
  parity, and bridge smoke all pass
