# Vibe Codr design system

> Canonical visual and interaction reference for the Electron renderer.
>
> This document describes the current implementation. It is intentionally
> code-sourced: `src/renderer/styles.css` owns the CSS tokens, while
> `src/shared/themes.ts` and `src/shared/theme-registry.ts` own palette and
> theme semantics. Update this document when those contracts change.

## Product character

Vibe Codr is a macOS-first Electron presentation shell for the `vibe-codr`
engine. The interface is a quiet, dense workspace for building, reviewing, and
debugging software. It should feel precise and calm under long-running agent
work: strong hierarchy, low visual noise, predictable surfaces, and immediate
feedback without decorative motion.

The design voice is:

- **Quiet:** near-black Graphite chrome, restrained elevation, and no ornamental
  gradients, sparkle, or badge clouds.
- **Direct:** short labels, human action names, and controls that explain what
  will happen.
- **Technical where useful:** mono is reserved for code and raw machine output;
  the rest of the product speaks in a readable sans font.
- **Theme-faithful:** the Electron shell renders the same semantic theme roles
  as the CLI/TUI. Presentation polish must never replace engine semantics.

## Surfaces and ownership

The shell has four primary layout regions:

1. **Project rail:** left-edge Projects and Chats navigation, search, project
   and session actions, plus Git and Settings in the footer.
2. **Main stage:** project/session topbar, transcript, approvals, queue,
   changed-files card, and composer.
3. **Workspace dock:** compact navigation that stays on the chat surface and
   exposes Session, Changes, Git, Jobs, and Files.
4. **End panel:** one shared right-side lane for in-app Session, Changes, Git,
   and Jobs views. Opening one replaces the other in the same geometry; the main
   stage reserves the lane so user messages, output, and composer never sit
   underneath it. Files and Local remain Finder actions rather than in-app
   panels.

The end panel is not a full-screen route change and does not replace the chat
surface. It opens and closes with the standard panel motion, preserves the
conversation scroll position, and can be dismissed with Escape, the dock
trigger, or the panel close control. Settings remains a full-workspace tool
because its section navigation and form content require the larger canvas.

### Layout measures

These values are the current production tokens in `src/renderer/styles.css`:

| Token | Value | Use |
|---|---:|---|
| `--project-rail-w` | `clamp(260px, 24vw, 320px)` | Project and chat navigation rail |
| `--workspace-dock-w` | `288px` | Dock navigation block |
| `--activity-rail-w` | `clamp(280px, 26vw, 340px)` | Shared Session/Changes/Git/Jobs end panel |
| `--column-max` | `52rem` | Transcript, approvals, and composer column |
| `--composer-max` | `40rem` | Composer and approval measure |
| `--reading-max` | `130ch` | Wider transcript content measure |
| `--transcript-inset` | `64px` | Desktop output side inset |
| `--column-inset` | `48px` | Column framing and narrow fallback |
| `--composer-clearance` | `184px` | Bottom room reserved for floating composer |
| `--topbar-h` | `52px` | Main stage chrome |
| `--composer-input-min` | `44px` | Resting composer input height |

The stage is edge-to-edge inside the workspace. The transcript uses an even,
responsive inset; the composer and approval cards align to the same centered
measure. When an end panel is open, `.content-inset.end-panel-open` reserves
`calc(var(--activity-rail-w) + var(--space-lg))` on the main column.

Named JavaScript breakpoints live in `src/shared/breakpoints.ts`:

| Name | Width | Behavior |
|---|---:|---|
| `wide` | `1280px` | Comfortable rail, output, and end-panel composition; JS-only |
| `laptop` | `1100px` | Compress topbar action labels |
| `tablet` | `900px` | Project rail becomes a start-edge drawer |
| `compact` | `720px` | End panel becomes an end-edge drawer |
| `narrow` | `640px` | Dense phone-narrow chrome |

The CSS workspace dock hides below `960px`; Jobs remains reachable through
`/jobs`, and the end-panel drawer remains available through the responsive
layout rules.

## Color system

All renderer colors are semantic. Outside the `:root` fallback block in
`src/renderer/styles.css`, use `var(--token)` or a `color-mix(in oklab, ...)`
derivation. Do not add literal component hex values.

### Graphite default

The first-paint fallbacks mirror the default palette in
`src/shared/themes.ts`:

| Role | Token | Graphite value |
|---|---|---|
| Background | `--bg` | `#111111` |
| Rail / panel | `--panel` / `--rail` | `#1a1a1a` |
| Elevated surface | `--elevated` / `--surface` | `#242424` |
| Border | `--border` | `#393939` |
| Muted text | `--muted` | `#808080` |
| Assistant / primary text | `--assistant` / `--primary` | `#eeeeee` |
| User semantic color | `--user` | `#5c9cf5` |
| Tool | `--tool` | `#56b6c2` |
| Notice | `--notice` | `#f5a742` |
| Plan | `--plan` | `#9d7cd8` |
| Subagent | `--subagent` | `#7fd88f` |
| Diff addition | `--add` | `#4fd6be` |
| Diff deletion | `--del` | `#c53b53` |
| Addition background | `--add-bg` | `#20303b` |
| Deletion background | `--del-bg` | `#37222c` |
| Code / source accent | `--code` | `#88b0e0` |

