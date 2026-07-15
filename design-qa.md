# Transcript rhythm design QA

## Evidence

- Source visual truth: `/var/folders/f4/7r6qlts50lj6_rncg4jffq140000gn/T/TemporaryItems/NSIRD_screencaptureui_4nOvTG/Screenshot 2026-07-13 at 12.36.28 PM.png`
- Supporting references: the Codex activity rhythm and the supplied Vibe Codr inline-output screenshot from this review
- Browser-rendered implementation: `tools/ui-preview/shots/qa-transcript-current.png`
- Combined comparison: `tools/ui-preview/shots/qa-transcript-comparison.png`
- Viewport: 1280 x 720 CSS pixels at 2x device scale
- State: Graphite theme, populated chat transcript; active-thinking behavior separately checked in the `busy` preview scenario

The source and preview contain different transcript copy, so the comparison is limited to the requested interaction surfaces: prose measure, thinking-to-output rhythm, quiet notices, active-state treatment, and streaming typography. Full-view and focused-region review use the same combined comparison image. A separate crop was unnecessary because those surfaces are legible in the combined view.

## Findings

- No actionable P0, P1, or P2 mismatch remains. Thinking rows and assistant output now share one compact vertical rhythm and prose alignment.
- Typography: assistant streaming text inherits the application sans face, normal letter spacing, and prose line height. Code remains mono. The thick detached block cursor is replaced by a thin inline caret.
- Spacing: transcript block gaps and the hidden hover-action reservation are reduced without removing touch target sizing. Informational notices align to the prose measure instead of the far-left transcript edge.
- Colors and tokens: the active-thinking shimmer uses existing foreground/accent tokens and a dedicated duration token; reduced-motion behavior remains intact.
- Image quality: no raster or decorative assets are involved in this change.
- Copy and content: existing transcript wording and activity labels are unchanged.

## Comparison history

- Initial P2: excessive whitespace separated thinking activity from the following output. Fixed by tightening turn/block spacing and the hidden assistant action row. Post-fix evidence: the browser-rendered transcript and combined comparison above.
- Initial P2: streaming prose appeared as a bordered mono block with a detached heavy cursor. Fixed by restoring inherited prose typography and a one-pixel inline caret. Verified by the focused style contract test.
- Initial P2: quiet plan/status notices did not align with assistant output. Fixed by constraining informational notices to the shared prose measure.

## Interaction and runtime checks

- Active thinking group receives `is-live` only for the latest activity group while busy.
- Computed active-label animation: `thinking-shimmer`, 1.8 seconds.
- Workspace navigation and composer remain present in the preview.
- Browser console warnings/errors: none.

## Implementation checklist

- [x] Compact thinking-to-output rhythm
- [x] Tokenized active-thinking shimmer
- [x] Reduced-motion fallback preserved
- [x] Uniform inline streaming typography and caret
- [x] Prose-aligned informational notices
- [x] Focused tests and live browser check

final result: passed

## Editing workspace follow-up — 2026-07-13

- Engine-authored review/gate continuations use compact context rows instead of
  user bubbles; assistant Copy routes through trusted native clipboard IPC.
- Changed files use a dedicated wider master-detail sidebar with persistent
  Diff/File mode, grouped navigation, totals, churn, copy, Reveal, and compact
  stacking. Its footer chip sits beside Jump to latest.
- Session switches preserve the active Session/Changes/Git/Terminal/Jobs view
  and restore transcript position; contextual terminals use project root or the
  user's home for Chats.
- Long plan approvals keep the review body bounded and their uniform action row
  visible. Loading rings rotate, rail icons align to one optical size, and
  supporting text uses the shared sans/color system.
- The Environment dock now has equal top/right inset and a tokenized quiet-grey
  fill inside its rounded hairline. Focused preview measurements confirmed
  16/16px desktop and 8/8px compact insets.

final follow-up result: passed

## Compact empty-state workspace dock follow-up — 2026-07-14

- Source visual truth: `/var/folders/f4/7r6qlts50lj6_rncg4jffq140000gn/T/TemporaryItems/NSIRD_screencaptureui_3zymEx/Screenshot 2026-07-14 at 8.24.23 AM.png`
- Browser-rendered implementation: `tools/ui-preview/shots/splash-compact.png`
- Combined comparison: `/Users/robert/.codex/visualizations/2026/07/14/019f60b9-9c5a-7aa0-8591-d6c712be1628/dock-comparison.png` (source left, implementation right)
- Viewport: 700 × 900 CSS pixels at 2x device scale
- State: Graphite theme at the sub-720px desktop-scaled empty-chat breakpoint

