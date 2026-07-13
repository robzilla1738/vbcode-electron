# UI preview harness

Runs the real renderer in a plain browser with a mocked `window.vibe` bridge —
no Electron, no engine host — so visual states can be exercised, reviewed, and
screenshotted deterministically.

```bash
# serve the renderer with the mock bridge
npm run ui:preview

# open a scenario
open "http://localhost:4517/?scenario=chat"

# screenshot every scenario (needs `npx playwright install chromium` once)
npm run ui:shots -- tools/ui-preview/shots
```

Scenarios: `welcome`, `splash` (quiet empty home + composer), `chat`, `table`,
`docs`, `sources`, `busy`, `permission`, `plan`, `gate`, `mode`, `queue`,
`onboarding`, `slash`, `catalog`, `catalog-draft`, `mention`, `attachments`,
`jobs`, `inspector`, `toast`, `density-quiet`, `density-verbose`, `ctx-hot`,
`settings`, `git` — plus `&theme=<name>` for any registered TUI theme (e.g.
`?scenario=chat&theme=opencode`). Shots also capture `busy-narrow`, `busy-wide`,
`light`, and `theme-opencode`. `attachments` previews the dropped-image and
file-reference composer state, including Finder-style URI path fallback. The
`inspector` scenario exercises the Session panel and changed-file review flow;
`settings` remains a full-workspace tool; `git` and `inspector` exercise the
right-side activity surface. Live app chrome (not fully mirrored in every mock
scenario) also includes the workspace dock, shared Session/Changes/Git/Terminal/Jobs
activity sidebar, and turn-changes card — prefer `npm run dev` or E2E when
checking panel switching, persistent native PTY behavior, reserved chat space,
or native Finder actions.

Dev tooling only: nothing in this folder ships in the app bundle, and the mock
event timelines live entirely in `mock-vibe.ts`.
