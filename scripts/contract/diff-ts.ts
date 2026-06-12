/**
 * TypeScript surface diff classifier.
 *
 * Rules (matches PRD-154 business rules):
 *   - additive: entries appear in current that did not exist in baseline.
 *     No removed or changed signatures.
 *   - breaking: any entry removed; any entry's signature text changed
 *     (we treat *all* signature edits as breaking by default — narrowing
 *     a return type, widening a parameter, renaming a member, all
 *     surface as a text diff. Authors who know a change is non-breaking
 *     still need to declare it as such by bumping minor and letting CI
 *     re-classify; that path is rare).
 *
 * Signature text is the TypeScript printer's normalised form, so
 * formatting churn alone never trips the classifier.
 */
import type { ChangedEntry, SurfaceDiff, TsSurface, TsSurfaceEntry } from './types.js';

function keyOf(entry: TsSurfaceEntry): string {
  return `${entry.entry}::${entry.name}`;
}

function indexBy(surface: TsSurface): Map<string, TsSurfaceEntry> {
  const out = new Map<string, TsSurfaceEntry>();
  for (const e of surface.entries) out.set(keyOf(e), e);
  return out;
}

export function diffTsSurface(baseline: TsSurface, current: TsSurface): SurfaceDiff {
  const baselineIdx = indexBy(baseline);
  const currentIdx = indexBy(current);

  const added: string[] = [];
  const removed: string[] = [];
  const changed: ChangedEntry[] = [];

  for (const [key, entry] of currentIdx) {
    if (!baselineIdx.has(key)) {
      added.push(key);
      continue;
    }
    const before = baselineIdx.get(key);
    if (!before) continue;
    if (before.text !== entry.text || before.kind !== entry.kind) {
      changed.push({
        name: key,
        breaking: true,
        reason: `signature changed (${before.kind} → ${entry.kind})`,
      });
    }
  }

  for (const [key] of baselineIdx) {
    if (!currentIdx.has(key)) removed.push(key);
  }

  added.sort();
  removed.sort();
  changed.sort((a, b) => {
    if (a.name < b.name) return -1;
    if (a.name > b.name) return 1;
    return 0;
  });

  let kind: SurfaceDiff['kind'] = 'none';
  if (removed.length > 0 || changed.length > 0) {
    kind = 'breaking';
  } else if (added.length > 0) {
    kind = 'additive';
  }

  return { kind, added, removed, changed };
}
