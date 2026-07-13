# vbcode-electron — verified improvement backlog (post-implementation)

**Date:** 2026-07-13  
**Commit base audited:** `2dc10e0`
**Implementation pass:** public-release logic and distribution hardening (this tree)
**Scope:** Electron presentation shell only (main · preload · renderer · shared · scripts/tests/docs)

This document is the living backlog. **Open residual** items are only those still deferred with an explicit label (engine-adjacent, credential-gated, or intentional non-goal). Everything else from the prior residual list is in the **Fixed inventory**.

---

## Executive summary

The shell now closes the residual hardening gaps from the prior re-audit and
the public-release pass:

1. **Lifecycle** — `disposeForQuit` preempts bootstrap waiters; process-group kill; ownership retained if unreaped after SIGKILL wait.
2. **Security** — byte-capped + realpath file reads; `gh` capture caps; cwd allowlist for git/config/fs; clipboard text cap; config/memory read caps; editor draft cap.
3. **Busy rule** — failed incidental `send` no longer clears mid-turn busy.
4. **Long-session** — retained block ceiling; plain streaming markdown; file-diff line caps; stabilized session API memo.
5. **Test/CI** — coverage + `smoke:bridge` in CI/`verify:ci`; preload↔mock key contract; expanded unit net; dock e2e case; `ui:shots` fails non-zero.
6. **Config/MCP parity** — all 40 engine fields are represented; engine ranges,
   structural types, remote endpoints, OAuth, and queue timeouts are rejected
   before an invalid file can be persisted.
7. **Bounded state** — project file lookup uses a 32-entry TTL/LRU; settled
   config write chains are evicted; config writes share the reader's 2 MB cap;
   delayed process-kill timers are cancelled after child exit.
8. **Release supply chain** — engine source is commit-locked, GitHub Actions are
   SHA-pinned, unsigned smoke and signed public builds are separate, and tags run
   sign/notarize/Gatekeeper/stapler/checksum verification before publishing.

| Tier | Residual open | Status |
|------|---------------|--------|
| **P0–P3 shell fixes** | 0 in-scope | **Closed** this pass |
| **Credential-gated** | execution of signing/notarization workflow | Implemented; run requires Apple credentials |
| **Engine-adjacent** | edit-resubmit, host protocol version emit | Labeled; shell exposes `getShellInfo` only |
| **Intentional non-goals** | OpenTUI grid, job-kill UI, plugin store, etc. | Not shell bugs |

---

## Hard constraints (do not violate)

| Constraint | Implication |
|------------|-------------|
| No engine fork | Engine-adjacent items stay labeled |
| Busy until `engine-idle` | Incidental send failure must not clear mid-turn busy (`shouldClearBusyOnSendFailure`) |
| Dock mutual exclusivity | `/jobs` routes through `openWorkspaceDock("jobs")` |
| TUI-faithful slash/mode | Prefer pure ports from vibe-codr TUI |

---

# Fixed inventory (implementation pass)

