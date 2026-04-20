import { useMemo } from 'react';

import { trpc } from '@pops/api-client';

import {
  applyBrowsePriorityReorder,
  sortRulesForBrowseDisplay,
} from '../../../../lib/correction-browse-reorder';
import { computeMergedRules } from '../../../../lib/merged-state';
import { useImportStore } from '../../../../store/importStore';

import type { LocalOp } from '../../correction-proposal-shared';
import type { CorrectionRule } from '../../RulePicker';

interface UseBrowseRulesArgs {
  open: boolean;
  localOps: LocalOp[];
  browseSearch: string;
  setLocalOps: React.Dispatch<React.SetStateAction<LocalOp[]>>;
}

export function useBrowseRules({ open, localOps, browseSearch, setLocalOps }: UseBrowseRulesArgs) {
  const pendingChangeSets = useImportStore((s) => s.pendingChangeSets);
  const browseListQuery = trpc.core.corrections.list.useQuery(
    { limit: 500, offset: 0 },
    { enabled: open, staleTime: 30_000 }
  );
  const browseMergedRules: CorrectionRule[] = useMemo(() => {
    const browseDbRules = browseListQuery.data?.data ?? [];
    if (pendingChangeSets.length === 0) return browseDbRules;
    return computeMergedRules(browseDbRules, pendingChangeSets);
  }, [browseListQuery.data?.data, pendingChangeSets]);

  const browseOrderedMerged = useMemo(
    () => sortRulesForBrowseDisplay(browseMergedRules, localOps),
    [browseMergedRules, localOps]
  );
  const browseOrderedFiltered = useMemo(() => {
    const needle = browseSearch.trim().toLowerCase();
    if (!needle) return browseOrderedMerged;
    return browseOrderedMerged.filter((r) => {
      const haystack =
        `${r.descriptionPattern} ${r.entityName ?? ''} ${r.matchType} ${r.location ?? ''}`.toLowerCase();
      return haystack.includes(needle);
    });
  }, [browseOrderedMerged, browseSearch]);

  const browseCanDragReorder = browseSearch.trim() === '' && browseOrderedMerged.length >= 2;

  const handleBrowseReorderFullList = (reordered: CorrectionRule[]) => {
    setLocalOps((prev) => applyBrowsePriorityReorder(reordered, prev));
  };

  return {
    browseListQuery,
    browseMergedRules,
    browseOrderedMerged,
    browseOrderedFiltered,
    browseCanDragReorder,
    handleBrowseReorderFullList,
  };
}
