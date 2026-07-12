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

Expect: Vitest green (currently 76 tests), Playwright Electron E2E green (10
scenarios), upstream source pairs aligned,
Biome and `tsc` clean, electron-vite build and renderer bundle budget OK, and
smoke prints `ready` + `snapshot ok`. `npm run verify` runs the non-E2E subset
as one gate.

The source-parity command compares against the live sibling checkout selected
by `VIBE_CODR_ROOT` or `~/Code/vibe-codr`. Keep that checkout on the revision
expected by this repository before calling the full gate green. On 2026-07-12, source parity was fixed: the parity script now allows
intentional Electron-specific additions (reducer isMarkdown, density isMarkdown
check, tool-icons permission functions, themes Electron palette, protocol
encodeInbound) and normalizes whitespace to avoid false formatting drift.
Formatting in markdown-blocks, rich-blocks, and spinner was synced to match
upstream exactly. The renderer bundle measures 1.879 MB against the historical
1.85 MB single-chunk budget and requires a budget/size follow-up before release.

GitHub CI repeats this gate plus Electron E2E on Linux and an unsigned bundled-host smoke on macOS. Public signing/notarization remains a release-credential step.

## UI preview (renderer-only, no engine)

```bash
npm run ui:preview                        # http://localhost:4517/?scenario=chat
npx playwright install chromium           # once
npm run ui:shots -- tools/ui-preview/shots
```

Visually sweep the scenario matrix (`welcome`, `splash`, `chat`, `table`,
`docs`, `sources`, `busy`, `permission`, `plan`, `gate`, `mode`, `queue`,
`onboarding`, `slash`, `catalog`, `catalog-draft`, `mention`, `jobs`,
`inspector`, `toast`, `density-quiet`, `density-verbose`, `ctx-hot`) in the
default theme, plus `&theme=light` and one accent theme (e.g.
`&theme=opencode`). Focus rings must be visible keyboard-only, overlays must
animate (and respect reduced motion), and no surface may lose theme colors.
Confirm queue is one card above the composer, Copy/Edit actions are clean white
icons without filled backgrounds, scrollbars stay overlay-only, the chat pane
reaches its workspace edges, and the composer’s continuous frost fully blurs
text that scrolls underneath, including at the top edge.

## Packaged app

```bash
npm run build:icon   # assets/icon.png → assets/icon.icns
npm run pack
```

Verify `release/mac-arm64/Vibe Codr.app` launches with the renderer sandbox enabled, uses `Contents/Resources/vibecodr-engine-host`, shows the optically padded VC app icon at a comparable size to neighboring macOS icons in Dock/Finder, and does not require `VIBE_CODR_ROOT`. Its final plist must keep `NSAllowsArbitraryLoads=false` and omit unused camera, microphone, and Bluetooth permission strings.

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
13. Approve a permission request for a background `npm run dev`; confirm the job starts, the host remains healthy, and the session does not show a generic host-exited failure.
14. Hover an assistant response — confirm clean white Copy/Edit icons appear below it; inspect a subagent row — confirm spinner/check status and no detail expansion.
15. `/clear` mid-turn — abort + empty transcript.
16. Quit app — host finalizes (no orphan process).

Full matrix: [PARITY.md](./PARITY.md).