The semantic palette is applied at runtime by `applyPalette`. `light` and
`contrast` are explicit schemes, while the named terminal themes are registered
in `src/shared/theme-registry.ts` and rendered by `src/shared/themes.ts`:

`default`, `dark`, `light`, `contrast`, `opencode`, `tokyonight`, `catppuccin`,
`gruvbox`, `nord`, `one-dark`, `dracula`, `rosepine`, `kanagawa`, `everforest`,
`flexoki`, and `vesper`.

Named accent presets are `blue`, `purple`, `orange`, `ember`, `amber`, `green`,
`teal`, `violet`, `rose`, and `white`. A six-digit custom accent is also valid.
Accent changes remap the accent, selection, and focus roles together.

### Surface grammar

- Resting surfaces use a quiet hairline plus `--edge-highlight`.
- Cards and rails are opaque in the normal shell so desktop background wash
  cannot reduce readability.
- Frost is reserved for floating chrome. Dark glass uses the current surface
  with `--blur-surface` or `--blur-overlay`; light glass uses a softer frost.
- The composer frost covers its entire surface, including the top edge, so
  transcript text never remains visibly readable through a hard cut.
- Section navigation uses spacing and selected fills, not bright white outline
  segments or decorative divider lines. A separator is only appropriate when it
  conveys a real data boundary, such as the workspace and session groups in an
  activity panel.

## Typography

The UI voice is `--font-sans`:

```css
-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif
```

The code voice is `--font-mono`:

```css
ui-monospace, "Berkeley Mono", "SF Mono", "SFMono-Regular", "JetBrains Mono",
"IBM Plex Mono", Menlo, Consolas, "Liberation Mono", monospace
```

| Token | Size | Leading | Use |
|---|---:|---:|---|
| `--text-display` | `32px` | `--leading-tight` | Empty-home wordmark / display |
| `--text-display-sm` | `20px` | `--leading-tight` | Large panel titles |
| `--text-heading` | `18px` | `--leading-tight` | Section and response headings |
| `--text-title` | `16px` | `--leading-ui` | Primary labels |
| `--text-prose` | `15px` | `--leading-prose` | Transcript prose |
| `--text-ui` | `13px` | `--leading-ui` | Controls and chrome |
| `--text-label` | `12px` | `--leading-ui` | Supporting labels |
| `--text-caption` | `11px` | `--leading-ui` | Metadata |
| `--text-micro` | `10px` | `--leading-ui` | Compact status |
| `--text-code` | `12.5px` | `--leading-code` | Code and raw output |

Use `400` for body copy, `450` for the default UI weight, `500` for emphasis,
and `600` for headings or strong labels. Keep tracking normal and avoid
all-caps, tracked mono labels for ordinary chrome. Bold markdown remains a
content hierarchy signal, not a replacement for layout.

## Spacing and shape

The spacing scale is `4 / 8 / 12 / 16 / 24 / 32 / 48 / 64 / 96px`, exposed as
`--space-2xs` through `--space-3xl`. Use the smallest token that preserves a
clear hit target and group related controls before adding more whitespace.

Radius tokens are:

| Token | Value | Use |
|---|---:|---|
| `--radius-xs` | `4px` | Small controls and code chips |
| `--radius-sm` | `8px` | Compact controls |
| `--radius-md` | `10px` | Cards and fields |
| `--radius-lg` | `12px` | Panels and medium surfaces |
| `--radius-xl` | `16px` | Floating composer / drawers |
| `--radius-pill` | `999px` | Status chips, send, Jump to latest |

Use consistent icon and text columns. Lucide wrappers in
`src/renderer/icons.tsx` and `src/renderer/tool-glyph.tsx` use stroke icons at
the 14–16px utility scale; icons are aligned to a fixed box before labels are
laid out. Never let an overflow menu move when its parent row changes state.

## Elevation, blur, and motion

Elevation is semantic rather than per-component decoration:

| Token | Intended layer |
|---|---|
| `--shadow-float` | Small floating controls |
| `--shadow-menu` | Slash, mention, catalog, and context menus |
| `--shadow-modal` | Blocking dialogs and onboarding |
| `--shadow-dock` | Workspace dock and right-side activity panels |
| `--shadow-drawer` | Start-edge drawers |
| `--shadow-drawer-end` | End-edge drawers |
| `--shadow-composer` | Floating composer |
| `--shadow-jump` | Jump-to-latest control |

Blur tiers are `--blur-veil: 12px`, `--blur-surface: 16px`, and
`--blur-overlay: 18px` in dark mode. Light mode uses `10px`, `14px`, and
`18px`; saturation is `1.06` dark and `1.04` light. Use blur only on an
elevated floating surface or intentional transcript veil. Never blur the text
content itself.

