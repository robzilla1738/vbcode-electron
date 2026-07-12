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
`--composer-max: 40rem` measure. Output scrolls behind the fixed composer, but
the composer and approval surfaces remain opaque so text never bleeds through.

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
  ornamental pill stacks.
- Motion is property-scoped and tokenized. Respect `prefers-reduced-motion`.
- Focus is `:focus-visible` only, using the two-layer `--focus-ring` token.

## Interaction contracts

### Project rail

- Project and session names are loaded through host RPC and can be renamed.
- Project actions are hidden at rest and appear on hover/focus: Rename,
  Archive, and Delete. Destructive actions use an in-app confirmation state.
- Session actions use the same menu grammar. Menus are portal-mounted so the
  animated rail cannot clip them.
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
- Tool output uses meaningful Lucide glyphs; memory uses a neutral brain icon,
  not sparkle glyphs.

### Sources and articles

Source results use `SourceList` cards with a consistent hierarchy:

1. A quiet two-digit index.
2. Article title as the primary readable link.
3. Domain as secondary blue/source metadata.
4. Optional snippet clamped to a readable line length.

External links must go through `ExternalLink` and the host bridge. Do not render
untrusted HTML directly.

### Composer and queue

- The composer is a floating opaque elevated surface. Focus changes its border
  and ring only; it must not become transparent.
- Queue items are independent stacked cards above the composer. Remove is an
  icon-only action with an accessible label.
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
`tools/ui-preview/README.md`. At minimum inspect `chat`, `permission`, `plan`,
`queue`, `jobs`, `inspector`, `catalog`, and `splash`, plus a light theme and a
narrow viewport. Do not treat screenshots as a substitute for code-level
verification.

See [PARITY.md](./PARITY.md), [VERIFICATION.md](./VERIFICATION.md), and
[ACCEPTANCE.md](./ACCEPTANCE.md) for engine contracts and release gates.
