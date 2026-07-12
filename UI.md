# UI.md — Current interaction and visual contract

> **Status:** current-state handoff
> **Updated:** 2026-07-11
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
4. Optional floating Jobs and Session panels opened from explicit topbar controls.

Transcript output, approval cards, and the composer use the same centered
`--composer-max: 40rem` measure. Output may scroll behind the floating
composer; a soft bottom veil plus bottom-weighted frost on the composer keep
that overlap readable without a hard cut. Approval cards stay opaque.

## Visual language

- Default dark roles: background `#111111`, rail/panel `#1a1a1a`, elevated
  surfaces `#242424`, dividers `#393939`, and code/source accent `#88b0e0`.
- All renderer styling is token-first in `src/renderer/styles.css`; colors must
  come from palette tokens or `color-mix()` derivations.
- Use the shared sans font for interface copy, tool labels, metadata, notices,
  and prose. Reserve mono for code, diffs, job output, fenced blocks, and rich
  chart glyphs.
- Use modest radii, hairline borders, and restrained shadows. Avoid gradients,
  decorative side borders on controls, animated dots, sparkle glyphs, and
  ornamental badge clouds.
- Radius grammar: surfaces use `--radius-md/lg/xl`; status chips, icon actions,
  send, and Jump to latest use `--radius-pill`. Do not invent a third radius
  family for one-off chrome.
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
- The project name is the only flexible column. Chevrons, active spinners,
  and action buttons have reserved space and must never overlap.
- Busy state disables navigation actions with an honest stop-turn reason.

### Transcript

- Assistant output, tool output, approval panels, and the composer share the
  same reading width.
- Tool and thinking rows are compact, aligned, and grouped by the turn gap;
  expanded bodies provide the detail without adding decorative chrome.
- User messages are interactive disclosure controls: click or press Enter/Space
  on the message to fold or unfold the rest of its turn. Do not render a
  persistent collapse arrow beside the bubble.
- Streaming follows only while the reader is near the bottom. Upward scrolling
  disengages follow and exposes Jump to latest.
- Hover utility chips (answer/tool/thinking/plan copy, table copy/fullscreen):
  circular quiet chips that fade + lift in on parent hover/focus. Parents
  reserve inset so chips never cover glyphs. Touch keeps them lightly visible.
- Tool output uses meaningful Lucide glyphs; memory uses a neutral brain icon,
  not sparkle glyphs.

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

- The composer is a floating frosted surface: mostly opaque fill with a light
  bottom-weighted backdrop blur so transcript can scroll behind without a hard
  cut. Focus still changes border/ring only.
- A masked bottom veil on the chat column (soft `--bg` wash + blur up to ~mid
  composer height) eases text into that zone; empty home has no veil.
- Queue is a single quiet card above the composer: muted “N Queued” header and a
  flat list of labels (no per-item cards). Steer and remove appear on row hover
  as icon-only actions with accessible labels.
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
- The Jobs panel is a clean floating drawer with a compact header, status,
  live-following output, safe localhost links, and focus restoration on close.

## Key files

| Concern | Location |
|---|---|
| Shell / overlay ownership | `src/renderer/App.tsx` |
| Tokens and layout | `src/renderer/styles.css` |
| Composer / mode / menus | `src/renderer/composer/Composer.tsx` |
| Project rail | `src/renderer/layout/ProjectRail.tsx` |
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
`splash`, plus a light theme and a narrow viewport. Do not treat screenshots as
a substitute for code-level verification.

See [PARITY.md](./PARITY.md), [VERIFICATION.md](./VERIFICATION.md), and
[ACCEPTANCE.md](./ACCEPTANCE.md) for engine contracts and release gates.
