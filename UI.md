# UI.md — Current interaction and visual contract

> **Status:** current-state handoff
> **Updated:** 2026-07-12
> **Repository:** [vbcode-electron](https://github.com/robzilla1738/vbcode-electron)

This is the renderer-facing design contract for the Electron shell. Re-check the
live code before changing behavior; the engine remains owned by
`vibe-codr` and this repository is responsible for presentation, IPC wiring,
and desktop interaction.

## Product shape

The shell has four primary surfaces:

1. A project rail with projects, sessions, search, and session/project actions.
2. A central transcript with user bubbles, assistant prose, tools, thinking,
   notices, source cards, and rich data views.
3. A floating composer with mode, model, context, queue, and submit controls.
4. Optional floating Jobs and Session panels opened from explicit topbar controls;
   the Session panel includes changed-file review with Diff/File modes.

Transcript output, approval cards, and the composer use the same centered
`--composer-max: 40rem` measure. The central chat pane fills its workspace
edge-to-edge without an outer inset or decorative corner curve. Output may
scroll behind the floating composer; continuous full-surface frost blurs that
overlap without allowing text to remain readable through the top edge.
Approval cards stay opaque.

The project and Session rails are resizable on desktop with pointer and
keyboard handles. Widths persist locally; narrow drawer layouts intentionally
hide the handles.

## Visual language

- Default dark roles: background `#111111`, rail/panel `#1a1a1a`, elevated
  surfaces `#242424`, dividers `#393939`, and code/source accent `#88b0e0`.
- All renderer styling is token-first in `src/renderer/styles.css`; colors must
  come from palette tokens or `color-mix()` derivations.
- Use the shared sans font for interface copy, tool labels, metadata, notices,
  and prose. Reserve mono for code, diffs, job output, fenced blocks, and rich
  chart glyphs.
- Metadata labels, section headings, costs, model names, and session telemetry
  use the same primary sans treatment and normal tracking. File paths and raw
  code remain mono only when they are genuinely code/data.
- Use modest radii, hairline borders, and restrained shadows. Avoid gradients,
  decorative side borders on controls, animated dots, sparkle glyphs, and
  ornamental badge clouds.
- Radius grammar: surfaces use `--radius-md/lg/xl`; status chips, send, and
  Jump to latest use `--radius-pill`; utility Copy/Edit icons are transparent
  controls with no filled chip background. Do not invent a third radius family
  for one-off chrome.
- Markdown output is Streamdown-aware: bold is `[data-streamdown="strong"]`,
  headings/lists/code use the matching data attributes, and nested list detail
  sits on `--text-secondary` under `--heading` labels.
- Motion is property-scoped and tokenized. Respect `prefers-reduced-motion`.
- Focus is `:focus-visible` only, using the two-layer `--focus-ring` token.
- Scrollbars are overlay-style: transparent until the scroller is hovered or
  focused. Do not reserve `scrollbar-gutter: stable` strips.

## Interaction contracts

### Project rail

- Project and session names are loaded through host RPC and can be renamed.
- Project actions are hidden at rest and appear on hover/focus: Rename,
  Archive, and Delete. The ⋯ control anchors its portal menu below (or above
  when near the viewport bottom), toggles closed on a second click, and keeps
  `aria-haspopup` / `aria-expanded`. Destructive actions expand an in-menu
  confirmation with a title + quiet consequence line and right-aligned Cancel /
  Delete|Archive pills (safe choice focused). Do not use native `window.confirm`.
- Session actions use the same menu grammar. Menus are portal-mounted so the
  animated rail cannot clip them. Hidden ⋯ triggers use `pointer-events: none`
  so they cannot steal clicks from expand/collapse.
- The project name is the only flexible column. Chevrons and hover/focus action
  buttons live inside the row without reserving a permanent action gutter.
  The working spinner appears only beside the active session while that
  session is busy; it must never read as a persistent selected-state marker.
- Busy state disables navigation actions with an honest stop-turn reason.
- A desktop resize separator exposes pointer dragging plus ArrowLeft/ArrowRight
  and Home/End keyboard sizing, with a persisted width per rail.

### Transcript

- Assistant output, tool output, approval panels, and the composer share the
  same reading width.
- Tool and thinking rows share one compact sans/icon scale. Consecutive
  activity is grouped under a quiet `Thinking · N steps` disclosure; clicking
  it reveals the individual tool/thought rows, whose bodies still expand on
  demand without adding decorative chrome.
- User messages are interactive disclosure controls: click or press Enter/Space
  on the message to fold or unfold the rest of its turn. Do not render a
  persistent collapse arrow beside the bubble.
- User-message Copy/Edit/time actions sit to the right of the bubble as one
  compact hover/focus cluster; assistant actions remain below the response.
- Streaming follows only while the reader is near the bottom. Upward scrolling
  disengages follow and exposes Jump to latest.
- Hover utility actions (answer Copy/Edit, tool/thinking/plan copy, table
  copy/fullscreen): clean white icons that fade + lift in on parent
  hover/focus without a filled background. Touch keeps them lightly visible,
  and keyboard focus uses the shared focus ring.
- Subagent activity rows are static status summaries: active rows use a clean
  spinner, completed rows use a check, and clicking a row never expands a
  detail transcript or robot card.
- Tool output uses meaningful Lucide glyphs. Memory is a quiet `Memory · N
  notes` disclosure with the note list revealed on click; it uses no emoji or
  decorative brain/sparkle glyph.

### Sources and articles

Source results use `SourceList` cards with a consistent hierarchy:

1. A quiet right-aligned two-digit index.
2. Article title as the primary readable link (`--heading`, not default link blue).
3. Domain as secondary source metadata (quiet code tint).
4. Optional snippet clamped to two lines on `--text-secondary`.

Cards stay light: hairline border, soft surface fill, no heavy elevation.
External links must go through `ExternalLink` and the host bridge. Do not render
untrusted HTML directly.

### Composer and queue

- The composer is a floating frosted surface: mostly opaque fill with
  continuous backdrop blur across the full surface so transcript text cannot
  show through the top edge. Focus changes border/ring only.
- A soft bottom veil on the chat column eases text into the composer zone; empty
  home has no veil. The veil never replaces full composer coverage.
- Queue is a single quiet card above the composer: muted “N Queued” header and a
  flat list of labels (no per-item cards). Steer and remove appear on row hover
  as icon-only actions with accessible labels.
- Finder drag/drop accepts images and files as removable attachment chips. The
  renderer resolves Electron native paths first, then Finder `file://` URI and
  plain-text path payloads, normalizes duplicates, preserves spaces, and sends
  project-aware `@` references to the engine.
- Slash, mention, mode, and catalog menus are floating surfaces with keyboard
  focus containment and focus restoration.
- Suggestions are intentionally removed from the empty home. Users start by
  typing in the composer.

### Approval and plan cards

- Permission and plan panels use the composer measure and sit above the
  composer clearance.
- Permission cards lead with a human action title, a readable command/file
  preview, then evenly spaced decision controls.
- Technical details are secondary and collapsible. Deny can reveal a reason
  field without replacing the primary actions.
- Plan cards render markdown, sources, assumptions, and ungrounded warnings in
  the same restrained card grammar.

### Session and Jobs panels

- The Session inspector is closed by default and opens only from its explicit
  topbar toggle or another deliberate session-panel control. Sending a message
  must not reopen it.
- Changed files can be opened from the review affordance or file row. Diff mode
  renders the latest unified diff with line-number gutters; File mode reads the
  current file through the preload bridge; Reveal opens the file in Finder.
- The Jobs panel is a clean floating drawer with a compact header, status,
  live-following output, safe localhost links, and focus restoration on close.

## Key files

| Concern | Location |
|---|---|
| Shell / overlay ownership | `src/renderer/App.tsx` |
| Tokens and layout | `src/renderer/styles.css` |
| Composer / mode / menus | `src/renderer/composer/Composer.tsx` |
| Native dropped-file paths | `src/preload/index.ts` (`webUtils.getPathForFile`) |
| Project rail | `src/renderer/layout/ProjectRail.tsx` |
| Rail resizing | `src/renderer/layout/SidebarResizeHandle.tsx` |
| Transcript and folding | `src/renderer/transcript/TranscriptView.tsx` |
| Source/article cards | `src/renderer/transcript/SourceList.tsx` |
| Permission / plan / queue | `src/renderer/panels/LivePanels.tsx` |
| Jobs | `src/renderer/panels/JobsView.tsx` |
| Session inspector | `src/renderer/panels/Inspector.tsx` |
| Catalogs | `src/renderer/pickers/CatalogModal.tsx` |
| Icons | `src/renderer/icons.tsx`, `src/renderer/tool-glyph.tsx` |
| Preview harness | `tools/ui-preview/` |

## Verification

Renderer changes should use the smallest relevant focused check, then the full
publication gate when shipping:

```bash
npm run lint
npm test
npm run typecheck
npm run build
npm run test:e2e
```

For visual changes, use the deterministic preview scenarios in
`tools/ui-preview/README.md`. At minimum inspect `chat`, `docs`, `table`,
`sources`, `permission`, `plan`, `queue`, `jobs`, `inspector`, `catalog`, and
`attachments`, `settings`, `git`, and `splash`, plus a light theme and a narrow
viewport. Exercise Finder-style `file://` drops, Diff/File review, rail
resizing, and the user-message action cluster. Do not treat screenshots as a
substitute for code-level verification.

See [PARITY.md](./PARITY.md), [VERIFICATION.md](./VERIFICATION.md), and
[ACCEPTANCE.md](./ACCEPTANCE.md) for engine contracts and release gates.