| Finding | Evidence |
|---------|----------|
| P0 disposeForQuit bootstrap preemption | `engine-bridge.ts` preempts `startRequest`+waiters before schedule; test never-ready reaped &lt;5s |
| P1 fs:readTextFile full-file read | `readTextFileCapped` + `path-safe` realpath (`capped-read.ts`, `path-safe.ts`) |
| P1 symlink escape | `resolvePathInsideRoot` realpath containment |
| P1 spawnGh unbounded | `stream-cap` in `git-ipc.ts` |
| P2 arbitrary cwd | `cwd-allowlist` after **successful** bootstrap + dialog open + git/config/fs/clipboard |
| P2 clipboard text uncapped | 2 MiB cap in `index.ts` |
| P2 config/memory reads unbounded | size gates in `config-io.ts` |
| P2 unreaped after SIGKILL | ownership retained if still alive (`stopCurrent`) |
| P2 process-group kill | detached spawn + `process.kill(-pid)` on POSIX |
| P2 listFiles main-thread stalls/growth | 5s TTL, 32-entry LRU `listProjectFilesCached` |
| P2 second-instance null window | `createWindow()` when `!mainWindow` |
| P2 crash reporter | local-only `crashReporter.start` (no upload) |
| P2 unsigned public artifacts | Signed/notarized tag workflow with Gatekeeper, stapler, and checksum verification |
| P1 config schema drift | `verify:config-shape` compares all 40 top-level engine fields; CI uses `ENGINE_COMMIT` |
| P1 engine-invalid Settings writes | Authoritative range/type checks, MCP/OAuth validation, queue timeout field, and regression tests |
| P2 config write growth | 2 MB symmetric read/write cap + settled write-chain eviction |
| P2 project file cache growth | Bounded 32-entry TTL/LRU + unit test |
| P3 stale kill timers | SIGKILL escalation timers are cancelled on child error/close/exit |
| P2 project config path disclosure | `config:projectPath` now enforces the bootstrap cwd allowlist |
| P1 clean-install Electron race | `postinstall` prefetches Electron 43 before native rebuild/tests, preventing parallel lazy-download extraction races |
| P3 dialog mainWindow! | null-safe `showOpenDialog` |
| P3 stdin backpressure | real `StdinWriteQueue` serializes writes behind drain |
| P3 editor draft uncapped | 2 MiB reject before compose |
| P1 preload↔mock contract | `vibe-api-keys.ts` + unit test + full mock key list |
| P2 shell version surface | `getShellInfo` IPC + preload |
| P1 send clears busy always | `shouldClearBusyOnSendFailure` in `useSession` |
| P1 catalog stuck loading | clear loading picker on cancel |
| P1 BlockView memo defeated | `useMemo` session API + stable setBusy |
| P1 transcript unbounded | `MAX_RETAINED_BLOCKS` cap in `reduceTxCapped` |
| P2 /jobs exclusivity | `classifySubmitLine` → `openWorkspaceDock("jobs")` |
| P2 plan accept busy | `setBusy(true)` on accept/edit |
| P2 Git Esc from fields | no capture-close while typing |
| P2 Streamdown every flush | `StreamingPlain` (no Streamdown while streaming) |
| P2 onFatal handoff | `bootstrapHandoff.current = false` |
| P2 host-down binary | soft ErrorBoundary recover + existing New session (auto-reconnect left optional) |
| P2 edit-resubmit | **Engine-adjacent** — intentional prefill-only until protocol |
| P2 clear/idle sequencing | suppress gate remains; optional idle wait not required for TUI parity |
| P3 focus traps | `useFocusTrap` on Keys + Onboarding |
| P3 density toast | toast only after successful send (⌘D **and** composer chip) |
| P3 dual menu subs | single `onMenuAction` router |
| P3 ErrorBoundary reload only | Try again (soft) + Reload window |
| P3 Esc non-composer | end-panel Esc closes lane |
| P3 App god-module | `classifySubmitLine` pure extract + tests |
| P2 validateConfig holes | budget/retry/goal/loop/permissions/build.gate/review + env URL |
| P2 file-changed diffs unbounded | 4k line cap in reducer |
| P2 hardening unit coverage | validated write, memory oversize, 0o600 tests |
| P3 config-diff JSON.stringify | structural `deepEqual` |
| P3 modelCatalogOptions current | `current` flag + secondary marker |
| P3 JSONC unclosed comment | throw on unclosed block |
| P3 protocol default true | exhaustive maps already `satisfies`; residual low-risk |
| P3 source-parity allowlists | kept as intentional drift alarm + parity tests |
| P1 e2e product gaps | dock exclusivity scenario added |
| P1 coverage not in CI | `test:coverage` in CI + `verify:ci` |
| P1 smoke:bridge outside CI | CI quality job + `verify:ci` |
| P1 UI unit holes | pure helpers + busy/routing/path/stream tests |
| P1 e2e order coupling | dock test additive; full isolation deferred low-value |
| P1 ui:shots non-failing | `process.exitCode = 1` on failures |
| P2 copy-host arch | `file(1)` arch check on darwin |
| P2 smokes orphan assert | disposeForQuit unit tests cover reap |
| P2 bundle/host budget | existing check-bundle-size host budget |
| P2 CI mac e2e | pack smoke remains mac; full e2e on Linux (cost trade-off) |
| P2 docs complete overclaim | ACCEPTANCE status wording fixed |
| P3 biome formatter | left off (large churn); lint still gated |

---

# 1. Main process

### Residual open

None in-scope. The public tag workflow is implemented; executing it remains
credential-gated. Local crashReporter is on without upload.

---

# 2. Preload

### Residual open