Transitions use the shared curves `--ease-enter`, `--ease-exit`, and
`--ease-standard`, with `--dur-micro: 80ms`, `--dur-fast: 120ms`,
`--dur-standard: 200ms`, `--dur-moderate: 280ms`, and `--dur-press: 60ms`.
Transition only transform, opacity, color, or box-shadow; never animate layout
properties. The global reduced-motion rule collapses motion and JS scroll/rail
animation must honor the same preference.

## Focus and interaction states

Focus is keyboard-only and two-layer:

```css
--focus-ring: 0 0 0 2px var(--bg),
  0 0 0 4px color-mix(in oklab, var(--focus) 62%, transparent);
```

Use `:focus-visible` on controls. Inputs whose wrapper owns the focus treatment
opt out of the duplicate native outline. Hover changes color, opacity, or a
small elevation; active state uses the 60ms press token and `--press-offset`.
Disabled controls reduce contrast and interaction without shifting layout.

Panels must remain predictable:

- The workspace dock and end panel use the same row order and edge alignment.
- Session, Changes, Git, and Jobs are mutually exclusive in the end-panel lane.
- Escape dismisses the topmost menu/panel before it aborts a running turn.
- The composer stays anchored while transcript scroll changes.
- The user bubble, assistant output, approval cards, and composer align to the
  same readable measure.
- Menus are portal-mounted and trigger-anchored; they flip when near an edge.
- No section uses a bright white “selected outline” or moving side line.

## Component contracts

| Component | Source | Contract |
|---|---|---|
| Project rail | `src/renderer/layout/ProjectRail.tsx` | Collapsible Projects/Chats, stable icon/text columns, portal menus, persisted resize |
| Workspace dock | `src/renderer/layout/WorkspaceDock.tsx` | Chat-surface navigation for Session/Changes/Git/Jobs/Files |
| End panel | `src/renderer/panels/Inspector.tsx`, `src/renderer/panels/JobsView.tsx`, `src/renderer/git/GitPanel.tsx` | One shared right-side geometry; content never occludes the chat |
| Transcript | `src/renderer/transcript/TranscriptView.tsx` | Streamdown hierarchy, anchored scrolling, foldable user turns |
| Composer | `src/renderer/composer/Composer.tsx` | Floating, continuously frosted, attachment-aware, keyboard-contained menus |
| Turn changes | `src/renderer/panels/TurnChangesCard.tsx` | Compact file summary above composer; Review opens the same diff surface |
| Settings | `src/renderer/settings/SettingsPanel.tsx` | Full-workspace section navigation, saved config, mounted Instructions draft |
| Git | `src/renderer/git/GitPanel.tsx` | Full Git content inside the shared right-side activity rail |
| Icons | `src/renderer/icons.tsx`, `src/renderer/tool-glyph.tsx` | Lucide stroke wrappers with stable sizing and labels |

## Accessibility and responsive behavior

Use semantic buttons and labeled regions, preserve keyboard reachability, and
keep hit targets usable at narrow widths and 200% zoom. Catalogs and menus trap
focus only while open, restore focus when dismissed, and expose empty/error
states. The transcript is scrollable and keyboard reachable but is not a live
region; narrow busy/idle status is the live status.

The project rail becomes a start drawer at tablet widths. The end panel becomes
an end drawer at compact widths. Dock navigation hides at the CSS `960px`
threshold, while keyboard and slash-command routes remain available. Nothing in
the responsive collapse may place a user bubble, answer, approval, or composer
behind a panel.

## Theme and style change checklist

When changing renderer presentation:

1. Add or adjust a semantic token in `src/renderer/styles.css`; keep Graphite
   fallbacks synchronized with `src/shared/themes.ts`.
2. Avoid literal component colors, hard-coded shadow stacks, and layout
   transitions.
3. Confirm no decorative section dividers or bright white selection outlines
   were introduced.
4. Check the default, light, contrast, and one alternate named theme in the
   preview harness.
5. Exercise the relevant panel, composer, transcript, narrow, reduced-motion,
   and keyboard states.
6. Update `UI.md`, `README.md`, `VERIFICATION.md`, and the relevant parity or
   acceptance entry when an interaction contract changes.
7. Run `npm run verify` and `git diff --check`; use E2E/bridge/packaged gates
   when the changed surface requires them.

## Source of truth

- Tokens and layout: `src/renderer/styles.css`
- Theme registry and palettes: `src/shared/theme-registry.ts`,
  `src/shared/themes.ts`
- Breakpoints: `src/shared/breakpoints.ts`
- Shell ownership: `src/renderer/App.tsx`
- Right-side workspace geometry: `src/renderer/App.tsx`,
  `src/renderer/git/GitPanel.tsx`, and `src/renderer/styles.css`
- Interaction contract: `UI.md`
- CLI parity: `PARITY.md`
- Acceptance and release gates: `ACCEPTANCE.md`, `VERIFICATION.md`
