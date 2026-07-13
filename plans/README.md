# Plans index

| Document | Purpose | Status |
|----------|---------|--------|
| [IMPROVEMENT-AUDIT.md](./IMPROVEMENT-AUDIT.md) | Thorough logic audit of the Electron presentation shell with prioritized, evidence-backed improvement backlog (2026-07-13, commit `c8b60f9`) | Complete (analysis only; no implementation) |

## Recommended follow-up plan order (when implementing)

1. Host lifecycle (quit/orphan/stop/`isRunning`)
2. Session correctness (Trail, sessionId handoff, optimistic busy)
3. Git/config hardening
4. Host-resolver perf + unit tests
5. Long-session performance
6. Test/docs honesty + e2e coverage for dock/settings/git
7. Packaging maturity (freshness, signing, updates)

See audit §8 for dependencies and §7 for out-of-scope items.
