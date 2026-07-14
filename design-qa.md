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
