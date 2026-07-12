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

## Key paths

| Concern | File |
|---------|------|
| Host spawn + NDJSON | `src/main/engine-bridge.ts`, `host-resolver.ts` (freshness-checked compiled host) |
| App icon | `assets/icon.png` → `npm run build:icon` → `assets/icon.icns`; unpackaged dock via `src/main/index.ts` |
| IPC surface | `src/preload/index.ts` → `window.vibe` |
| Session / event wiring | `src/renderer/hooks/useSession.ts` |
| Keyboard + submit routing | `src/renderer/App.tsx` |
| Icons (Lucide wrappers) | `src/renderer/icons.tsx`, `tool-glyph.tsx` |
| Contracts | `src/shared/commands.ts`, `events.ts`, `protocol.ts` |
| Breakpoints | `src/shared/breakpoints.ts` (`wide` JS-only; laptop→narrow sync CSS `@media`) |
| Parity checklist | `PARITY.md` |
| UI contract | `UI.md` |

## Commands

```bash
npm run dev            # launch Electron
npm test               # unit parity tests
npm run typecheck
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
- Add a Vitest case in `src/shared/parity.test.ts` for pure logic (slash, reducer, fuzzy, chrome-seed).
- Keep interaction contracts current: the Session inspector is explicitly toggled, project menus support rename/archive/delete, subagent rows are static status summaries, and user turns fold from the message itself.

## When changing UI presentation (design system)

All renderer styling lives in `src/renderer/styles.css`, token-first. Rules:

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
   `npm run ui:preview`, then `?scenario=welcome|splash|chat|table|docs|sources|busy|permission|plan|gate|mode|queue|onboarding|slash|catalog|catalog-draft|mention|jobs|inspector|toast|density-quiet|density-verbose|ctx-hot`
   plus `&theme=<name>`; `npm run ui:shots` captures the matrix headlessly
   (`npx playwright install chromium` once). Screenshot before/after when
   touching shared primitives.

## Intentional non-parity

- OpenTUI cell grid / mouse capture
- Pixel-perfect terminal metrics
- Shipping a separate engine binary from this repo (consume vibe-codr’s)
