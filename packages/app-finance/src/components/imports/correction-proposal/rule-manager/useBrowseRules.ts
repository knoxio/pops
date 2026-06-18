import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { unwrap } from '../../../../finance-api-helpers.js';
import { correctionsListMerged } from '../../../../finance-api/index.js';
import {
  applyBrowsePriorityReorder,
  sortRulesForBrowseDisplay,
} from '../../../../lib/correction-browse-reorder';
import { toRestPendingChangeSets } from '../../../../lib/rest-changeset';
import { useImportStore } from '../../../../store/importStore';

import type { LocalOp } from '../../correction-proposal-shared';
import type { CorrectionRule } from '../../RulePicker';

interface UseBrowseRulesArgs {
  open: boolean;
  localOps: LocalOp[];
  browseSearch: string;
  setLocalOps: React.Dispatch<React.SetStateAction<LocalOp[]>>;
}

interface CorrectionsListMergedResult {
  data: CorrectionRule[];
  pagination: { total: number; limit: number; offset: number };
}

export function useBrowseRules({ open, localOps, browseSearch, setLocalOps }: UseBrowseRulesArgs) {
  const pendingChangeSets = useImportStore((s) => s.pendingChangeSets);
  const pendingInput = useMemo(
    () => toRestPendingChangeSets(pendingChangeSets),
    [pendingChangeSets]
  );
  // Server-side merge — folds the full DB rule set with pending ChangeSets
  // BEFORE slicing, so the client never sees `NotFoundError` for an op
  // targeting a rule outside the page window. The render surface is capped
  // at 500 to keep DnD-driven priority reorders responsive.
  const browseListQuery = useQuery({
    queryKey: ['finance', 'corrections', 'listMerged', { pendingInput, limit: 500, offset: 0 }],
    queryFn: async (): Promise<CorrectionsListMergedResult> =>
      unwrap(
        await correctionsListMerged({
          body: { pendingChangeSets: pendingInput, limit: 500, offset: 0 },
        })
      ),
    enabled: open,
    staleTime: 30_000,
  });
  const browseMergedRules: CorrectionRule[] = useMemo(
    () => browseListQuery.data?.data ?? [],
    [browseListQuery.data?.data]
  );

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
