import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useNavigate } from 'react-router';

import { unwrap } from '../../../finance-api-helpers.js';
import {
  importDraftsClaim,
  importDraftsDiscard,
  importDraftsList,
} from '../../../finance-api/index.js';
import { ownerToken } from '../../../store/import-draft-owner';
import { useAllAccounts } from '../../accounts/hooks/useAllAccounts';
import { IMPORT_DRAFTS_LIST_KEY } from '../hooks/useDraftWriteThrough';
import { joinPendingAccounts, type PendingImportItem } from './pending-import-view';

/** Where a card's Resume, Review or Take over lands. */
export function draftUrl(draftId: string): string {
  return `/finance/import?draft=${encodeURIComponent(draftId)}`;
}

/**
 * The pending imports every entry point lists (finance ADR-005), joined with
 * their accounts, plus the two things a card can do to one without opening
 * it: discard it, or take it over (a forced claim, then open). Both
 * invalidate the list so the other entry point catches up.
 */
export function usePendingImports() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { accounts } = useAllAccounts();
  const draftsQuery = useQuery({
    queryKey: IMPORT_DRAFTS_LIST_KEY,
    queryFn: async () => unwrap(await importDraftsList({})).data,
  });

  const items = useMemo<PendingImportItem[] | undefined>(() => {
    if (draftsQuery.data === undefined || accounts === undefined) return undefined;
    return joinPendingAccounts(draftsQuery.data, accounts);
  }, [draftsQuery.data, accounts]);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: IMPORT_DRAFTS_LIST_KEY });

  const discard = useMutation({
    mutationFn: async (draftId: string) => {
      unwrap({ ...(await importDraftsDiscard({ path: { id: draftId } })), data: null });
    },
    onSettled: invalidate,
  });

  const takeOver = useMutation({
    mutationFn: async (draftId: string) => {
      unwrap(
        await importDraftsClaim({
          path: { id: draftId },
          body: { ownerToken: ownerToken(), force: true },
        })
      );
      return draftId;
    },
    onSuccess: (draftId) => {
      void invalidate();
      void navigate(draftUrl(draftId));
    },
  });

  return {
    items,
    isLoading: draftsQuery.isLoading || (draftsQuery.data !== undefined && accounts === undefined),
    error: draftsQuery.error,
    open: (draftId: string) => void navigate(draftUrl(draftId)),
    discard: (draftId: string) => discard.mutateAsync(draftId),
    takeOver: (draftId: string) => takeOver.mutate(draftId),
    isDiscarding: discard.isPending,
  };
}
