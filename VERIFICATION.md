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

Expect: Vitest green (currently **174** tests), Playwright Electron E2E green
(**10** scenarios), all 19 upstream source pairs aligned, Biome and `tsc` clean,
electron-vite build and renderer bundle budget OK, and smoke prints `ready` +
`snapshot ok`. `npm run verify` runs the non-E2E subset as one gate.

The source-parity command compares against the live sibling checkout selected
by `VIBE_CODR_ROOT` or `~/Code/vibe-codr`. Keep that checkout on the revision
expected by this repository before calling the full gate green. The parity
script allows intentional Electron-specific additions and normalizes
whitespace to avoid false formatting drift. On the current checkout, all 19
source pairs pass and the renderer bundle is within its configured budget.

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
`attachments`, `inspector`, `settings`, `git`, `toast`, `density-quiet`,
`density-verbose`, `ctx-hot`) in the default theme, plus `&theme=light` and one accent theme (e.g.
`&theme=opencode`). Focus rings must be visible keyboard-only, overlays must
animate (and respect reduced motion), and no surface may lose theme colors.
Confirm queue is one card above the composer, Copy/Edit actions are clean white
icons without filled backgrounds, scrollbars stay overlay-only, the chat pane
reaches its workspace edges, and the composer’s continuous frost fully blurs
text that scrolls underneath, including at the top edge. Confirm the
attachments scenario accepts images/files, the Session panel opens changed
files in Diff/File mode, metadata uses the primary sans font, and rail resize
handles respond to pointer and keyboard input. Confirm the right workspace dock
matches the chat background (no decorative divider/project header), Projects/Chats
headers collapse, and user-message actions appear under the bubble on hover.
Open Session, Changes, Git, and Jobs in turn; each must use the same right-side
activity lane, reserve space in the main stage, preserve the conversation
position, and close without a full-workspace jump. Local and Files should open
Finder actions rather than an in-app replacement view.

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
3. Submit a short prompt — stream text + tools; the project rail spinner appears
   only on the active listed session while AI is working, spins continuously,
   and disappears at idle.
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
10. `/theme tokyonight`; `/keys`; open Session from the workspace dock (or ⇧⌘I);
    switch through Changes, Git, and Jobs without leaving the chat surface;
    narrow the window for drawer behavior (dock hides below ~960px; `/jobs`
    still works).
11. Click a user message to fold/unfold its turn; confirm no persistent arrow is rendered;
    hover the bubble — Copy/Edit/time appear **under** it (not beside).
12. Confirm approval panels and output align to the composer width; inspect source
    cards, the collapsed `Memory · N notes` row, and its expanded note list.
13. Expand a Thinking group — compact steps, no brain icon, one surface per open
    thought; tool rows stay expandable for output.
14. Approve a permission request for a background `npm run dev`; confirm the job starts, the host remains healthy, and the session does not show a generic host-exited failure.
15. Hover an assistant response — confirm clean white Copy/Edit icons appear below it; inspect a subagent row — confirm spinner/check status and no detail expansion.
16. `/clear` mid-turn — abort + empty transcript.
17. Quit app — host finalizes (no orphan process).
18. Drag one image and one file from Finder onto the composer; confirm both
    become removable chips, image previews render, spaces in names survive, and
    submit references the project-aware paths.
19. Drop the same Finder file twice; confirm only one chip is retained and the
    duplicate toast appears only for the second drop.
20. Open Session from the dock, select a changed file, switch Diff/File, use Reveal,
    switch to Git and Jobs, and drag the project rail and activity-panel handles;
    verify keyboard Arrow/Home/End resizing and width persistence after reopening.
21. After an agent edit turn, confirm the turn-changes card and dock Changes meta;
    open Review and land on Diff mode.
22. Kill/fatal the host (or `fixture:fatal` in e2e) — **New session** recovers;
    Settings → Instructions: switch sections without losing unsaved VIBE.md text.

Full matrix: [PARITY.md](./PARITY.md).
