# Verification

Quick gate before shipping Electron shell changes. Repo: [vbcode-electron](https://github.com/robzilla1738/vbcode-electron).

## Automated

```bash
cd ~/Code/vbcode-electron   # or your clone of this repo
npm test
npm run lint
npm run verify:source-parity
npm run typecheck
npm run build
npm run verify:bundle
npm run smoke:bridge   # requires vibe-codr dist host (sibling or VIBE_CODR_ROOT)
npm run test:e2e       # hermetic Electron host/renderer lifecycle matrix
```

Expect: Vitest green (currently 74 tests), upstream source pairs aligned,
Biome and `tsc` clean, electron-vite build and renderer bundle budget OK, and
smoke prints `ready` + `snapshot ok`. `npm run verify` runs the non-E2E subset
as one gate.

The source-parity command compares against the live sibling checkout selected
by `VIBE_CODR_ROOT` or `~/Code/vibe-codr`. Keep that checkout on the revision
expected by this repository before calling the full gate green. On 2026-07-11,
the local sibling checkout had upstream declaration drift in protocol, reducer,
rich-block, tool-icon, spinner, and theme copies; unit, lint, typecheck, and
build passed, but source parity correctly reported the mismatch. The renderer
bundle also measured 1.878 MB against the historical 1.85 MB single-chunk
budget and requires a budget/size follow-up before release.

GitHub CI repeats this gate plus Electron E2E on Linux and an unsigned bundled-host smoke on macOS. Public signing/notarization remains a release-credential step.

## UI preview (renderer-only, no engine)

```bash
npm run ui:preview                        # http://localhost:4517/?scenario=chat
npx playwright install chromium           # once
npm run ui:shots -- tools/ui-preview/shots
```

Visually sweep the scenario matrix (`welcome`, `splash`, `chat`, `busy`,
`permission`, `plan`, `gate`, `mode`, `queue`, `onboarding`, `slash`, `catalog`,
`catalog-draft`, `mention`, `jobs`, `inspector`, `toast`, `density-quiet`,
`density-verbose`, `ctx-hot`) in the
default theme, plus `&theme=light` and one accent theme (e.g.
`&theme=opencode`). Focus rings must be visible keyboard-only, overlays must
animate (and respect reduced motion), and no surface may lose theme colors.

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
10. `/theme tokyonight`; `/keys`; explicitly toggle Session; narrow the window for drawer behavior.
11. Click a user message to fold/unfold its turn; confirm no persistent arrow is rendered.
12. Confirm approval panels and output align to the composer width; inspect source cards and memory notices.
13. `/clear` mid-turn — abort + empty transcript.
14. Quit app — host finalizes (no orphan process).

Full matrix: [PARITY.md](./PARITY.md).
