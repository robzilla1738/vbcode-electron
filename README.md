# Vibe Codr (Electron)

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)

macOS-first **Electron** shell for [vibe-codr](https://github.com/robzilla1738/vibe-codr) with **1:1 engine parity** via the existing NDJSON `vibecodr-engine-host`. Same brain as the CLI TUI — presentation and chrome only live here.

**Repo:** [github.com/robzilla1738/vbcode-electron](https://github.com/robzilla1738/vbcode-electron)

**Visual target:** Codex Desktop-inspired workspace with OpenTUI-faithful behavior — a multi-project rail, centered transcript, anchored composer, terminal themes/accents, and a live activity rail at wide widths.

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
| Renderer | `src/renderer/` | Transcript, composer, slash menu, permissions, plan, themes, inspector |
| Preload | `src/preload/` | `window.vibe` bridge API |
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

Scenarios: `welcome`, `splash`, `chat`, `busy`, `permission`, `plan`, `slash`,
`catalog`, `mention`, `jobs`, `inspector` — plus `&theme=<name>` for any TUI
theme. See [tools/ui-preview/README.md](./tools/ui-preview/README.md).

### Host resolution order

1. `$VIBE_CODR_ROOT/dist/vibecodr-engine-host` (or Bun source under that root)
2. `~/Code/vibe-codr` (and conventional siblings)
3. Bundled `resources/vibecodr-engine-host` (after `npm run copy-host` / pack)

## Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | electron-vite + Electron window |
| `npm run build` | Compile main / preload / renderer → `out/` |
| `npm test` | Vitest parity, lifecycle, and editor-compose tests (50+) |
| `npm run test:e2e` | Hermetic Electron UI/IPC/bridge parity scenarios |
| `npm run verify:source-parity` | AST drift gate against live CLI/shared/bridge sources |
| `npm run typecheck` | `tsc` for node + web projects |
| `npm run ui:preview` | Renderer in a browser with a mocked bridge (no engine) |
| `npm run ui:shots` | Headless screenshot matrix of every preview scenario |
| `npm run smoke:bridge` | NDJSON bootstrap → snapshot → shutdown |
| `npm run copy-host` | Copy host binary into `resources/` |
| `npm run pack` | macOS dir build (copies host first) |
| `npm run dist` | macOS `.dmg` / distributable |

## Layout

```
┌────────────┬──────────────────────────────────────────┬─────────────┐
│ Projects  │  Project / session top bar               │ Live /      │
│ + sessions│  Transcript / splash / jobs              │ Inspector   │
│ + filter  │  Plan · permissions · queue · spinner    │ (⇧⌘I)       │
│           │  Anchored composer + status + pickers    │             │
└────────────┴──────────────────────────────────────────┴─────────────┘
```

- Content max ~130ch with a ~76ch reading measure; live activity appears only when the window can seat it without crushing the transcript
- Projects and meaningful session titles come from the host's read-only `listProjects` index; Electron never parses vibe-codr state directly
- Themes via `/theme` (same 15 palettes as OpenTUI); accents via `/accent`
- Modes: **PLAN / AGENT / YOLO** (Shift+Tab)

### Design system

All styling is token-first in `src/renderer/styles.css` — palette variables are
written by `applyPalette` from the active TUI theme, and every other color is a
`color-mix()` derivation, so all themes (and the light scheme) work with zero
per-theme CSS. On top of the palette sit theme-independent tokens: a locked
type scale, spacing/radii, a motion system (`--ease-enter/exit/standard`,
`--dur-*`, press-down faster than release, `prefers-reduced-motion` collapse),
two-layer keyboard focus rings (`--focus-ring`), and an elevation grammar of
hairlines + inset edge-highlights at rest with layered shadows reserved for
true overlays. Monospace is the voice of the machine (tool rows, paths, model,
metrics, section labels); prose stays sans. The composer carries a Codex-style
context-window gauge (amber ≥ 80%, red ≥ 95%).

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

## Features (shell)

Everything the TUI exposes through `EngineCommand` / `UIEvent` — tools, MCP, memory, orchestration, build gate, etc. run in the host unchanged.

Shell-owned surfaces:

- Streaming transcript (Streamdown markdown while generating, diffs, tools, thinking, notices)
- Permission + plan approval cards, prompt queue steer/dequeue
- Slash palette (builtins + custom `commandNames`), catalog pickers
- Multi-project sessions rail (new / resume / continue latest / filter), `/jobs`
- Anchored streaming with intentional scroll disengagement and Jump to latest
- `@` fuzzy attach, clipboard image paste, external editor
- Working spinner until `engine-idle`; green-gate RED notice
- Inspector: context, changed files, checkpoints, DAG, subagent stream

## Parity & verification

See **[PARITY.md](./PARITY.md)** for the full CLI ↔ Electron checklist (modeled on the macOS app’s parity doc).

Manual smoke steps: **[VERIFICATION.md](./VERIFICATION.md)**. Agent notes: **[AGENTS.md](./AGENTS.md)**.

```bash
npm test && npm run typecheck && npm run build && npm run smoke:bridge
```

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
  AGENTS.md
  README.md
  LICENSE
```

## Related

- Engine / CLI TUI: [vibe-codr](https://github.com/robzilla1738/vibe-codr) (`packages/macos-bridge` NDJSON host)
- Native macOS shell: [vbcodrmacos](https://github.com/robzilla1738/vbcodrmacos)
- This Electron shell: [vbcode-electron](https://github.com/robzilla1738/vbcode-electron)
