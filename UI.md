# UI.md — Interaction & visual debt handoff

> **Status:** fixes applied — all items resolved (see §11 tracker)  
> **Date:** 2026-07-11  
> **Audience:** another coding agent picking up UI polish / interaction work  
> **Repo:** [vbcode-electron](https://github.com/robzilla1738/vbcode-electron)

This document is a comprehensive inventory of **UI interaction gaps** and **AI-slop / generic visual residue** found in a read-only audit of the Electron renderer. Use it as a backlog and design brief. Re-verify against live code before changing anything — the tree moves fast.

---

## 0. How to use this doc

1. Read `AGENTS.md` (hard rules), `PARITY.md` (behavior contracts), `ACCEPTANCE.md` (P0/P1 gates).
2. Prefer **TUI-faithful behavior** over inventing new workflows. Presentation may improve; engine ownership stays in vibe-codr.
3. All styling lives in `src/renderer/styles.css` (token-first). No literal hex outside `:root` fallbacks.
4. Verify visually with `npm run ui:preview` + `?scenario=…&theme=…`, and `npm run ui:shots` when touching shared primitives.
5. Do **not** treat every item as a must-fix. Prioritize §8. Call out items that conflict with intentional non-parity in `PARITY.md`.

### Product context (short)

Electron **presentation shell** for vibe-codr. Talks to the engine only via NDJSON (`bootstrap` / `send` / `rpc` / `shutdown`). Themes and semantics come from the CLI; Liquid Glass may tint chrome but must not replace CLI theme roles. Busy stays until `engine-idle`.

### What’s already strong (do not “fix”)

- Documented Escape priority stack (picker → inspector → jobs → rail → draft → perm → plan → abort)
- Catalog + jobs focus traps; draft-linked catalog focus sharing with composer
- Busy-until-`engine-idle`; `/clear` / `/new` local reset + suppress stale stream
- Tokenized motion + `prefers-reduced-motion` CSS collapse
- Skip links; semantic regions; many aria labels
- Copy buttons use hover **and** `:focus-within` (not hover-only opacity)
- Unit/e2e parity gates and `tools/ui-preview` scenario matrix

---

## 1. Executive summary

The shell is functionally mature and unusually deliberate for an agent UI. The weak spots are mostly:

1. **False affordances** — chips that look clickable but aren’t
2. **Hover-only discovery** — session ⋯ and some chrome hidden until hover
3. **Escape ownership gaps** — child menus (mode / session) don’t fully own Esc, so App’s stack can fire as a side effect
4. **Toast / failure UX** — 1.6s auto-dismiss pills for errors that need reading
5. **Glass / chip / depth residue** — a recent “opencode-inspired” polish pass (`ACCEPTANCE.md` audit log) added blur, multi-layer shadows, pill soup, and parallel pulse/shimmer cues

**Verdict:** fix interaction hygiene first; then dial visual restraint; then token cleanup. Do not boil the ocean or redesign the product.

---

## 2. Interaction improvements

Severity: **High** = can lose work, misfire destructive actions, or hide core controls · **Med** = real friction / a11y gap · **Low** = polish / discoverability.

### 2.1 Splash / empty home

| ID | Sev | Where | Problem | Why it matters | Suggested direction |
|----|-----|-------|---------|----------------|---------------------|
| I01 | Med | `Splash.tsx` — tagline `"What should we build?"` + `STARTERS` | Generic AI-coding empty state; starter **detail** only in `title=` tooltip | Reads like ChatGPT/Claude home; detail invisible on touch | Product-specific copy; show detail in UI or insert-to-edit |
| I02 | Med | `StarterPills` → `submitLine` in `App.tsx` | One click fires a turn immediately | Accidental submits; can’t tweak prompt first | Insert into composer (or confirm) before send |
| I03 | Low | `.starter-pill` min-height 28px | Small until `@media (hover: none)` bumps to 44px | Trackpad / dense laptop miss | Slightly taller default |
| I04 | Low | `.splash-wordmark` gradient-clipped ASCII | Decorative at small sizes; container swap to compact brand exists | Visual noise before brand reads | Keep brand; consider solid fill at tiny sizes |

### 2.2 Welcome / boot

| ID | Sev | Where | Problem | Why it matters | Suggested direction |
|----|-----|-------|---------|----------------|---------------------|
| I05 | Med | `WelcomeGate.tsx` vs `App.tsx` `projectsLoading` | Gate ignores projects loading — empty recents while RPC in flight | First launch looks broken | Pass loading/error into gate; show spinner/empty/error |
| I06 | Low | Boot heading + status both use `bootHeading` | Duplicate “Opening X” | Noisy for SR/visual | One live region, quieter secondary |
| I07 | Low | Gate error `<pre tabIndex={-1}>` | Error appears; focus not moved | Keyboard users miss recovery | Focus error or Retry |

### 2.3 Project rail / sessions

| ID | Sev | Where | Problem | Why it matters | Suggested direction |
|----|-----|-------|---------|----------------|---------------------|
| I08 | **High** | `.session-more` `opacity:0; pointer-events:none` until `:hover`/`:focus-within` | Session ⋯ undiscoverable without hover | Core session management hidden (esp. touch) | Always visible at reduced opacity, or keyboard menu chord |
| I09 | **High** | Hover hides `.session-time` for ⋯ | Time ↔ actions swap; layout jumps | Friction + mis-clicks | Don’t hide time; stack or reserve space |
| I10 | Med | `window.confirm` Archive/Delete in `ProjectRail.tsx` | Unthemed native dialog | Breaks immersion; no post-delete undo | In-app confirm; soft-delete/archive first |
| I11 | Med | Rename commits on blur | Accidental rename when clicking away | Title intent lost | Commit on Enter only; blur = cancel or ask |
| I12 | Med | ~~Busy disables New/Open/Continue/resume + ⋯~~ | Dead end until Stop found in composer | Done — composer Stop is the sole interrupt; rail shows busy titles on disabled actions |
| I13 | Med | Session menu Esc closes menu but **no `stopPropagation`** | App Esc stack can clear draft / deny / abort same keypress | Dangerous collision | Own Esc completely; join App stack |
| I14 | Low | Project heading only expands/collapses | Feels like navigation but doesn’t switch cwd | Mental model mismatch | Optional primary action vs chevron |
| I15 | Low | Filter Esc clears then closes rail | Surprise dismiss | Clear-only first; second Esc closes |
| I16 | Low | ~~`.session-active-dot.is-on` soft halo~~ | Decoration > signal | Done — active session uses surface highlight only |

### 2.4 Transcript

| ID | Sev | Where | Problem | Why it matters | Suggested direction |
|----|-----|-------|---------|----------------|---------------------|
| I17 | Med | `.turn-fold` 24×24 | Below comfortable click target | Fold friction (⌘O exists but UI weak) | ≥28–32px hit area |
| I18 | Med | `CopyButton` empty `catch` | Clipboard failure silent | Users think copy worked | Toast or button error state |
| I19 | Med | `TranscriptView` `scrollTo({ behavior: "smooth" })` | JS smooth scroll ignores reduced-motion (CSS only kills `scroll-behavior`) | A11y | `matchMedia('(prefers-reduced-motion: reduce)')` → `"auto"` |
| I20 | Med | “N earlier turns · load M more” | Wordy / easy to miss | Long-session windowing buried | Clearer pagination control |
| I21 | Low | Tool live labels use `.working-shimmer` | Competes with Stop/busy cue | Parallel “alive” theater | One busy language |
| I22 | Low | No select-to-copy toast (intentional non-parity) | TUI users expect feedback | Optional quiet toast; don’t fight PARITY |
| I23 | Low | Folded turn “N hidden” | No one-click expand-all-tools-in-turn | Power-user friction | Optional expand control |
| I24 | Low | User bubble `:hover` elevates shadow | Fake interactivity on non-clickable text | Remove hover elevation |

### 2.5 Composer

| ID | Sev | Where | Problem | Why it matters | Suggested direction |
|----|-----|-------|---------|----------------|---------------------|
| I25 | **High** | Mode menu Esc on `document` (`Composer.tsx`); App Esc on `window` — no stopPropagation | Closing mode can deny perm / keep-planning / abort | Highest-risk Esc bug | `stopPropagation` + restore focus to mode trigger |
| I26 | Med | `.composer-model` / `.ctx-ring` have `:hover` but are `<span>`s | **False affordance** — look like buttons | Users click expecting `/model` or inspector | Make buttons **or** remove hover |
| I27 | Med | Paperclip only; image paste + ⌘G have no chrome | A25/A26 keyboard-only | Desktop users won’t find them | Overflow menu / tooltips near paperclip |
| I28 | Med | ~~Busy cue shimmer “Esc” and Stop button~~ | Two interrupt languages | Done — Stop + elapsed only; Esc via keyboard / title |
| I29 | Med | Status chip cluster (metrics, density, ctx, model, send) | Dense; metrics inert but hoverable | Mis-clicks | De-hover inert chips; open useful ones |
| I30 | Med | Queue steer/remove ~24px | Mis-taps when busy | Larger targets | ≥28–32px |
| I31 | Low | Send icon-only; Stop labeled + elapsed | Asymmetric grammar | Acceptable if intentional; document |
| I32 | Low | `composer-ghost` 26×26 not bumped at narrow | Touch miss | Match coarse-pointer bump |
| I33 | Low | Mention Esc regex strips trailing `@…` | Can wipe more than intended | Narrower strip / undo |
| I34 | Low | Density chip cycles instantly | Surprise quiet/verbose flip | Optional brief toast of new density |

### 2.6 Permission / plan cards

| ID | Sev | Where | Problem | Why it matters | Suggested direction |
|----|-----|-------|---------|----------------|---------------------|
| I35 | Med | ~~Cards don’t autofocus~~ | Rely on global y/a/n while composer focused | Done — Allow once autofocus |
| I36 | Med | ~~Plan Esc label vs draft clear~~ | Label lies during revision | Done — honest Esc hint when draft present |
| I37 | Med | ~~`.panels { max-height: 32% }`~~ | Cramped approvals | Done — raised panel/plan body caps |
| I38 | Low | ~~Permission preview 8 lines + “…”~~ | Incomplete risk review | Done — expand/collapse |
| I39 | Low | ~~Deny feedback obscure~~ | Feedback path obscure | Done — Deny reveals optional reason |
| I40 | Low | ~~“Accept + YOLO” beside Accept~~ | High-stakes adjacent | Done — separator + quieter caution chip |

### 2.7 Catalogs / slash / mentions

| ID | Sev | Where | Problem | Why it matters | Suggested direction |
|----|-----|-------|---------|----------------|---------------------|
| I41 | Med | Models Tab = main⇄sub (`CatalogModal`) | Breaks normal Tab focus cycle | Keyboard surprise | Different chord (e.g. ⌘Tab / dedicated control) |
| I42 | Med | Catalog RPC fail → toast only | No inline loading/error in popover | Feels like nothing happened | Inline status in catalog body |
| I43 | Med | Empty: “Nothing matches… Try different keywords” | Generic empty copy | Mild slop | Specific per catalog kind |
| I44 | Low | Free + Current badges + sections | Badge soup | Quiet markers |
| I45 | Low | Draft-linked trap includes composer | Powerful but surprising | Keep; document in `/keys` |
| I46 | Low | Slash/mode “Current” badges duplicate pattern | Two menus, same chrome | Shared quiet marker |

### 2.8 Jobs / inspector / activity

| ID | Sev | Where | Problem | Why it matters | Suggested direction |
|----|-----|-------|---------|----------------|---------------------|
| I47 | Med | Jobs focus trap on open; close doesn’t restore Jobs toggle focus | Focus orphan | Restore focus on dismiss |
| I48 | Med | No job-kill UI | Intentional non-parity (PARITY) — still feels broken | Leave unless protocol + TUI add it; don’t invent alone |
| I49 | Med | Inspector: no desktop focus trap; ≤720px becomes drawer | Inconsistent modality | Trap when drawer; optional trap when docked |
| I50 | Med | Checkpoint Undo/Redo one-click | Scary destructive | Confirm / show which checkpoint |
| I51 | Low | File preview Loading… / (empty) | Thin empty/error | Slightly richer status |
| I52 | Low | Subagent drill-in weak back path | Lost in panel | Explicit Back |
| I53 | Low | Narrow activity chips → inspector | Affordance unclear | Labels / titles |
| I54 | Low | Live sidebar close 280ms JS timeout | Reopen lag | Respect reduced-motion; shorter delay |

### 2.9 Onboarding / help / toasts / global

| ID | Sev | Where | Problem | Why it matters | Suggested direction |
|----|-----|-------|---------|----------------|---------------------|
| I55 | **High** | Toast TTL **1600ms**, no click-dismiss, no severity (`useSession.showToast`) | Errors vanish before readable | Missed failures | Longer for errors; click dismiss; severity styles |
| I56 | Med | Onboarding dismiss is session `useState` only | Returns every cold open without providers | Nag | Persist dismiss in localStorage (per machine) |
| I57 | Med | `/keys` dumps help as transcript notice | No dedicated cheatsheet | Power features stay hidden | Dismissible overlay / panel |
| I58 | Med | Escape stack omits mode/session menus | Overlay hierarchy incomplete | Same as I13/I25 | Single Esc owner |
| I59 | Low | Ctrl+C quits after clear draft | Harsh vs desktop copy norms | Documented — keep; ensure `/keys` warns |
| I60 | Low | Global `button:active` translateY | Twitchy on dense icons | Opt out tiny icon buttons |
| I61 | Low | Search wrappers suppress `:focus-visible` ring | Relies on wrapper treatment | Guard against style drift |

---

## 3. AI slop / generic visual residue

Do **not** confuse “popular” with “slop.” Flag compound sameness and filler chrome. Plan purple `#9d7cd8` is **CLI theme parity** — not a purple-for-AI bug; leave unless themes change upstream.

### 3.1 Definite / high-confidence patterns

| ID | Pattern | Evidence | Why it reads as slop | Fix direction |
|----|---------|----------|----------------------|---------------|
| S01 | Glassmorphism filler | `html.glass` composer/queue `saturate(140%) blur(24px)` (light ~18px); toast/jump `blur(18px)` | Frost as “premium” default; ACCEPTANCE log cites opencode-inspired glass | Soften/remove default blur; keep optional Liquid Glass tint only |
| S02 | Multi-layer fake depth | `.composer-wrap` border + 3 shadows + inset edge + `::before` gradient wash + focus 4px glow | AI dashboard floating card | One shadow token + hairline; kill sheen wash |
| S03 | Pill / chip soup | Toast `--radius-pill`; panel-strip chips; ctx dial; topbar meta; catalog Free tags; busy cue | Same soft-pill grammar everywhere | Prefer sm/md radius for chrome; pills only for true status dots |
| S04 | False interactive chrome | Model/ctx hover without actions (I26) | Looks designed by checklist | Buttons or mute hover |
| S05 | Pulse / shimmer theater | `.working-shimmer`, `.ctx-hot-pulse`, `.engine-pulse`, tool live shimmer, streaming blink | Parallel “alive” animations | One busy cue; static hot ctx |

### 3.2 Borderline / context-dependent

| ID | Pattern | Evidence | Notes |
|----|---------|----------|-------|
| S06 | Empty-home starter pills | `STARTERS` + arrows under splash | Chatbot cliché — rewrite copy/structure (I01/I02) |
| S07 | Gradient text wordmark | `.splash-wordmark` `background-clip: text` | OK as brand if sole hero; don’t spread gradient text elsewhere |
| S08 | Soft glow rings | Active session halo; decorative soft rings | Quiet or remove |
| S09 | Homogeneous hover wash | Surface mix + border brighten on almost every control | Vary by role (destructive / primary / quiet) |
| S10 | Marketplace badges | Free / Current | Quiet checkmark / muted tag |
| S11 | Source/job card hover lift | Transcript source cards; job cards | Less elevation; stay list-like |
| S12 | Plan purple | `--plan: #9d7cd8` from themes | **Parity — do not “de-purple” for taste** |

### 3.3 System smell (process)

Recent ACCEPTANCE audit-log entries celebrate “glass blur 24px,” “hot pulse,” “glow,” “ghost scale hover” as polish wins. That pass optimized for sleekness over restraint. When polishing, **prefer deletion over ornament**.

---

## 4. Polish inconsistencies (tokens / type / motion)

| ID | Sev | Evidence | Problem | Fix direction |
|----|-----|----------|---------|---------------|
| P01 | Med | Literal `7px`, `14px`, `10px`, `6px` radii | Bypass `--radius-xs/sm/md/lg/xl/pill` | Map to tokens; purge literals |
| P02 | Med | Ad-hoc composer shadows stacked on `--shadow-composer` | Elevation not single-source | One token per elevation role |
| P03 | Med | `button:active` translateY vs `.jump-latest:active` must re-apply `translateX(50%)` | Easy to break centering | Scope press feedback |
| P04 | Med | Reduced-motion CSS ok; JS smooth scroll / 280ms close ignore it | Incomplete A32 | Respect `prefers-reduced-motion` in JS |
| P05 | Med | Focus ring allowlist long; search wrappers suppress ring | Uneven focus language | Document + test wrappers |
| P06 | Low | Composer input `15px` / weights hardcoded | Scale drift vs tokens | Use type tokens |
| P07 | Low | `.chip` ≈ `.button` | Two names, one look | Collapse or differentiate |
| P08 | Low | Icon sizes 12/13/14/15 without scale | Visual jitter | 2–3 size steps tied to control height |
| P09 | Low | ~~Four busy languages (Working / Esc shimmer / Stop+elapsed / rail banner)~~ | Cognitive load | Done — Stop + elapsed is the sole interrupt surface; Esc via keyboard / title |
| P10 | Low | Queue stack vs composer vs card radii disagree | Adjacent surfaces clash | Shared radius for stacked chrome |

---

## 5. Intentional non-goals / leave alone unless upstream changes

From `PARITY.md` / `AGENTS.md` — do not invent these in Electron alone:

- Job-kill UI (none in TUI)
- Interactive orchestration DAG graph
- Plugin install / MCP editor UI
- Full-window Liquid Glass replacing theme surfaces
- OpenTUI cell grid / mouse capture
- TUI select-to-copy auto-clipboard toast (native selection + Cmd/Ctrl+C)
- Engine reimplementation

Also: **do not change `src/shared` protocol/reducer behavior** for pure visual polish. Prefer CSS + renderer components.

---

## 6. Key files (starting map)

| Concern | Location |
|---------|----------|
| Shell / Esc / wiring | `src/renderer/App.tsx` |
| Styles / tokens | `src/renderer/styles.css` |
| Composer / mode / slash / mention | `src/renderer/composer/Composer.tsx` |
| Floating menus | `src/renderer/hooks/useFloatingAnchor.ts` |
| Session state / toast TTL | `src/renderer/hooks/useSession.ts` |
| Project rail | `src/renderer/layout/ProjectRail.tsx` |
| Splash / starters | `src/renderer/layout/Splash.tsx` |
| Welcome / boot | `src/renderer/layout/WelcomeGate.tsx` |
| Permission / plan / queue | `src/renderer/panels/LivePanels.tsx` |
| Jobs drawer | `src/renderer/panels/JobsView.tsx` |
| Inspector | `src/renderer/panels/Inspector.tsx` |
| Onboarding | `src/renderer/panels/OnboardingHint.tsx` |
| Catalogs | `src/renderer/pickers/CatalogModal.tsx` |
| Transcript / jump / fold | `src/renderer/transcript/TranscriptView.tsx` |
| Copy | `src/renderer/CopyButton.tsx` |
| Breakpoints | `src/shared/breakpoints.ts` |
| Themes | `src/shared/themes.ts` |
| Preview harness | `tools/ui-preview/` |

---

## 7. Verification expectations

When implementing any cluster:

```bash
npm test
npm run typecheck
npm run lint
npm run ui:preview   # spot-check scenarios
npm run ui:shots     # before/after when touching shared primitives
```

Useful preview scenarios: `welcome`, `splash`, `chat`, `busy`, `permission`, `plan`, `gate`, `mode`, `queue`, `onboarding`, `slash`, `catalog`, `catalog-draft`, `mention`, `jobs`, `inspector`, `toast`, `density-quiet`, `density-verbose`, `ctx-hot` — plus `&theme=` variants and light scheme.

Also exercise: keyboard-only Esc through mode menu + pending permission; session ⋯ without hover; toast with forced RPC error; reduced-motion OS setting + Jump to latest.

Update `PARITY.md` / `ACCEPTANCE.md` only if behavior contracts change — not for pure CSS restraint.

---

## 8. Recommended attack order (highest leverage)

Do these first; treat the rest as opportunistic.

1. **Esc ownership** — Mode menu + session menu must fully own Esc (`stopPropagation` or join App stack). Prevent deny/abort/draft-clear side effects. (I13, I25, I58)
2. **Toasts** — Longer TTL for errors, click-to-dismiss, severity; use for copy/RPC failures. (I55, I18, I42)
3. **Session ⋯ always discoverable** — Kill hover-only opacity + time-hide swap. (I08, I09)
4. **Dial back glass/depth** — Soften composer blur/multi-shadow/gradient wash; toast blur. (S01, S02)
5. **False affordances** — Model chip opens `/model` (or lose hover); ctx → inspector optional. (I26, S04)
6. **Paste / Cmd-G affordances** near paperclip. (I27)
7. **Permission/plan focus + honest Esc labeling.** (I35, I36)
8. **JS reduced-motion** for smooth scroll + sidebar close. (I19, P04)
9. **Catalog inline loading/error.** (I42)
10. **Radius/shadow token pass** — purge literal `7px`/`14px` stacks. (P01, P02)
11. **WelcomeGate loading states.** (I05)
12. **One busy interrupt language.** (I28, P09, S05)
13. **Hit targets** — fold + queue ≥28–32px. (I17, I30)
14. **Empty-home copy/starters** — less chatbot cliché. (I01, I02, S06)
15. **Jobs focus restore on close.** (I47)

---

## 9. Suggested work packages (for parallel agents)

Keep packages small and non-overlapping:

| Package | IDs | Touch mainly | Avoid |
|---------|-----|--------------|-------|
| A — Esc & overlays | I13, I25, I36, I47, I58 | `App.tsx`, `Composer.tsx`, `ProjectRail.tsx`, `JobsView.tsx` | Visual redesign |
| B — Toast & failures | I55, I18, I42 | `useSession.ts`, `CopyButton.tsx`, `CatalogModal.tsx`, toast CSS | New toast library |
| C — Rail discoverability | I08–I12, I15 | `ProjectRail.tsx`, rail CSS | Engine session APIs |
| D — Composer affordances | I26–I30, I27 | `Composer.tsx`, composer CSS | Slash parser / shared |
| E — Visual restraint | S01–S05, P01–P02 | `styles.css` glass/composer/toast | Theme hex / shared themes |
| F — Empty home / onboarding | I01–I05, I56, S06 | `Splash.tsx`, `WelcomeGate.tsx`, `OnboardingHint.tsx` | Engine bootstrap |

---

## 10. Receiving-agent instructions

Before implementing:

1. Re-read live code — this audit may drift.
2. Decide whether each High item is still real; skip if already fixed.
3. Prefer the smallest fix that removes friction; do not add new decorative motion.
4. Do not push, merge, or open PRs unless explicitly asked.
5. When unsure between “sleek glass” and “TUI-faithful restraint,” choose **restraint** and CLI theme semantics.
6. After a cluster: note what you fixed by ID (`I25`, `S01`, …) in the commit/PR body so this file can be checked off later.

---

## 11. Checkbox tracker (optional)

Copy and tick as work lands:

**P0 interaction**

- [x] I08 session ⋯ discoverable
- [x] I09 stop hiding session time on hover
- [x] I13 session menu Esc ownership
- [x] I25 mode menu Esc ownership
- [x] I55 toast severity / dismiss / TTL
- [x] I26 model/ctx false affordance
- [x] I18 copy failure feedback
- [x] I19 reduced-motion jump scroll

**P1 interaction**

- [x] I05 welcome loading
- [x] I10 themed confirm / safer delete
- [x] I11 rename commit rules
- [x] I12 busy recovery control
- [x] I27 paste / editor affordances
- [x] I28 one busy language
- [x] I35–I37 permission/plan focus & space
- [x] I38–I40 permission expand / deny reason / YOLO separation
- [x] I41–I42 catalog Tab + inline errors
- [x] I47 jobs focus restore
- [x] I56 onboarding dismiss persistence
- [x] I57 `/keys` surface

**Visual restraint**

- [x] S01 soften glass blur
- [x] S02 simplify composer depth
- [x] S03 reduce pill soup
- [x] S05 fewer parallel pulses
- [x] P01–P02 token radii/shadows

**Copy / empty states**

- [x] I01–I02 splash/starters
- [x] I43 catalog empty copy
