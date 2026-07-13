# Vibe Codr (Electron)

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)

macOS-first **Electron** shell for [vibe-codr](https://github.com/robzilla1738/vibe-codr) with **1:1 engine parity** via the existing NDJSON `vibecodr-engine-host`. Same brain as the CLI TUI — presentation and chrome only live here.

**Repo:** [github.com/robzilla1738/vbcode-electron](https://github.com/robzilla1738/vbcode-electron)

**Visual target:** Codex / Cursor-inspired desktop shell with OpenTUI-faithful behavior — multi-project + chats rail, seamless right workspace dock (Session / Changes / Git / Jobs / Files), quiet empty home, terminal themes/accents, resizable sidebars, turn-changes card + Diff/File review, and one uniform end-panel lane for Session / Changes / Git / Jobs.

Sibling native shell: [`vbcodrmacos`](https://github.com/robzilla1738/vbcodrmacos) (SwiftUI). This repo is the Electron equivalent.

## Architecture

```
┌──────────────────┐   IPC    ┌─────────────────┐   NDJSON stdio   ┌──────────────────────┐
│ React renderer   │ ◄──────► │ Electron main   │ ◄──────────────► │ vibecodr-engine-host │
│ (OpenTUI layout) │          │ (spawn + dialog)│                  │  (@vibe/core Engine) │
└──────────────────┘          └─────────────────┘                  └──────────────────────┘
```

| Layer | Path | Role |
|-------|------|------|
| Renderer | `src/renderer/` | Transcript, composer, drag/drop attachments, slash menu, permissions, plan, themes, inspector/review |
| Preload | `src/preload/` | `window.vibe` bridge API, including native dropped-file path resolution |
| Main | `src/main/` | Host spawn, NDJSON, folder picker, clipboard image, `@` file walk |
| Shared UI logic | `src/shared/` | Ported from `@vibe/tui`: reducer, slash, themes, modes, file-fuzzy |
| Engine host | vibe-codr `packages/macos-bridge` | In-process Engine over stdio |

Config/state are **shared with the CLI**:

- Config: `~/.config/vibe-codr/config.json`
- Sessions: `~/.vibe/state`

## Requirements

- Node 22.12+ (required by the Electron 43 development runtime)
- Sibling [vibe-codr](https://github.com/robzilla1738/vibe-codr) at `~/Code/vibe-codr` **or** `VIBE_CODR_ROOT`
- Compiled host preferred:

```bash
cd ~/Code/vibe-codr && bun install && bun run build:macos-bridge
```

## Clone

```bash
git clone https://github.com/robzilla1738/vbcode-electron.git
cd vbcode-electron
```

## Dev

```bash
cd ~/Code/vibe-codr && bun run build:macos-bridge   # once / after engine changes
cd ~/Code/vbcode-electron                           # or this clone
npm install
npm run dev
```

On first open: **Open Project** (or last cwd restores automatically). Use the same providers/keys as `vibecodr`.

### UI preview (renderer only, no engine)

Renderer work doesn't need the engine host. `tools/ui-preview/` serves the real
React renderer in a plain browser with a mocked `window.vibe` bridge and
scripted session states:

```bash
npm run ui:preview                       # http://localhost:4517/?scenario=chat
npx playwright install chromium          # once, for screenshots
npm run ui:shots -- tools/ui-preview/shots
```

Scenarios: `welcome`, `splash`, `chat`, `table`, `docs`, `sources`, `busy`,
`permission`, `plan`, `gate`, `mode`, `queue`, `onboarding`, `slash`, `catalog`,
`catalog-draft`, `mention`, `attachments`, `jobs`, `inspector`, `toast`,
`density-quiet`, `density-verbose`, `ctx-hot`, `settings`, `git` — plus
`&theme=<name>` for any TUI theme. See
[tools/ui-preview/README.md](./tools/ui-preview/README.md).

### Host resolution order

1. `$VIBE_CODR_ROOT/dist/vibecodr-engine-host` when fresh against the runtime source tree (otherwise Bun source under that root)
2. `~/Code/vibe-codr` (and conventional siblings)
3. Bundled `resources/vibecodr-engine-host` (after `npm run copy-host` / pack)

## Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | electron-vite + Electron window |
| `npm run build` | Compile main / preload / renderer → `out/` |
| `npm test` | Vitest unit suite (lifecycle, protocol, security helpers, parity) |
| `npm run test:coverage` | Same suite with V8 coverage floors (shared + bridge) |
| `npm run test:e2e` | Hermetic Electron UI/IPC/bridge parity scenarios |
| `npm run lint` | Biome correctness and maintainability gate |
| `npm run verify` | Lint + unit + source parity + types + build + bundle budget |
| `npm run verify:fast` | Lint + unit + typecheck |
| `npm run verify:ci` | `verify` + coverage + bridge smoke + E2E |
| `npm run verify:source-parity` | AST drift gate against live CLI/shared/bridge sources |
| `npm run verify:bundle` | Renderer JavaScript + staged host binary budget |
| `npm run typecheck` | `tsc` for node + web projects |
| `npm run ui:preview` | Renderer in a browser with a mocked bridge (no engine) |
| `npm run ui:shots` | Headless screenshot matrix (fails non-zero on capture errors) |
| `npm run smoke:bridge` | NDJSON bootstrap → snapshot → shutdown |
| `npm run smoke:packaged` | Packaged app smoke without developer host fallback |
| `npm run copy-host` | Copy host binary into `resources/` (freshness + arch checks) |
| `npm run pack` | macOS dir build (copies host first) |
| `npm run dist` | macOS `.dmg` / distributable |

## Layout

```
┌────────────┬──────────────────────────────────────────┬────────────┐
│ Projects   │  Project / session top bar               │ Workspace  │
│ + Chats    │  Transcript / splash                     │ dock       │
│ + filter   │  Plan · permissions · queue · spinner    │ Session    │
│ Git·Settings│ Anchored composer + status + pickers    │ Changes /  │
│            │  Turn-changes card (when files edited)   │ Git / Jobs  │
│            │                                          │ Files      │
└────────────┴──────────────────────────────────────────┴────────────┘
```

- Content max ~130ch; transcript prose, tool output, approval panels, and the composer share the `--composer-max: 40rem` reading measure
- **Left rail:** collapsible Projects + Chats sections; section **+** only (add project / new chat); Git & Settings in the footer
- **Right workspace dock:** full-label Session / Changes / Git / Jobs / Files on the same `var(--bg)` as chat (no decorative divider or project header); hidden below ~960px
- **Shared end-panel lane:** Session, Changes, Git, and Jobs open fluidly in one right-side section; the main stage reserves its width so transcript, user bubbles, and composer never sit underneath it. Files remains a Finder reveal (not an in-app panel).
- Project rail and end panels resize or become drawers at responsive breakpoints; widths persist where resizing is available
- Projects and session titles come from the host's read-only `listProjects` index; Electron never parses vibe-codr state directly
- Themes via `/theme` (same 16 palettes as OpenTUI); accents via `/accent`
- Modes: **Plan / Agent / Yolo** dropdown in the composer (Shift+Tab still cycles)

### Design system

All styling is token-first in `src/renderer/styles.css` — palette variables are
written by `applyPalette` from the active TUI theme, and every other color is a
`color-mix()` derivation, so all themes (and the light scheme) work with zero
per-theme CSS. On top of the palette sit theme-independent tokens: a locked
type scale, spacing/radii, a motion system (`--ease-enter/exit/standard`,
`--dur-*`, press-down faster than release, `prefers-reduced-motion` collapse),
two-layer keyboard focus rings (`--focus-ring`), and an elevation grammar of
hairlines + inset edge-highlights at rest with layered shadows reserved for
true overlays. **Sans is the UI voice**; monospace is reserved for real code
(fenced blocks, tool/diff/job output, inline code, ASCII wordmark). Icons are
Lucide stroke wrappers in `src/renderer/icons.tsx`. The composer, transcript
output, and approval panels share one 40rem measure. The conversation pane is
edge-to-edge inside the workspace; the composer is a dense, continuously
frosted floating surface so transcript text is blurred across its full bounds
without a hard cut. Approval cards stay opaque. Queue is one quiet card above
the composer with a flat “N Queued” list and hover steer/dequeue. Slash,
mention, and catalog menus are floating and
keyboard-contained; the Session, Changes, Git, and Jobs panels open in one
explicit end-panel lane without replacing the chat surface. Project/session ⋯ menus are portal-mounted, trigger-anchored, and
toggle cleanly. User-message Copy/Edit/time actions sit **under** the bubble
(trailing-aligned); assistant actions remain below the response. Tool/thinking
rows stay compact under a `Thinking · N steps` group; open thoughts are one
quiet surface (no brain icon). Subagent rows show status without expandable
detail. User turns fold by clicking the message. Source/article results use
structured cards. Dropped images and files render as removable attachment chips
and submit as project-aware `@` references. Finder drops use native path
resolution with `file://` URI fallbacks. The Session inspector offers
changed-file review with Diff/File modes and Reveal; a turn-changes card above
the composer links into the same review. Light scheme keeps edge-lit elevation
and soft frost on floating chrome; `/accent` remaps selection and focus tokens
together. The complete token, layout, elevation, typography, panel, and
responsive contract lives in [design-system.md](./design-system.md).

## Keyboard (essentials)

| Keys | Action |
|------|--------|
| Shift+Tab | Cycle mode |
| Esc | Dismiss · deny permission · abort turn |
| y / a / ⌘P / n | Permission once · session · project · deny |
| Enter / type / Esc | Plan accept · revise · keep planning |
| ⌘Y | Accept plan + YOLO |
| ⌘O | Fold / unfold all turns |
| ⌘T | Expand / collapse thinking |
| ⌘D | Cycle density |
| ⌘G | Compose in `$VISUAL` / `$EDITOR` |
| ⌘V | Paste clipboard image as `@file` |
| ⌘K | Open slash palette |
| ⇧⌘N | Continue latest session |
| ⇧⌘I | Toggle inspector |
| `/` | Slash commands |
| `@` | Attach file (fuzzy) |

Full list: type `/keys` in the composer. See also [PARITY.md](./PARITY.md).

## Settings & onboarding

- **First-run onboarding wizard**: curated provider catalog (33 choices mirroring
  the CLI's `PROVIDER_CHOICES`), key entry with get-a-key links, base URL for
  custom endpoints, model preselect, and save → re-bootstrap
- **Full-workspace settings**: 15 sections covering every config field — Models
  (default, planning, fallbacks, reasoning, pricing/context-window overrides),
  Providers (curated dropdown + free-text), MCP Servers (stdio + remote),
  Permissions (tool/match/matchExact/action), Appearance (16 themes + accent
  swatches), Behavior (mode, approvals, sandbox, checkpoints, trust), Subagents,
  Build & Verify (recon, green gate, checks, review, worktrees, ensemble, plan
  gate), Memory, Search & Web, Compaction, Budget & Retry, Hooks, Custom
  Instructions (VIBE.md), Advanced (plugins, LSP, vision relay, verify, updates,
  goal/loop, orchestration)
- **Atomic config writes**: temp+rename so a crash mid-write can't corrupt the
  config; per-path write serialization prevents concurrent clobber
- **Pre-write validation**: URLs, enums, and numeric ranges checked before
  persisting — invalid values are rejected with a helpful error, not written
- **Deep-diff save**: only changed keys are persisted; clearing a field sends
  `null` (delete) instead of `undefined` (no-op)
- Config is shared with the CLI at `~/.config/vibe-codr/config.json`

## Security & resilience

- **Content Security Policy**: strict CSP in `index.html` (`default-src 'self'`);
  dev-mode relaxation for Vite HMR via `onHeadersReceived` only when
  `ELECTRON_RENDERER_URL` is present
- **React ErrorBoundary**: uncaught render errors show a recovery card with
  Reload instead of blanking the window
- **Application menu**: standard macOS roles (App, Edit, View, Window) plus
  app-specific actions (Open Project, Continue Latest, Settings, Git, Inspector)
- **IPC security**: all handlers assert trusted sender; context isolation +
  sandbox enabled; `nodeIntegration: false`
- **ATS**: `NSAllowsArbitraryLoads=false`, `NSAllowsLocalNetworking=true`;
  unused permission strings (camera/mic/Bluetooth) stripped in `after-pack`

## Features (shell)

Everything the TUI exposes through `EngineCommand` / `UIEvent` — tools, MCP, memory, orchestration, build gate, etc. run in the host unchanged.

Shell-owned surfaces:

- Streaming transcript (Streamdown markdown with Shiki + line numbers while generating, diffs, tools, thinking, notices)
- Permission + plan approval cards (human titles, soft chrome, deny-reason on demand)
- Slash palette (builtins + custom `commandNames`), catalog pickers (model context window shown)
- Multi-project + Chats rail (collapsible sections, + add project / new chat, resume, filter; Continue Latest via ⇧⌘N)
- Workspace dock: Session / Changes / Git / Jobs / Files on the chat surface;
  Session, Changes, Git, and Jobs share one mutually exclusive right-side lane
- Turn-changes card after file edits; Session inspector Diff/File review + Reveal
- `/jobs` drawer with live auto-follow output, localhost links, and copy
- Anchored streaming with intentional scroll disengagement and Jump to latest
- `@` fuzzy attach, clipboard image paste, external editor
- Finder drag/drop for images and files, including removable previews, mixed
  batches, duplicate detection, native path resolution, and URI fallback
- Stop control with elapsed time until `engine-idle` (Esc still interrupts); green-gate RED notice
- Session inspector closed by default; open from dock, Review, ⇧⌘I, or live chips;
  it shares the right-side lane with Changes, Git, and Jobs and does not replace
  the chat workspace
- Project rail and right-side activity panels are responsive, with persisted
  desktop widths where resize handles are present
- Theme-faithful selection colors, headings, and user-message accent (white band on Graphite; `/accent` remaps)
- Empty-home splash: quiet ASCII wordmark, centered composer, and no automatic prompt suggestions
- Project rail: rename/archive/delete on hover, titled sessions, working-only spinner for the active busy session
- Host fatal recovery: **New session** on the boot-error card
- Memory notice: quiet `Memory · N notes` disclosure with click-to-expand note details
- Sources/articles: numbered reading cards with title, domain, and snippet hierarchy
- User turns: click or keyboard-activate the message to collapse/expand; actions under the bubble
- Lucide icons across chrome, composer, and tool-row glyphs
- Accessibility: ARIA combobox pattern in composer/catalog, labeled regions, keyboard-focusable scrollable output, narrow busy/idle live status (transcript is not live), hover/focus copy and edit icons with keyboard focus (touch keeps them visible), busy-disabled rail labels, skip links to conversation/composer/projects/session panel, catalog focus trap
- App icon: `assets/icon.png` → `npm run build:icon` → `assets/icon.icns` for packaged builds; the master includes macOS-style optical safe-area padding, and the unpackaged macOS dock uses the PNG via `app.dock.setIcon`

## Parity & verification

See **[PARITY.md](./PARITY.md)** for the full CLI ↔ Electron checklist (modeled on the macOS app’s parity doc).

Manual smoke steps: **[VERIFICATION.md](./VERIFICATION.md)**. Agent notes: **[AGENTS.md](./AGENTS.md)**.

```bash
npm run verify && npm run smoke:bridge && npm run test:e2e
```

Current baseline: **259 unit tests**, **11 Electron E2E scenarios**, 19 source
parity pairs, Biome, typecheck, production build, and renderer bundle budget
pass in the current checkout. CI runs `verify` + coverage floors + bridge smoke
+ E2E on Linux and unsigned pack smoke on macOS. Prefer live `npm test` counts
over frozen numbers in prose. The deterministic preview matrix covers
attachments, settings, Git, Session review, light mode, and alternate themes.
Hardening backlog: [plans/IMPROVEMENT-AUDIT.md](./plans/IMPROVEMENT-AUDIT.md).
See [design-system.md](./design-system.md), [VERIFICATION.md](./VERIFICATION.md),
and [ACCEPTANCE.md](./ACCEPTANCE.md) for the visual contract, acceptance
contract, and release gates.

## Project layout

```
vbcode-electron/
  src/main/           # Electron main + EngineBridge + host resolver
  src/preload/        # contextBridge API
  src/renderer/       # React UI
  src/shared/         # Pure ports from vibe-codr TUI / shared contracts
  scripts/            # copy-engine-host, smoke-bridge, pack helpers
  test/               # Playwright e2e + fixtures
  tools/ui-preview/   # Browser renderer preview (mocked bridge) + screenshots
  PARITY.md
  ACCEPTANCE.md
  VERIFICATION.md
  design-system.md
  AGENTS.md
  README.md
  LICENSE
```

## Related

- Engine / CLI TUI: [vibe-codr](https://github.com/robzilla1738/vibe-codr) (`packages/macos-bridge` NDJSON host)
- Native macOS shell: [vbcodrmacos](https://github.com/robzilla1738/vbcodrmacos)
- This Electron shell: [vbcode-electron](https://github.com/robzilla1738/vbcode-electron)
