import type { ConfirmedTransaction } from '@pops/api/modules/finance/imports';

/**
 * Tags the user added in this session (present in `localTags` but not in the
 * immutable snapshot from when Tag Review first rendered).
 */
export function computeLearnableTags(
  transactions: ConfirmedTransaction[],
  localTags: Record<string, string[]>,
  initialTags: Record<string, string[]>
): string[] {
  const learned = new Set<string>();
  for (const t of transactions) {
    const cur = new Set(localTags[t.checksum] ?? []);
    const init = new Set(initialTags[t.checksum] ?? []);
    for (const tag of cur) {
      if (!init.has(tag)) learned.add(tag);
    }
  }
  return [...learned].sort();
}

/**
 * Derive a conservative `contains` pattern from a set of descriptions by
 * searching for the longest common substring (min length 4).
 */
export function descriptionPatternFromGroup(descriptions: string[]): string {
  const normalized = descriptions.map((d) => d.trim().toUpperCase()).filter(Boolean);
  if (normalized.length === 0) return '';
  if (normalized.length === 1) return normalized[0]!.slice(0, 48).trim();

  const first = normalized[0]!;
  const maxLen = Math.min(first.length, 48);
  for (let len = maxLen; len >= 4; len--) {
    for (let i = 0; i + len <= first.length; i++) {
      const sub = first.slice(i, i + len);
      if (normalized.every((d) => d.includes(sub))) return sub.trim();
    }
  }

  // Last resort: short prefix (may be a weak `contains` anchor); user can edit in the dialog.
  return first.slice(0, 16).trim();
}
