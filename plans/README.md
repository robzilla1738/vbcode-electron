# Plans index

| Document | Purpose | Status |
|----------|---------|--------|
| [IMPROVEMENT-AUDIT.md](./IMPROVEMENT-AUDIT.md) | Thorough logic audit of the Electron presentation shell with prioritized, evidence-backed improvement backlog (2026-07-13, commit `c8b60f9`) | Audit complete; major in-scope items implemented on `main` through 2026-07-13 |

## Implemented from the audit (summary)

1. Host lifecycle — quit/reap/single-instance, RPC-ready gate  
2. Session correctness — Trail reset, handoff filter, busy optimism  
3. Git/config hardening — refs, porcelain `-z`, force-with-lease, 0o600  
4. Host-resolver — mtime cache + unit matrix  
5. Long-session performance — stream markdown, tool output caps  
6. Design direction — quiet dock contract (Session/Changes/Git/Jobs/Files)  

## Residual / deferred

See audit §7 and residual notes in `ACCEPTANCE.md` (credentials, engine-adjacent, intentional non-parity, fuller e2e matrix).

## Recommended follow-up (optional)

1. Visual regression CI for `ui:shots`  
2. Broader Playwright coverage (settings write, dock exclusivity)  
3. Signing / notarization when credentials exist  
