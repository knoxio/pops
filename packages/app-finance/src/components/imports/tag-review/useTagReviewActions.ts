import { useCallback } from 'react';
import { toast } from 'sonner';

import type { TagRuleImpactItem } from '@pops/api/modules/core/tag-rules/types';
import type { ConfirmedTransaction, SuggestedTag } from '@pops/api/modules/finance/imports';

import type { ConfirmedGroup } from './tagReviewUtils';

export function applyAffectedToLocalTags(
  prev: Record<string, string[]>,
  affected: TagRuleImpactItem[],
  edited: Set<string>
): Record<string, string[]> {
  const next = { ...prev };
  for (const item of affected) {
    const checksum = item.transactionId;
    if (!edited.has(checksum)) {
      const newRuleTags = item.after.suggestedTags.map((s) => s.tag);
      const existingTags = prev[checksum] ?? [];
      next[checksum] = [...new Set([...existingTags, ...newRuleTags])];
    }
  }
  return next;
}

export function applyAffectedToSuggested(
  prev: Record<string, SuggestedTag[]>,
  affected: TagRuleImpactItem[]
): Record<string, SuggestedTag[]> {
  const next = { ...prev };
  for (const item of affected) {
    const checksum = item.transactionId;
    const ruleSuggestedTags = item.after.suggestedTags.map((s) => ({
      tag: s.tag,
      source: (s.source === 'tag_rule' ? 'rule' : s.source) as SuggestedTag['source'],
      pattern: s.pattern,
    }));
    const ruleSuggestedTagSet = new Set(ruleSuggestedTags.map((s) => s.tag));
    const existingMeta = prev[checksum] ?? [];
    next[checksum] = [
      ...existingMeta.filter((entry) => !ruleSuggestedTagSet.has(entry.tag)),
      ...ruleSuggestedTags,
    ];
  }
  return next;
}

interface TagActionsDeps {
  setLocalTags: React.Dispatch<React.SetStateAction<Record<string, string[]>>>;
  editedChecksumsRef: React.MutableRefObject<Set<string>>;
  confirmedTransactions: ConfirmedTransaction[];
}

export function useTagActions(deps: TagActionsDeps) {
  const { setLocalTags, editedChecksumsRef, confirmedTransactions } = deps;

  const updateTag = useCallback(
    (checksum: string, tags: string[]) => {
      setLocalTags((prev) => ({ ...prev, [checksum]: tags }));
      editedChecksumsRef.current.add(checksum);
    },
    [setLocalTags, editedChecksumsRef]
  );

  const handleAcceptAll = useCallback(() => {
    const updated: Record<string, string[]> = {};
    for (const t of confirmedTransactions) updated[t.checksum] = t.tags ?? [];
    setLocalTags(updated);
    toast.success('All suggested tags accepted');
  }, [confirmedTransactions, setLocalTags]);

  const handleApplyGroupTags = useCallback(
    (group: ConfirmedGroup, newTags: string[]) => {
      setLocalTags((prev) => {
        const next = { ...prev };
        for (const t of group.transactions) {
          const existing = prev[t.checksum] ?? [];
          next[t.checksum] = Array.from(new Set([...existing, ...newTags]));
        }
        return next;
      });
    },
    [setLocalTags]
  );

  return { updateTag, handleAcceptAll, handleApplyGroupTags };
}
