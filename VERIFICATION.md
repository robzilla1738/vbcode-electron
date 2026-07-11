# Verification

Quick gate before shipping Electron shell changes. Repo: [vbcode-electron](https://github.com/robzilla1738/vbcode-electron).

## Automated

```bash
cd ~/Code/vbcode-electron   # or your clone of this repo
npm test
npm run verify:source-parity
npm run typecheck
npm run build
npm run smoke:bridge   # requires vibe-codr dist host (sibling or VIBE_CODR_ROOT)
npm run test:e2e       # hermetic Electron host/renderer lifecycle matrix
```

Expect: Vitest green (50+), upstream source pairs aligned, `tsc` clean, electron-vite build OK, smoke prints `ready` + `snapshot ok`.

## Packaged app

```bash
npm run build:icon
npm run pack
```

Verify `release/mac-arm64/Vibe Codr.app` launches with the renderer sandbox enabled, uses `Contents/Resources/vibecodr-engine-host`, and does not require `VIBE_CODR_ROOT`. Its final plist must keep `NSAllowsArbitraryLoads=false` and omit unused camera, microphone, and Bluetooth permission strings.

## Manual (dev window)

```bash
npm run dev
```

1. Open a project (or confirm last-cwd restore).
2. Confirm projects and titled sessions load; switch projects and resume one session.
3. Submit a short prompt — stream text + tools; spinner until idle.
4. Scroll upward during streaming — output must stop following; Jump to latest restores it.
5. Shift+Tab through PLAN → AGENT → YOLO.
6. Trigger a permission (e.g. bash) — y / a / n / ⌘P.
7. `/plan …` then present_plan — Enter / Esc / ⌘Y.
8. Catalogs (TUI-faithful):
   - Type `/model clau` — live filter opens; Tab toggles main ⇄ sub; current marked.
   - `/providers` → configured provider prefills `/model id/`; unconfigured prefills `/model key id `.
   - `/agents` → agent prefills `/model agent name ` then models picker; New agent prefills without submit.
   - `/mcp` — status shows connected/disconnected · N tools (not blank).
   - `/skills` → choose prefills `/skill name ` (add args before Enter).
9. `@` file pick; ⌘V image paste → `@.vibe/clipboard/…`.
10. `/theme tokyonight`; `/keys`; ⇧⌘I inspector; narrow the window for drawer behavior.
11. `/clear` mid-turn — abort + empty transcript.
12. Quit app — host finalizes (no orphan process).

Full matrix: [PARITY.md](./PARITY.md).