The source and preview contain different project/chat content, so the combined
comparison is intentionally limited to the requested top-right Workspace Dock.
That region is fully legible at the common normalized scale, so a separate
focused crop was not needed.

- Typography and copy remain unchanged; this pass only reduces control density.
- The dock contracts from the oversized compact strip to 184px × 30px, with
  24px rows and 11px icons.
- Existing surface, border, radius, icon set, and color tokens remain consistent
  with the application shell. No image assets are involved.
- The first dock action was exercised in the browser and opened the shared
  activity sidebar successfully.
- The compact empty-state treatment now covers the full compact range, including
  Retina-scaled desktop windows below 720 CSS pixels; non-empty states retain
  their existing responsive targets.
- The complete UI screenshot matrix, including the new compact splash case,
  rendered without capture failures.
- No actionable P0, P1, or P2 mismatch remains for the requested control-size
  correction.

final result: passed

## Mode menu and cloud session indicator follow-up — 2026-07-15

- Initial source visual truth: `/var/folders/f4/7r6qlts50lj6_rncg4jffq140000gn/T/TemporaryItems/NSIRD_screencaptureui_iPLcGs/Screenshot 2026-07-15 at 3.24.18 PM.png`
- User correction source: `/var/folders/f4/7r6qlts50lj6_rncg4jffq140000gn/T/TemporaryItems/NSIRD_screencaptureui_9wjsJU/Screenshot 2026-07-15 at 3.56.36 PM.png`
- Implementation screenshot: `tools/ui-preview/mode-cloud-implementation.png`
- Side-by-side comparison: `tools/ui-preview/mode-cloud-comparison.png`
- Final implementation viewport: 669 × 819
- State: Vibe Dark, Agent current, mode menu open; one inactive project session has cloud catalog status `running`

## Full-view comparison evidence

The implementation preserves the reference’s useful hierarchy: a question-like
header, vertically stacked icon/title/description choices, and a trailing check
on the current choice. It intentionally uses the product’s smaller composer
anchor, Vibe Dark tokens, existing overlay elevation, Lucide line icons, and
keyboard shortcut grammar instead of copying the reference modal scale.

After the user correction, each choice is one horizontal line: neutral white
icon, label, description, and white current check. The icon tiles use one quiet
neutral surface rather than mode-specific colors.

The cloud session indicator is visible in the project rail as a single static
cloud glyph beside session metadata. It does not introduce a new rail section,
status card, emoji, animation, or competing label.

## Focused region comparison evidence

The menu region was checked at native scale. Typography follows the existing
sans hierarchy; every description remains on the label baseline without clipping
or overflow; the active check is aligned in a
fixed trailing column. The cloud glyph remains legible at 12px inside a 20px
metadata target and session text continues to truncate safely.

## Required fidelity surfaces

- Fonts and typography: existing UI font, weights, line heights, and tracking preserved; no clipped labels.
- Spacing and layout rhythm: responsive 400px token-spaced menu, aligned icon/copy/check columns, compact single-line rows, upward composer anchoring, no viewport overflow.
- Colors and visual tokens: all surfaces and semantic states derive from Vibe theme tokens; no gradients or literal component colors.
- Image and icon fidelity: supplied screenshot is reference-only; implementation uses the project’s canonical Lucide wrappers and no substitute image assets or emoji.
- Copy and content: Plan, Agent, and Yolo each explain their actual engine behavior in plain language.

## Interaction and accessibility evidence

- Opening the compact Agent trigger displays one menu with three options.
- Selecting Plan closes the menu and updates the trigger to `Mode: Plan`.
- `aria-selected` identifies the actual current mode rather than keyboard hover.
- The running cloud session is announced as “Running in Cloud.”
- Browser console warnings/errors: none.

## Findings

No actionable P0, P1, or P2 differences remain. The smaller scale and absence of
a Learn more link are intentional product/design-system adaptations rather than
fidelity defects.

## Comparison history

- User-reported P2: mode-specific icon colors were too decorative and the
  descriptions wrapped beneath their labels.
- Fix: all mode and current-state icons now use `--assistant`; rows use a
  single-line label/description grid and widen responsively up to 620px.
- Post-fix evidence: all three rows reported matching label/description top
  coordinates, no description overflow, `rgb(238, 238, 238)` icon/check color,
  and no browser console warnings or errors.
- User-reported P2: the corrected single-line menu still occupied too much
  horizontal space. Fixed by tightening the behavior copy and reducing the
  responsive maximum first to 480px, then to 400px with tighter 42px rows and
  24px neutral icon tiles, without restoring wrapping.

## Follow-up polish

No P3 item is required for this focused change.

final result: passed
