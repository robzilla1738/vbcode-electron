# Acceptance Spec

> Reference: sibling [vibe-codr](https://github.com/robzilla1738/vibe-codr) CLI TUI and `packages/macos-bridge`
> Last updated: 2026-07-10
> Status: ready-for-audit

## Summary

Vibe Codr Electron is a presentation shell over the same `@vibe/core` engine used by the CLI. Parity means every user-visible CLI workflow that can sensibly exist in a desktop shell has equivalent behavior, state transitions, keyboard access, failure handling, and persistence without forking engine logic. Terminal-cell rendering and mouse-capture details are intentionally excluded; semantic themes and harness behavior are not.

## Areas

- Engine lifecycle and protocol
- Session and project navigation
- Prompt, plan, approval, and queue control
- Transcript and streaming
- Commands, catalogs, files, and editor integration
- Status, tasks, jobs, and inspector
- Themes, layout, accessibility, and resilience
- Packaging and release readiness

## Checklist

| ID | Priority | Area | Feature | Expected behavior | Verification | Status |
|----|----------|------|---------|-------------------|--------------|--------|
| A01 | P0 | Lifecycle | Bootstrap | Opening a cwd starts one host, waits for `ready`, then hydrates a snapshot before accepting input. | test:`src/shared/parity.test.ts`; manual: open a project and confirm restored state before submit | pass |
| A02 | P0 | Lifecycle | Host failures | Missing host, startup timeout, malformed output, fatal host events, and RPC timeouts surface actionable errors without hanging the renderer. | test: bridge failure cases; manual: launch with invalid host root | pass |
| A03 | P0 | Lifecycle | Shutdown | Window/app shutdown finalizes the session, sends shutdown, and leaves no orphan engine host. | test: main lifecycle test; manual: quit during idle and active turns, inspect processes | pass |
| A04 | P0 | Protocol | Boundary ownership | Electron only uses bootstrap/send/rpc/shutdown and shared contracts; it does not read engine persistence or reimplement the agent loop. | review:`src/main`,`src/preload`,`src/renderer`; test: protocol codec | pass |
| A05 | P0 | Sessions | New, clear, resume, continue | New and clear abort when busy, reset all local transient state, suppress stale events, then forward the engine command; resume/continue hydrate history. | test: session state and history hydrate; manual: clear mid-stream then resume | pass |
| A06 | P0 | Sessions | Multi-project navigation | Project/session lists load through host RPC, disambiguate duplicate names, filter, switch cwd, resume by id, continue latest, and restore last cwd. | test: project index helpers; manual: switch two projects and resume titled sessions | pass |
| A07 | P0 | Prompting | Submit and steer | Plain prompts submit once; prompts entered while busy queue/steer exactly as the CLI and can be removed individually. | test: slash/queue routing; manual: enqueue two prompts and remove one | pass |
| A08 | P0 | Prompting | Slash routing | Built-in, custom, hyphenated, plan/execute, compact, model, and path-like input follow the CLI parser without swallowing ordinary text. | test:`src/shared/parity.test.ts` slash cases compared with TUI | pass |
| A09 | P0 | Modes | PLAN/AGENT/YOLO | Shift-Tab and commands produce the CLI mode/approval combinations; pending plan state does not change optimistically. | test: mode reducer; manual: cycle all modes around a pending plan | pass |
| A10 | P0 | Plans | Plan approval | Plan cards support accept, revise, keep planning, accept-and-YOLO, cited sources, assumptions, and ungrounded warnings. | test: plan event reducer; manual: exercise Enter/Esc/Cmd-Y and typed revision | pass |
| A11 | P0 | Permissions | Permission decisions | Once/session/project/deny and deny feedback map exactly to engine decisions; slash commands remain usable while a card is pending. | test: permission parser/routing; manual: y/a/Cmd-P/n/free-text | pass |
| A12 | P0 | Busy state | Engine idle gate | Busy and spinner remain active through follow-up turns and clear only on `engine-idle`; gate failures are prominent and actionable. | test: event-state reducer; manual: trigger follow-up and gate failure | pass |
| A13 | P0 | Abort | Escape behavior | Escape dismisses the topmost overlay, denies pending permission where applicable, or aborts an active turn without corrupting the session. | e2e:`harness.spec.ts` inspector/catalog Escape; review:`App.tsx` priority stack | pass |
| A14 | P0 | Transcript | Event coverage | User, assistant, reasoning, tool, diff, notice, source, task, and subagent events render with stable identity and correct ordering. | test: reducer event matrix; e2e: streaming and activity scenarios | pass |
| A15 | P0 | Transcript | Markdown safety | GFM, code, links, tables, and source cards render legibly; external links are safe and untrusted HTML/scripts do not execute. | test: markdown/source parsing and URL policy; manual: hostile markdown fixture | pass |
| A16 | P0 | Transcript | Tool and diff detail | Tool rows use meaningful labels/icons, expand on demand, auto-expand errors, and display diff additions/deletions clearly. | test: rich-block/tool helpers; manual: successful and failed edit tools | pass |
| A17 | P0 | Transcript | Reasoning and folding | Reasoning is collapsed by default, Cmd-T toggles it, user turns fold individually, Cmd-O folds all, and density matches CLI semantics. | test: density/folding helpers; manual: toggle during and after a turn | pass |
| A18 | P0 | Transcript | Streaming anchor | Output follows only near the bottom; upward scrolling disengages follow; Jump to latest restores it without losing content. | test:`parity.test.ts` scroll threshold; review:`TranscriptView.tsx` anchor restoration | pass |
| A19 | P0 | Transcript | Long-session resilience | Transcript windowing preserves active work and exposes earlier turns without unbounded DOM growth or losing resumed history. | test:`parity.test.ts` turn/item windows; review:`useSession.ts` progressive reveal | pass |
| A20 | P0 | Catalogs | Command palette | Slash/Cmd-K palette includes live engine command names, enum values, filtering, no-results, keyboard navigation, and correct input cues. | test: command catalog and draft detectors; manual: keyboard-only palette tour | pass |
| A21 | P0 | Catalogs | Models/providers/agents | Main/subagent/agent targets, current markers, inherit clearing, configured/keyless provider flows, and new-agent prefills produce valid CLI commands. | test: catalog option builders; manual: each target/provider path | pass |
| A22 | P0 | Catalogs | Skills and MCP | Skills prefill editable invocations; MCP status reflects connected state, tool count, and error data from host RPC. | test: catalog normalization; manual: live skills and MCP rosters | pass |
| A23 | P0 | Catalogs | Dialog semantics | Catalog dialogs trap focus, support arrows/Enter/Escape, restore focus, report RPC failure, and never submit empty placeholders. | e2e: all live catalogs + Escape; review:`CatalogModal.tsx` native dialog semantics | pass |
| A24 | P0 | Files | At mentions | `@` detects the active query, fuzzy-ranks project files like the CLI, inserts the selection, and handles empty/error results. | test: mention/fuzzy parity; e2e: README selection | pass |
| A25 | P0 | Files | Clipboard images | Cmd-V writes a clipboard image through main/preload and inserts a usable `.vibe/clipboard` mention; failures preserve the draft. | e2e: native clipboard image creates and inserts project-relative path | pass |
| A26 | P0 | Editor | External compose | Cmd-G round-trips the draft through `$VISUAL`/`$EDITOR`; empty or nonzero exits preserve the original draft and focus. | test:`editor-compose.test.ts`; e2e: replacement + focus restoration | pass |
| A27 | P0 | Jobs | Jobs view | `/jobs` toggles a navigable view with accurate status and safe localhost links; Escape returns to the transcript. | e2e: empty and active jobs, localhost link, Escape | pass |
| A28 | P0 | Inspector | Context and checkpoints | Inspector exposes context, changed files, checkpoints with undo/redo commands, DAG/task state, and subagent drill-in without duplicating engine state. | e2e: checkpoint, DAG, subagent stream, Escape | pass |
| A29 | P0 | Status | Session telemetry | Header/composer show model, mode, goal phase/round, git state, changed lines, context pressure, tokens, cost, queue, and working state from snapshots/events. | test: chrome/event reducers; manual: live session status comparison | pass |
| A30 | P0 | Themes | CLI theme semantics | Every CLI theme/accent maps semantic roles, updates from engine events, marks the current value, and drives native control color scheme. | test: theme registry/scheme; manual: light and dark theme sweep | pass |
| A31 | P0 | Keyboard | Reachability | All essential CLI-equivalent actions are keyboard reachable with documented shortcuts and deterministic priority when states overlap. | test: key help/parsers; e2e: dialogs, cards, Escape, editor, composer | pass |
| A32 | P0 | Accessibility | Desktop accessibility | Controls have names, focus indicators, semantic roles, reduced-motion support, AA contrast, and work at 200% zoom without lost actions. | e2e: role-based controls, flat focus state, 200% zoom; review: reduced-motion CSS | pass |
| A33 | P0 | Resilience | Empty/error/narrow states | First run, no sessions, no catalog results, RPC errors, host disconnect, long text, and narrow window states remain understandable and recoverable. | test: bridge/error cases; e2e: empty jobs + 200% zoom; review: empty/error surfaces | pass |
| A34 | P0 | Quality | Source parity guard | Pure modules ported from TUI have drift-detection coverage or shared fixtures so upstream changes cannot silently break parity. | script: source parity audit; test: shared behavioral vectors | pass |
| A35 | P0 | Quality | Verification gates | Unit tests, typecheck, production build, bridge smoke, and focused UI smoke all pass from documented commands. | script:`npm test && npm run typecheck && npm run build && npm run smoke:bridge` | pass |
| A36 | P0 | Packaging | Standalone app | Packaged app includes/resolves the engine host without `VIBE_CODR_ROOT`, launches, opens a project, runs a turn, and shuts down cleanly. | script:`npm run pack && npm run smoke:packaged` | pass |
| A37 | P1 | Layout | Desktop composition | Rail, transcript, composer, and activity surfaces preserve the CLI information hierarchy at wide, 140ch, and narrow breakpoints. | review: responsive shell CSS; e2e: 200% zoom reachability | pass |
| A38 | P1 | Typography | Dense readability | Prose, code, labels, metadata, and controls use a coherent scale with readable measures and no accidental all-monospace or oversized hierarchy. | review: locked tokens + shared CLI wordmark | pass |
| A39 | P1 | Interaction | Motion and feedback | Hover, focus, open/close, streaming, and spinner feedback are restrained, interruptible, and reduced-motion aware. | design lint; e2e: focus/working states; review: reduced-motion CSS | pass |
| A40 | P1 | Polish | Native desktop finish | Chrome tint, dialogs, menus, scrolling, truncation, and empty/error copy feel intentional while preserving theme semantics. | design lint + renderer code audit against opencode structure | pass |

## Audit log

| Date | Auditor | P0 pass | P1 pass | Notes |
|------|---------|---------|---------|-------|
| 2026-07-10 | Codex | 22/36 | 0/4 | Hermetic Electron E2E now proves streaming, plans, permissions, tools/diffs, hostile markdown containment, queues, catalogs, telemetry, and themes. Task is not done. |
| 2026-07-10 | Codex | 36/36 | 4/4 | Eight Electron harness scenarios, 57 unit checks, 19 source-pair guards, bridge smoke, production pack, and clean-environment packaged smoke pass. |

## Sign-off

- [x] All P0 rows are `pass`
- [x] No P0 row is `visual-only`
- [x] Verification commands were run (list below)

**Commands run:**

```text
npm test                         # 43/43 pass
npm run verify:source-parity     # 16/16 source pairs
npm run typecheck                # pass
npm run build                    # pass
npm run smoke:bridge             # ready + snapshot + 177-project index
npm run pack                     # pass; bundled arm64 host + custom icon
computer-use packaged smoke      # bundled host, restore, palette, mode, jobs, inspector
npm run test:e2e                 # 5 Electron renderer/preload/bridge/host scenarios
npm test                         # 57/57 pass
npm run verify:source-parity     # 19/19 source pairs
npm run test:e2e                 # 8/8 renderer/preload/bridge/host scenarios
npm run smoke:bridge             # bundled protocol ready + snapshot + project index
npm run pack                     # pass; release/mac-arm64/Vibe Codr.app
npm run smoke:packaged           # no VIBE_CODR_ROOT; bundled host + restore + command pass
```
