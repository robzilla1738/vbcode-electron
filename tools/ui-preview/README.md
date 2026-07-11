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

Scenarios: `welcome`, `splash`, `chat`, `busy`, `permission`, `plan`, `slash`,
`catalog`, `mention`, `jobs`, `inspector` — plus `&theme=<name>` for any
registered TUI theme (e.g. `?scenario=chat&theme=opencode`).

Dev tooling only: nothing in this folder ships in the app bundle, and the mock
event timelines live entirely in `mock-vibe.ts`.