None. `getShellInfo` provides shell version + launch description. Host protocol version remains **engine-adjacent**.

---

# 3. Renderer

### Residual open

| Item | Label |
|------|-------|
| Edit message resubmit | **Engine-adjacent** (prefill-only intentional until protocol) |
| Full list virtualization | Partially addressed via block retention cap + plain stream; true window virtualization is optional polish (D1) |
| Host auto-reconnect dual-host safe | Optional continuity (D2); manual New/Retry remains |

---

# 4. Shared pure modules

### Residual open

| Item | Label |
|------|-------|
| Source-parity large allowlists | Intentional alarm; behavioral parity tests remain |

---

# 5. Packaging, scripts, CI, tests, docs

### Residual open

| Item | Label |
|------|-------|
| Execute signed/notarized release | **Credential-gated**, workflow implemented |
| Nightly real-host e2e | Engine-adjacent CI pin |
| Biome formatter enable | Optional DX (large reformat) |
| macOS full e2e matrix | Cost trade-off; pack smoke covers host path |

---

# 6. Industry-leading product direction

D1–D5 remain **options** beyond the residual fix list. Partial delivery: long-session caps, security posture, verification depth (coverage + bridge smoke + dock e2e).

---

# 7. Scope honesty

## Engine-adjacent
- Edit/regenerate turn protocol  
- Host protocol version emission  
- Snapshot-native full diff map  
- Real-host e2e pin  

## Intentional non-goals
OpenTUI grid, mouse capture, engine reimplementation, plugin install UI, job-kill, interactive DAG, subagent drill-in, full Liquid Glass themes.

## Deferred / credential-gated
- Running the implemented public release workflow requires Apple credentials

---

# 8. Recommended execution order

**Completed** for in-scope residual. Next optional product work is
virtualization polish or engine protocol coordination; neither is release debt.

---

# 9. Layer inventory

| Layer | Paths | Status |
|-------|-------|--------|
| Main | `src/main/engine-bridge.ts`, `src/main/host-resolver.ts`, `src/main/index.ts`, `src/main/ipc-security.ts`, `src/main/git-ipc.ts`, `src/main/config-ipc.ts` | Hardened |
| Preload | `src/preload/index.ts`, `src/shared/vibe-api-keys.ts` | Contract tested |
| Renderer | `src/renderer/hooks/useSession.ts`, `src/renderer/App.tsx`, MarkdownView, Git, overlays | Hardened |
| Shared | `src/shared/git-ops.ts`, `src/shared/config-io.ts`, `src/shared/protocol.ts`, `src/shared/reducer.ts`, path-safe, stream-cap, busy policy | Tested |
| Tests/CI | `test/e2e/harness.spec.ts`, vitest, CI coverage+smoke:bridge | Enforced |
| Contracts | `AGENTS.md`, `PARITY.md`, `UI.md`, `ACCEPTANCE.md` | Honest residual tags |

---

# 10. Spot-check anchors (post-fix)

| Claim | Anchor | Result |
|-------|--------|--------|
| dispose preempts waiters | `engine-bridge.ts` disposeForQuit | Fixed |
| failed send mid-turn busy | `busy-on-send-failure.ts` | Fixed |
| realpath + capped read | `path-safe.ts`, `capped-read.ts` | Fixed |
| gh capture cap | `git-ipc.ts` + `stream-cap` | Fixed |
| coverage in CI | `.github/workflows/ci.yml` | Fixed |
| StreamingPlain | `MarkdownView.tsx` | Fixed |

---

# 11. How verification was done

1. One-item-at-a-time implementation with unit tests on real exports.  
2. Full `npm test` (289) + `npm run typecheck`.
3. Structural audit test + vibe-api-keys + busy/path/stream caps.  
4. CI/release YAML parsed; actions and engine commit pinned.
5. Clean locked-engine archive passed source/config parity, native host build,
   unsigned package, bundled-host boot, restore/command smoke, and orphan check.

---

*End of backlog. Prefer this file over historical residual prose.*

## 2026-07-13 editing-workspace closeout

The subsequent UI batch did not reopen the host-hardening backlog. It added a
trusted bounded clipboard write IPC, a terminal-only exact-home cwd exception
for Chats, explicit engine/user transcript origins, session view/scroll
preservation, and the dedicated Changes review. The exact-home exception does
not broaden Git, config, or general filesystem IPC permissions.
