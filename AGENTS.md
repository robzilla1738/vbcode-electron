# AGENTS.md — vbcode-electron

Notes for coding agents working in this repo: [github.com/robzilla1738/vbcode-electron](https://github.com/robzilla1738/vbcode-electron).

## What this is

Electron **presentation shell** for [vibe-codr](https://github.com/robzilla1738/vibe-codr). Do **not** reimplement `@vibe/core`. Talk to the engine only via the NDJSON host protocol (`bootstrap` / `send` / `rpc` / `shutdown`) — same as `vibe-codr/packages/macos-bridge` and the Swift app in [vbcodrmacos](https://github.com/robzilla1738/vbcodrmacos).

## Hard rules

1. **No engine fork.** Features that belong in the agent loop stay in vibe-codr; this repo only renders `UIEvent`s and sends `EngineCommand`s.
2. **TUI-faithful behavior + themes.** Layout constants: content ~130ch, sidebar ~42ch, wide breakpoint ~140ch. Themes from `src/shared/themes.ts`. macOS Liquid Glass may tint chrome (rails/topbar/composer); do not replace CLI theme semantics.
3. **Busy until `engine-idle`.** Do not clear `busy` on `session-idle` / `turn-finished` alone — follow-up turns must not flicker idle.
4. **`/clear` / `/new`:** abort if busy → `clearSessionLocal()` (transcript + overlays + `suppressAfterClear`) → forward slash to engine.
5. Prefer porting pure modules from `vibe-codr/packages/tui` (`reducer`, `slash`, `modes`, `density`, `file-fuzzy`, `commands-catalog`) over rewriting behavior.

## Key paths

| Concern | File |
|---------|------|
| Host spawn + NDJSON | `src/main/engine-bridge.ts`, `host-resolver.ts` |
| IPC surface | `src/preload/index.ts` → `window.vibe` |
| Session / event wiring | `src/renderer/hooks/useSession.ts` |
| Keyboard + submit routing | `src/renderer/App.tsx` |
| Contracts | `src/shared/commands.ts`, `events.ts`, `protocol.ts` |
| Parity checklist | `PARITY.md` |

## Commands

```bash
npm run dev            # launch Electron
npm test               # unit parity tests
npm run typecheck
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

## Intentional non-parity

- OpenTUI cell grid / mouse capture
- Pixel-perfect terminal metrics
- Shipping a separate engine binary from this repo (consume vibe-codr’s)
