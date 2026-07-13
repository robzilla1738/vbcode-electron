# AGENTS.md — vbcode-electron

Notes for coding agents working in this repo: [github.com/robzilla1738/vbcode-electron](https://github.com/robzilla1738/vbcode-electron).

## What this is

Electron **presentation shell** for [vibe-codr](https://github.com/robzilla1738/vibe-codr). Do **not** reimplement `@vibe/core`. Talk to the engine only via the NDJSON host protocol (`bootstrap` / `send` / `rpc` / `shutdown`) — same as `vibe-codr/packages/macos-bridge` and the Swift app in [vbcodrmacos](https://github.com/robzilla1738/vbcodrmacos).

## Hard rules

1. **No engine fork.** Features that belong in the agent loop stay in vibe-codr; this repo only renders `UIEvent`s and sends `EngineCommand`s.
2. **TUI-faithful behavior + themes.** Layout constants: content ~130ch, sidebar ~42ch, and a shared transcript/approval/composer measure of `40rem`; wide breakpoint ~1280px (`BREAKPOINTS.wide` in `src/shared/breakpoints.ts`). Themes from `src/shared/themes.ts`. macOS Liquid Glass may tint chrome (rails/topbar/composer); do not replace CLI theme semantics.
3. **Busy until `engine-idle`.** Do not clear `busy` on `session-idle` / `turn-finished` alone — follow-up turns must not flicker idle.
4. **`/clear` / `/new`:** abort if busy → `clearSessionLocal()` (transcript + overlays + `suppressAfterClear`) → forward slash to engine.
5. Prefer porting pure modules from `vibe-codr/packages/tui` (`reducer`, `slash`, `modes`, `density`, `file-fuzzy`, `commands-catalog`) over rewriting behavior.
6. Development host resolution must reject a compiled `vibecodr-engine-host` when runtime source under the sibling checkout is newer, then fall back to Bun source execution. This prevents stale host behavior from being reported as a generic renderer failure.
7. **Workspace dock stays on the chat surface** (`var(--bg)` inside `content-inset` / `main-column`). Session, Changes, Git, and Jobs open in one mutually exclusive right-side activity lane; the main column reserves that lane instead of letting panels cover chat. Do not reintroduce a separate rail tint, decorative white section lines, or topbar duplicates of Session/Changes/Git/Jobs/Files.

## Key paths

| Concern | File |
|---------|------|
| Host spawn + NDJSON | `src/main/engine-bridge.ts`, `host-resolver.ts` (freshness-checked compiled host) |
| App icon | `assets/icon.png` → `npm run build:icon` → `assets/icon.icns`; unpackaged dock via `src/main/index.ts` |
| IPC surface | `src/preload/index.ts` → `window.vibe` |
| Native dropped-file paths | `src/preload/index.ts` → `window.vibe.getPathForFile`; `src/renderer/composer/Composer.tsx` fallback parsing |
| Session / event wiring | `src/renderer/hooks/useSession.ts` |
| Keyboard + submit routing | `src/renderer/App.tsx` |
| Composer attachments | `src/renderer/composer/Composer.tsx` |
| Project rail (Projects + Chats) | `src/renderer/layout/ProjectRail.tsx`, `src/shared/project-index.ts` |
| Workspace dock | `src/renderer/layout/WorkspaceDock.tsx` |
| Turn changes card | `src/renderer/panels/TurnChangesCard.tsx` |
| Changed files / diff view | `src/shared/changed-files.ts`, `diff-view.ts` |
| Resizable rails | `src/renderer/layout/SidebarResizeHandle.tsx` |
| Session review | `src/renderer/panels/Inspector.tsx` |
| Boot / fatal New session | `src/renderer/layout/WelcomeGate.tsx` |
| Icons (Lucide wrappers) | `src/renderer/icons.tsx`, `tool-glyph.tsx` |
| Contracts | `src/shared/commands.ts`, `events.ts`, `protocol.ts` |
| Breakpoints | `src/shared/breakpoints.ts` (`wide` JS-only; laptop→narrow sync CSS `@media`) |
| Settings panel | `src/renderer/settings/SettingsPanel.tsx`, sections in `src/renderer/settings/sections/` |
| Instructions dirty mount | `InstructionsSection.tsx` + keep-mounted in `SettingsPanel.tsx`; `settings-instructions-mount.test.ts` |
| Settings load guard | `src/shared/settings-load-guard.ts` |
| Git panel | `src/renderer/git/GitPanel.tsx` |
| Config I/O (JSONC read/write) | `src/shared/config-io.ts`, `config-schema.ts` |
| Config diff patch builder | `src/shared/config-diff.ts` |
| Config pre-write validation | `src/shared/config-validate.ts` |
| Provider catalog (onboarding) | `src/shared/providers-catalog.ts` |
| Onboarding modal (first-run) | `src/renderer/panels/OnboardingModal.tsx` |
| Error boundary | `src/renderer/ErrorBoundary.tsx` |
| Application menu + dev CSP | `src/main/index.ts` |
| Git operations | `src/shared/git-ops.ts`, `git-types.ts` |
| Config + git IPC | `src/main/config-ipc.ts`, `git-ipc.ts`, `ipc-security.ts` |
| Parity checklist | `PARITY.md` |
| UI contract | `UI.md` |

## Commands

```bash
npm run dev            # launch Electron
npm test               # unit tests (Vitest)
npm run typecheck
npm run verify         # lint + unit + source-parity + typecheck + build + bundle
npm run test:e2e       # Playwright Electron harness (10 scenarios)
npm run ui:preview     # renderer in a browser, mocked window.vibe (no engine)
npm run ui:shots       # headless screenshots of every preview scenario
npm run smoke:bridge   # host NDJSON smoke (needs vibe-codr dist host)
npm run copy-host      # embed host for pack
```

Engine host (sibling):

```bash
cd ~/Code/vibe-codr && bun run build:macos-bridge
```

## When changing UI behavior

- Mirror TUI `packages/tui/src/app.tsx` semantics first; then macOS `PARITY.md` for GUI-adapted cases.
- Update `PARITY.md` checkboxes when you close a gap.
- Add a Vitest case in `src/shared/parity.test.ts` (or adjacent `*.test.ts`) for pure logic.
- Keep interaction contracts current:
  - Session inspector is explicitly toggled (dock / ⇧⌘I / Review); not auto-opened on send.
  - Project menus: rename/archive/delete; subagent rows are static status summaries.
  - User turns fold from the message itself; **user Copy/Edit/time sit under the bubble**; assistant Copy stays below assistant output.
  - Finder drops resolve native paths with URI/plain-text fallback.
  - Changed files: turn card + Diff/File review + Reveal.
  - Desktop rails resize with pointer/keyboard and persisted widths.
  - Workspace dock: Session / Changes / Git / Jobs / Files on the chat surface.
  - End-panel geometry: Session / Changes / Git / Jobs share the same right-side
    activity rail; switching views must not replace the chat workspace or change
    the conversation scroll position. Local and Files are Finder actions.
  - Custom Instructions stay mounted (hidden) across settings section switches.

## When changing UI presentation (design system)

All renderer styling lives in `src/renderer/styles.css`, token-first. The
canonical visual reference is [design-system.md](./design-system.md). Keep it,
`UI.md`, `README.md`, `VERIFICATION.md`, and the relevant parity/acceptance rows
current whenever layout, styling, or interaction contracts change.

Rules:

1. **No literal hex outside `:root` fallbacks.** Every color is `var(--token)`
   or a `color-mix(in oklab, var(--token) …)` derivation so all TUI themes and
   the light scheme keep working. The `:root` fallback values mirror the
   Graphite default in `src/shared/themes.ts` (first paint must match what
   `applyPalette` writes) — keep them in sync if the default palette changes.
2. **Motion is tokenized and property-scoped.** Use `--ease-enter/exit/standard`
   and `--dur-micro/fast/standard/moderate`; transition only
   transform / opacity / color / box-shadow (never layout); press-down is a
   fast 60ms; the global `prefers-reduced-motion` collapse must keep working.
3. **Focus is keyboard-only and two-layer.** Use `--focus-ring` via
   `:focus-visible`; inputs whose wrapper carries the focus treatment opt out.
4. **Elevation grammar.** Resting surfaces: hairline border + `--edge-highlight`
   (light scheme uses a stronger `--edge-lit` inset so white surfaces still read
   raised). Real layered shadows (`--shadow-menu`,
   `--shadow-modal`) only on true overlays. Menus/popovers sit on `--overlay`.
   Light floating chrome may use soft frost; the shell stays opaque to avoid
   desktop wash. The composer’s frost must cover its full surface so transcript
   text never remains readable through the top edge.
5. **Sans is the UI voice; mono is code.** Electron chrome (tool headers,
   paths, model/metrics, kbd chips, section labels, thinking/notices) uses
   `--font-sans`. Reserve `--font-mono` for real code: fenced blocks, inline
   `` `code` ``, tool/diff/job output bodies, ASCII wordmark, and rich chart
   glyphs. (TUI still uses mono machine-voice labels in the CLI.)
6. **Verify visually with the preview harness** (no engine needed):
   `npm run ui:preview`, then `?scenario=welcome|splash|chat|table|docs|sources|busy|permission|plan|gate|mode|queue|onboarding|slash|catalog|catalog-draft|mention|attachments|jobs|inspector|toast|density-quiet|density-verbose|ctx-hot`
   plus `settings` and `git`; plus `&theme=<name>`; `npm run ui:shots` captures the matrix headlessly
   (`npx playwright install chromium` once). Screenshot before/after when
   touching shared primitives.

## Intentional non-parity

- OpenTUI cell grid / mouse capture
- Pixel-perfect terminal metrics
- Shipping a separate engine binary from this repo (consume vibe-codr’s)
