import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { unwrap } from '../../../finance-api-helpers.js';
import { accountsList } from '../../../finance-api/index.js';
import { toAccountOptions } from '../toAccountOptions';

import type { AccountOption } from '@pops/ui';

/** `LimitQuery`'s max (`rest-schemas.ts`) — the largest single page the API allows. */
const ACCOUNTS_LIST_LIMIT = 500;

/** Exported so any mutation that changes accounts (`useAccountMutations`) can invalidate this cache too. */
export const ALL_ACCOUNTS_KEY = ['finance', 'accounts', 'list'] as const;

/**
 * Every account, for a picker that has no pagination of its own. `accounts.list`
 * caps a page at 500; a household's account count sits far below that, so one
 * page over the max is the whole set — unlike `useEntities`, this is not
 * routed around a capped default via a bulk endpoint, because none exists
 * for accounts.
 *
 * No separate institutions fetch/join here (POPS-3063) — `toAccountOptions`
 * reads each account's already-resolved issuer straight off the response.
 *
 * `accounts` is `undefined` until the query resolves, so callers may read
 * "not in `accounts`" as "does not exist" only once it is defined.
 */
export function useAllAccounts() {
  const accountsQuery = useQuery({
    queryKey: ALL_ACCOUNTS_KEY,
    queryFn: async () => unwrap(await accountsList({ query: { limit: ACCOUNTS_LIST_LIMIT } })),
  });

  const accounts = useMemo<AccountOption[] | undefined>(() => {
    const accountRows = accountsQuery.data?.data;
    if (!accountRows) return undefined;
    return toAccountOptions(accountRows);
  }, [accountsQuery.data]);

  return {
    accounts,
    /** The accounts as the wire serves them, for a reader that needs more than the picker's option. */
    rows: accountsQuery.data?.data,
    isLoading: accountsQuery.isLoading,
    error: accountsQuery.error,
  };
}
