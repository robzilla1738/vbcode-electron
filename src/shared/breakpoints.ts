/**
 * Named layout breakpoints for the Electron shell.
 *
 * CSS `@media (max-width: …)` values for laptop/tablet/compact/narrow live in
 * `styles.css` and must stay in sync with those pixel numbers. `wide` is JS-only
 * today (`useSession` seats the live activity rail) — there is no matching
 * `@media (min-width: 1280px)` rule.
 *
 * Measure notes (AGENTS): content column ~130ch, activity rail ~42ch;
 * `wide` is when project rail + column + activity rail fit without crushing.
 */
export const BREAKPOINTS = {
  /** Live activity rail seats beside the column. */
  wide: 1280,
  /** Topbar action labels compress. */
  laptop: 1100,
  /** Project rail becomes a start-edge overlay drawer. */
  tablet: 900,
  /** Activity / inspector become an end-edge overlay drawer. */
  compact: 720,
  /** Phone-narrow chrome densifies (model chip stays, truncated). */
  narrow: 640,
} as const;

export type BreakpointName = keyof typeof BREAKPOINTS;

/** True when the viewport is strictly below the named breakpoint. */
export function belowBreakpoint(
  name: BreakpointName,
  width = typeof window !== "undefined" ? window.innerWidth : BREAKPOINTS.wide,
): boolean {
  return width < BREAKPOINTS[name];
}

/** True when the viewport is at least the named breakpoint. */
export function atBreakpoint(
  name: BreakpointName,
  width = typeof window !== "undefined" ? window.innerWidth : BREAKPOINTS.wide,
): boolean {
  return width >= BREAKPOINTS[name];
}
