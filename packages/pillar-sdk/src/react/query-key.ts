/**
 * Stable React Query cache key for a `pillar()` invocation.
 *
 * Shape: `[pillarId, ...path, stableInputKey]`.
 *
 * `stableInputKey` is the JSON serialisation of `input` with object keys
 * sorted recursively so two structurally-equal inputs produce the same
 * cache key regardless of key insertion order. `undefined` inputs collapse
 * to `null`.
 *
 * Pure function from inputs to key — no internal state.
 */
export function pillarQueryKey(
  pillarId: string,
  path: readonly string[],
  input: unknown
): readonly [string, ...string[], string] {
  return [pillarId, ...path, stableJson(input)] as const;
}

function stableJson(value: unknown): string {
  return JSON.stringify(sortDeep(value) ?? null);
}

function sortDeep(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map(sortDeep);
  if (typeof value !== 'object') return value;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .toSorted(([a], [b]) => compareStrings(a, b));
  const out: Record<string, unknown> = {};
  for (const [k, v] of entries) out[k] = sortDeep(v);
  return out;
}

function compareStrings(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}
