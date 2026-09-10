import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { joinPendingAccounts } from '../../components/imports/pending/pending-import-view';
import { usePendingImports } from '../../components/imports/pending/usePendingImports';
import { FinanceApiError, unwrap } from '../../finance-api-helpers.js';
import { accountImportsGetConfig, accountImportsListBatches } from '../../finance-api/index.js';
import { useAccountsData } from '../accounts/useAccountsPage';
import { accountImportBatchesKey, accountImportConfigKey } from './queryKeys';

import type { PendingImportItem } from '../../components/imports/pending/pending-import-view';
import type { Account } from '../accounts/types';

const PAGE_SIZE = 20;

function findAccount(accounts: Account[], accountId: string): Account | null {
  return accounts.find((candidate) => candidate.id === accountId) ?? null;
}

/**
 * What `/accounts/:id/imports` reads: how the account is fed, when it last
 * was, every batch that fed it, and what is waiting in a pending draft
 * (finance ADR-005).
 *
 * The config read 404s for an account fed by hand — that is the answer, not
 * an error, so it resolves to null rather than surfacing.
 */
export function useAccountImportsPage(accountId: string) {
  const { accounts } = useAccountsData();
  const accountRows = accounts.data?.data ?? [];
  const account = findAccount(accountRows, accountId);
  const pending = usePendingImports();

  const config = useQuery({
    queryKey: accountImportConfigKey(accountId),
    queryFn: async () => {
      try {
        return unwrap(await accountImportsGetConfig({ path: { id: accountId } })).data;
      } catch (error) {
        if (error instanceof FinanceApiError && error.status === 404) return null;
        throw error;
      }
    },
    enabled: account !== null,
  });

  const batches = useInfiniteQuery({
    queryKey: accountImportBatchesKey(accountId),
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) =>
      unwrap(
        await accountImportsListBatches({
          path: { id: accountId },
          query: { limit: PAGE_SIZE, ...(pageParam === undefined ? {} : { before: pageParam }) },
        })
      ),
    getNextPageParam: (last) => last.nextBefore ?? undefined,
    enabled: account !== null,
  });

  const drafts = useMemo<PendingImportItem[]>(() => {
    if (account === null || pending.items === undefined) return [];
    return pending.items.filter((item) => item.draft.accountId === accountId);
  }, [account, pending.items, accountId]);

  return {
    accounts,
    isLoading: accounts.isLoading,
    account,
    config,
    batches,
    drafts,
    batchRows: batches.data?.pages.flatMap((page) => page.data) ?? [],
  };
}

export { joinPendingAccounts };
