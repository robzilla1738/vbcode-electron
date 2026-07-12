/**
 * Deep-diff patch builder for the Settings panel.
 *
 * The Settings panel edits an in-memory config object and, on Save, needs to
 * persist only the CHANGED keys. The engine's `writeConfigFile` (and
 * `@vibe/config`'s `writeGlobalConfig`) deep-merge a patch where:
 *   - `undefined` is a no-op (key untouched)
 *   - `null`     DELETES the key
 *   - any other value SETS / deep-merges into the key
 *
 * A naïve "send the whole config" patch breaks the clear/unset flow: when a
 * section clears a field it sets the in-memory value to `undefined`, and
 * `undefined` is a no-op in the merge — so the on-disk value survives and the
 * user can never unset an API key, accent color, or model string. Computing a
 * real diff fixes this: a key that was present in the original but is now
 * absent/undefined becomes `null` (delete) in the patch.
 */

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function deepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Compute the patch value for a single key path.
 *
 * @returns `undefined` when nothing changed (caller omits the key), `null` when
 * the key should be deleted, or the value/sub-diff to set.
 */
function diffValue(original: unknown, current: unknown): unknown {
  const origDefined = original !== undefined && original !== null;
  const currDefined = current !== undefined && current !== null;

  // Both absent → no change.
  if (!origDefined && !currDefined) return undefined;

  // Was present, now cleared → delete.
  if (origDefined && !currDefined) return null;

  // Was absent, now set → set the entire value.
  if (!origDefined && currDefined) return current;

  // Both present — recurse into plain objects, compare everything else by value.
  if (isPlainObject(original) && isPlainObject(current)) {
    const diff: Record<string, unknown> = {};
    const keys = new Set([...Object.keys(original), ...Object.keys(current)]);
    let changed = false;
    for (const key of keys) {
      const sub = diffValue(
        (original as Record<string, unknown>)[key],
        (current as Record<string, unknown>)[key],
      );
      if (sub !== undefined) {
        diff[key] = sub;
        changed = true;
      }
    }
    return changed ? diff : undefined;
  }

  // Primitives, arrays, or a type mismatch — replace if different.
  return deepEqual(original, current) ? undefined : current;
}

/**
 * Build a merge-patch from the original (on-disk) config to the edited
 * (in-memory) config. Only changed key paths appear; cleared values become
 * `null` so the engine's `mergeForWrite` deletes them.
 */
export function buildConfigPatch(
  original: Record<string, unknown>,
  current: Record<string, unknown>,
): Record<string, unknown> {
  const diff: Record<string, unknown> = {};
  const keys = new Set([...Object.keys(original), ...Object.keys(current)]);
  for (const key of keys) {
    const sub = diffValue(original[key], current[key]);
    if (sub !== undefined) diff[key] = sub;
  }
  return diff;
}
