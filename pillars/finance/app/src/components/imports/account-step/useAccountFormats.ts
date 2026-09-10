import { useMemo } from 'react';

import { useAllAccounts } from '../../accounts/hooks/useAllAccounts';
import { bankTypesForAccount } from './import-formats';

/**
 * The picked account and the bank dialects it can be read as (POPS-2854).
 * Shared between the account/format picker and the upload step itself, which
 * both need to know whether the currently picked account has anything to
 * import — the picker to render its radio list, the upload step to gate the
 * file drop and to steer `dialectId` away from a dialect the account cannot
 * use. Reads `useAllAccounts` rather than the raw accounts endpoint because
 * the institution name — the only thing a dialect can be matched against — is
 * already resolved there.
 */
export function useAccountFormats(accountId: string | null) {
  const { accounts, rows, isLoading: accountsLoading } = useAllAccounts();
  const account = (accounts ?? []).find((candidate) => candidate.id === accountId);
  // An account fed by a provider has nothing to upload: its rows arrive on
  // their own and wait in a pending draft (finance ADR-005). Read through
  // `??` for the same reason `toAccountOptions` does: a hand-rolled double
  // can omit a field the wire always carries, and that must read as "not
  // fed that way" rather than throwing inside the picker.
  const row = (rows ?? []).find((candidate) => candidate.id === accountId);
  const source = row?.importStatus?.source ?? null;
  const liveProvider = source?.kind === 'api' && source.provider === 'up' ? 'up' : null;

  const availableBanks = useMemo(() => (account ? bankTypesForAccount(account) : []), [account]);

  return {
    accounts: accounts ?? [],
    accountsLoading,
    account,
    availableBanks,
    liveProvider,
  };
}
