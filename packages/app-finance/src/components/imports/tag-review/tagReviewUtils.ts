import type { ConfirmedTransaction, SuggestedTag } from '@pops/api/modules/finance/imports';

import type { TagMetaEntry } from '../../TagEditor';

/** Group of confirmed transactions sharing the same entity */
export interface ConfirmedGroup {
  entityName: string;
  transactions: ConfirmedTransaction[];
}

/** Group confirmed transactions by entity name, sorting alphabetically */
export function groupByEntity(transactions: ConfirmedTransaction[]): ConfirmedGroup[] {
  const map = new Map<string, ConfirmedTransaction[]>();
  for (const t of transactions) {
    const key = t.entityName ?? 'No Entity';
    const existing = map.get(key);
    if (existing) {
      existing.push(t);
    } else {
      map.set(key, [t]);
    }
  }
  return [...map.entries()]
    .toSorted(([a], [b]) => a.localeCompare(b))
    .map(([entityName, txns]) => ({ entityName, transactions: txns }));
}

/** Union of all distinct tags across an array of tag lists */
export function unionTags(tagLists: string[][]): string[] {
  return [...new Set(tagLists.flat())].toSorted();
}

/** Build a tagMeta Map from a SuggestedTag array for the TagEditor */
export function buildTagMetaMap(suggestedTags: SuggestedTag[]): Map<string, TagMetaEntry> {
  const map = new Map<string, TagMetaEntry>();
  for (const s of suggestedTags) {
    map.set(s.tag, { source: s.source, pattern: s.pattern });
  }
  return map;
}
