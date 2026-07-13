# UI.md — Current interaction and visual contract

> **Status:** current-state handoff  
> **Updated:** 2026-07-13 (editing-view persistence, contextual terminal, and master-detail Changes review)
> **Repository:** [vbcode-electron](https://github.com/robzilla1738/vbcode-electron)

This is the renderer-facing design contract for the Electron shell. Re-check the
live code before changing behavior; the engine remains owned by
`vibe-codr` and this repository is responsible for presentation, IPC wiring,
and desktop interaction.

## Product shape

The shell has these primary surfaces:

1. **Project rail** (left) — collapsible **Projects** and **Chats** sections,
   search, session/project menus, Git/Settings footer.
2. **Main stage** — topbar (project/session title), transcript (user bubbles,
   compact expandable engine-follow-up context, assistant prose, tools, thinking,
   structured gate/visual-check statuses, notices, sources), floating composer,
   plan/permission/queue overlays, and a single footer action row for changed files
   plus Jump to latest.
3. **Workspace dock** (right strip on the chat surface) — flat full-label list:
   Session, Changes, Git, Terminal, Jobs, Files. Its equally inset rounded
   `--surface-subtle` enclosure has no shadow, section dividers, or
   Local/Commit/Compare noise. It
   switches to compact icon navigation below ~960px; Jobs is also available via
   `/jobs`.
4. **Activity sidebar** — one full-height, edge-attached right pane for Session,
   Changes, Git, Terminal, and Jobs. The active view replaces the previous view
   in the same structural grid column. Files remains a Finder reveal rather
   than an in-app panel.
5. **Changed-files footer chip** — after edits, a compact summary shares the
   transcript footer row with Jump to latest and opens the Changes workspace.

Transcript output, approval cards, and the composer use the same centered
`--composer-max: 40rem` measure. The central chat pane fills its workspace
edge-to-edge. Output may scroll behind the floating composer; continuous
full-surface frost blurs that overlap. Approval cards stay opaque.

The project rail and activity sidebar are responsive and desktop-resizable by
pointer or keyboard. Widths persist, and narrow layouts become edge drawers
without changing the active chat or scroll position.

## Visual language

- Default dark roles: background `#111111`, rail/panel `#1a1a1a`, elevated
  surfaces `#242424`, dividers `#393939`, and code/source accent `#88b0e0`.
- All renderer styling is token-first in `src/renderer/styles.css`; colors must
  come from palette tokens or `color-mix()` derivations.
- Use the shared sans font for interface copy, tool labels, metadata, notices,
  and prose. Reserve mono for code, terminal grids, diffs, job output, fenced
  blocks, the ASCII wordmark, and rich chart glyphs.
- Section headers (rail, popovers, slash menu “Commands”) use the same UI sans
  voice — no micro-caps / tracked mono treatment for chrome labels.
- Use modest radii, hairline borders, and restrained shadows. Avoid gradients,
  decorative side borders on controls, animated dots, sparkle glyphs, and
  ornamental badge clouds.
- Radius grammar: surfaces use `--radius-md/lg/xl`; status chips, send, and
  Jump to latest use `--radius-pill`; utility Copy/Edit icons are transparent
  controls with no filled chip background.
- Markdown output is Streamdown-aware: bold is `[data-streamdown="strong"]`,
  headings/lists/code use the matching data attributes.
- Motion is property-scoped and tokenized. Respect `prefers-reduced-motion`.
- Focus is `:focus-visible` only, using the two-layer `--focus-ring` token.
- Section navigation uses spacing and selected fills; never add bright white
  outline segments or moving white side lines to a selected section.
- Scrollbars are overlay-style: transparent until the scroller is hovered or
  focused.

## Interaction contracts

### Project rail

- Two sections, top to bottom: **Projects** (code folders from host
  `listProjects`) then **Chats** (one-off conversations under `~/.vibe/chats`).
  No divider rules — quiet spacing only.
- Section headers are **collapsible** (chevron + label). Trailing **+** only:
  Projects → add folder; Chats → new chat. No New session / Continue pills on
  the rail (Continue Latest remains ⇧⌘N / menu; New session after host fatal is
  on the in-column boot-error card).
- Search forces both sections open so matches stay visible.
- Chat sessions use the same flat session-row grammar as project sessions
  (title + relative time). Project sessions stay nested under folders.
- Empty section copy (“No chats yet.” / “Add a folder…”) sits tight under the
  header, indented past the chevron.
- Project and session ⋯ menus: portal-mounted, trigger-anchored, flip above
  near the bottom; destructive actions use in-menu confirmation (not
  `window.confirm`).
- Busy disables navigation with an honest stop-turn reason.
- Desktop resize: pointer + ArrowLeft/ArrowRight + Home/End; width persisted.

### Workspace dock

- Lives **inside** the main column / content stage, inset equally from the top
  and side. Its rounded enclosure uses `var(--surface-subtle)` for a quiet grey
  separation from chat without becoming a separate workspace rail.
- Rows only: Session (`Show session panel`), Changes, Git, Terminal, Jobs
  (`Toggle background jobs` — toggles), Files (Finder reveal). Git may show the
  short branch name in the label; +/− meta appears on Changes when files exist.
- No Local row (Files is the single Finder action), no Commit/Compare rows, no
  section labels or decorative divider rules inside the dock nav.
- Switches to icon-only navigation at `max-width: 960px` (Jobs still via
  `/jobs`).
- Session, Changes, Git, Terminal, and Jobs are mutually exclusive views in one shared
  right-side activity lane. Opening one closes the previous active view instead
  of replacing the whole workspace or jumping the conversation.
- The activity sidebar is a full-height grid sibling of the topbar/chat stage,
  separated by one quiet hairline. It is never an inset floating card and never
  overlays desktop chat content.
- A persistent top switcher keeps Session, Changes, Git, Terminal, and Jobs
  visible whenever the sidebar is open. Switching views replaces only the
  sidebar body; it does not close the lane or remount chat.
- The activity header, width, divider, close behavior, Escape handling, resize
  handle, and open motion are shared across all five views. Do not create a
  bespoke drawer for a new dock item.

### Transcript

- Assistant output, tool output, approval panels, and the composer share the
  same reading width.
- Tool and thinking rows share one compact sans/icon scale. Consecutive
  activity groups under `Thinking · N steps`. Each open thought is **one
  quiet surface** (label + prose; no brain icon; no stacked empty cards).
  Copy for thinking sits on the head row.
- User messages fold/unfold the turn by click or Enter/Space on the bubble —
  no persistent collapse arrow.
- User-message Copy / Edit / time sit **under** the bubble (trailing-aligned),
  hover/focus of the bubble stack; assistant Copy stays below the response.
- Streaming follows only near the bottom; Jump to latest restores follow.
- Subagent rows are static status summaries (spinner/check), not expandable.
- Memory is a quiet `Memory · N notes` disclosure.

### Sources and articles

Source results use `SourceList` cards: index, title link, domain, optional
snippet. External links go through `ExternalLink` / host bridge.

### Composer and queue

- Floating frosted composer; continuous full-surface frost.
- Soft bottom veil on non-empty chat; empty home has no veil.
- Queue: one quiet card above the composer; steer/remove on row hover.
- Active work is communicated by the composer status and project-row spinner;
  do not render a redundant floating “Running” card. Density-change
  acknowledgements are silent, and warning output stays quiet/collapsible.
- Finder drag/drop: native path first, then `file://` / plain-text fallbacks.
- Slash, mention, mode, and catalog menus: floating, keyboard-contained.
- Empty home has no automatic prompt suggestions.

### Approval and plan cards

- Composer measure; sit above composer clearance.
- Permission: human title, preview, once/session/project/deny (+ optional deny reason).
- Plan: fixed title and approval footer around one bounded scroll region for
  markdown, sources, assumptions, and ungrounded warnings; Enter / Esc / ⌘Y.
  The footer remains visible and sits 8px above the plan-revision composer.

### Session, Changes, Git, Terminal, and Jobs panels

- The wide Environment dock is a compact hairline navigation surface on
  `--bg`, without a rail tint or floating shadow. At the compact breakpoint it
  becomes a small enclosed icon strip rather than disappearing.
- Activity views are closed by default. Session opens from dock Session or ⇧⌘I;
  Changes opens from the dock or changed-files footer chip. Git opens from the dock or
  Git shortcut; Jobs opens from the dock or `/jobs`. Sending a message must not
  reopen the activity sidebar.
- Opening Session, Changes, Git, Terminal, or Jobs closes the previous view in
  place. Escape, the close control, or the active dock toggle returns to the
  unchanged chat surface; a dismiss scrim is added only in compact drawer mode.
- Switching or resuming sessions changes conversation data without closing or
  changing the active Session/Changes/Git/Terminal/Jobs view. Changes keeps its
  Diff/File mode, and transcript scroll positions are restored per session.
- Terminal view close/switch detaches only xterm rendering. Project sessions
  open shells at the project root; one-off Chats open at the user's home instead
  of the internal `~/.vibe/chats` session store. Each effective-cwd PTY continues
  in the main process, keeps bounded replay output, and reconnects when Terminal
  is selected again; app shutdown remains the lifecycle boundary.
- All activity tabs, headers, labels, and supporting paths use the shared app
  sans stack and tokenized type scale. The xterm grid intentionally uses
  `--font-mono` at 12.5px with neutral letter spacing and a 1.35 line height so
  terminal cells and the thin bar cursor remain correct. Hierarchy comes from
  weight, color, and spacing rather than inconsistent font sizes.
- Git’s branches/changes/history/remotes/pull-request content stays inside the
  activity rail. It must not replace the project rail or main chat workspace.
- Changes is a dedicated master-detail review workspace: searchable directory
  groups stay visible beside the selected file, with aggregate/per-file stats,
  churn balance, previous/next navigation, Diff/File modes, line gutters, copy,
  and Reveal in Finder. It stacks navigator above review in compact drawers.
- Host fatal / boot error: primary **New session**, plus Retry and Choose
  another project.

### Settings (Configuration and Custom Instructions)

- Config sections save via the bottom save bar. The Models performance group
  exposes turn, stream-idle, and queued-item limits; MCP server timeouts accept
  positive values only. Switching MCP transport disables the entry until its
  new command/endpoint is reviewed, and a remote draft always remains
  engine-schema-valid.
- The save path deep-diffs, validates structural types/URLs/OAuth/ranges, and
  writes atomically under a bounded per-path queue. Invalid merged config is
  surfaced in Settings and never persisted. **Instructions** (VIBE.md)
  keeps its own Save/Reset and stays **mounted (hidden)** when navigating away
  so drafts and dirty bind survive section switches. Closing settings still
  clears the shell dirty guard.

## Key files

| Concern | Location |
|---|---|
| Shell / overlay ownership | `src/renderer/App.tsx` |
| Tokens and layout | `src/renderer/styles.css` |
| Composer / mode / menus | `src/renderer/composer/Composer.tsx` |
| Native dropped-file paths | `src/preload/index.ts` (`webUtils.getPathForFile`) |
| Project rail | `src/renderer/layout/ProjectRail.tsx` |
| Workspace dock | `src/renderer/layout/WorkspaceDock.tsx` |
| Changed-files footer chip | `src/renderer/panels/TurnChangesCard.tsx` |
| Diff display helpers | `src/shared/diff-view.ts`, `changed-files.ts` |
| Rail resizing | `src/renderer/layout/SidebarResizeHandle.tsx` |
| Transcript and folding | `src/renderer/transcript/TranscriptView.tsx` |
| Source/article cards | `src/renderer/transcript/SourceList.tsx` |
| Permission / plan / queue | `src/renderer/panels/LivePanels.tsx` |
| Jobs | `src/renderer/panels/JobsView.tsx` |
| Shared activity sidebar | `src/renderer/layout/ActivitySidebar.tsx` |
| Session view | `src/renderer/panels/Inspector.tsx` |
| Changes review | `src/renderer/panels/ChangesView.tsx`, `src/renderer/panels/DiffPreview.tsx` |
| Git view | `src/renderer/git/GitPanel.tsx` |
| Jobs view | `src/renderer/panels/JobsView.tsx` |
| Terminal renderer + PTY owner | `src/renderer/panels/TerminalPanel.tsx`, `src/main/terminal-manager.ts` |
| Boot / fatal recovery | `src/renderer/layout/WelcomeGate.tsx` |
| Catalogs | `src/renderer/pickers/CatalogModal.tsx` |
| Settings + instructions mount | `src/renderer/settings/SettingsPanel.tsx` |
| Settings config integrity | `src/shared/config-diff.ts`, `config-validate.ts`, `config-io.ts` |
| Icons | `src/renderer/icons.tsx`, `src/renderer/tool-glyph.tsx` |
| Preview harness | `tools/ui-preview/` |

## Verification

```bash
npm run lint
npm test
npm run typecheck
npm run build
npm run test:e2e
npm run verify:config-shape
npm run verify   # full non-E2E gate
```

For visual changes, use `tools/ui-preview` scenarios (`chat`, `docs`, `table`,
`sources`, `permission`, `plan`, `queue`, `jobs`, `inspector`, `catalog`,
`attachments`, `settings`, `git`, `splash`, …). Screenshots corroborate; they
do not replace code-level verification.

See [design-system.md](./design-system.md), [PARITY.md](./PARITY.md),
[VERIFICATION.md](./VERIFICATION.md), and [ACCEPTANCE.md](./ACCEPTANCE.md).
