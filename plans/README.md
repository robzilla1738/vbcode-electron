# Plans index

| Document | Purpose | Status |
|----------|---------|--------|
| [IMPROVEMENT-AUDIT.md](./IMPROVEMENT-AUDIT.md) | Verified improvement backlog; residual §§1–5 implemented 2026-07-13 | In-scope residual closed; credential/engine-adjacent deferred |
| [DESIGN-POLISH-AUDIT.md](./DESIGN-POLISH-AUDIT.md) | Visual/interaction polish inventory (layout, motion, focus, type, responsive) | Implemented — all 62 findings dispositioned; terminal/sidebar follow-up complete |

## Implemented (this pass)

1. Host quit-during-bootstrap preemption + process-group kill + stdin write queue (epoch-safe drain)  
2. Busy-rule send-failure policy (mid-turn incidental send)  
3. File read realpath + byte cap; gh/git capture caps; cwd allowlist after successful bootstrap  
4. Renderer: catalog cancel, /jobs exclusivity, streaming plain markdown, session memo, block retention, density toast after send  
5. CI: `test:coverage` + `smoke:bridge` in workflow/`verify:ci`; preload key contract; dock e2e; docs honesty  
6. UI polish: structural five-view activity sidebar, persistent project PTY,
   compact terminal typography, invariant ASCII wordmark, quiet transcript
   notices, diff/plan/task spacing, and project-rail interaction cleanup

## Still deferred

- Apple signing / notarization / live auto-update (credentials)  
- Engine-adjacent: edit-resubmit protocol, host protocol version, shared Zod  
- Optional: true list virtualization, Biome format enable, macOS full e2e matrix  

## Verification snapshot (2026-07-13)

269 unit tests, 12 e2e scenarios, typecheck green. See root `VERIFICATION.md` / `ACCEPTANCE.md`.
