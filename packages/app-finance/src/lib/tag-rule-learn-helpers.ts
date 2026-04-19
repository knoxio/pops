import type { ConfirmedTransaction } from '@pops/api/modules/finance/imports';

/**
 * Longest common prefix of normalized descriptions (uppercase, collapsed spaces).
 * Falls back to the first token of at least 3 characters from the first description.
 */
export function descriptionPatternFromGroup(descriptions: string[]): string {
  const normalized = descriptions
    .map((d) => d.toUpperCase().replaceAll(/\s+/g, ' ').trim())
    .filter(Boolean);
  if (normalized.length === 0) return '';

  let prefix = normalized[0] ?? '';
  for (let i = 1; i < normalized.length; i++) {
    const s = normalized[i] ?? '';
    let j = 0;
    while (j < prefix.length && j < s.length && prefix[j] === s[j]) {
      j++;
    }
    prefix = prefix.slice(0, j);
  }

  if (prefix.length >= 4) {
    return prefix.trim();
  }

  const first = normalized[0] ?? '';
  const token = first.split(/\s+/).find((w) => w.replaceAll(/[^A-Z0-9]/g, '').length >= 3);
  return token?.replaceAll(/[^A-Z0-9]/g, '') ?? first.slice(0, 12).trim();
}

/** Tags the user added since Tag Review opened (per-checksum diff). */
export function computeLearnableTags(
  transactions: ConfirmedTransaction[],
  localTags: Record<string, string[]>,
  initialTags: Record<string, string[]>
): string[] {
  const added = new Set<string>();
  for (const t of transactions) {
    const key = t.checksum;
    const cur = new Set(localTags[key] ?? []);
    const init = new Set(initialTags[key] ?? []);
    for (const tag of cur) {
      if (!init.has(tag)) added.add(tag);
    }
  }
  return [...added].toSorted((a, b) => a.localeCompare(b));
}
