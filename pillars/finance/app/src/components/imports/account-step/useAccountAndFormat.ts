import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { unwrap } from '../../../finance-api-helpers.js';
import { currenciesList } from '../../../finance-api/index.js';
import { useAllEntities } from '../../../lib/useAllEntities';
import { mapAccountApiError } from '../../../pages/accounts/account-error-mapping';
import { useAccountFormDialogState } from '../../../pages/accounts/useAccountFormDialogState';
import { useAccountMutations } from '../../../pages/accounts/useAccountMutations';
import { useCreateBankEntity } from '../../../pages/accounts/useCreateBankEntity';
import { useImportStore } from '../../../store/importStore';
import { useAccountFormats } from './useAccountFormats';

/** The contacts entity `type` the institution picker lists/creates (POPS-3063). */
const BANK_ENTITY_TYPE = 'bank';

/**
 * Wires the import wizard's account picker to the real accounts endpoint and
 * the same create-account dialog the Accounts page uses (POPS-2840). Unlike
 * `useAccountsPage`, the dialog here is always in create mode — the import
 * wizard never edits an existing account — and a successful create pre-selects
 * the new account on the wizard's store rather than just closing the dialog.
 */
export function useAccountAndFormat() {
  const queryClient = useQueryClient();
  const { accountId, setAccount } = useImportStore();
  const { accounts, accountsLoading, account, availableBanks, liveProvider } =
    useAccountFormats(accountId);
  const bankEntitiesQuery = useAllEntities({ type: BANK_ENTITY_TYPE });
  const currenciesQuery = useQuery({
    queryKey: ['finance', 'currencies', 'list'],
    queryFn: async () => unwrap(await currenciesList()),
  });
  const dialog = useAccountFormDialogState();
  const { createMutation } = useAccountMutations(() => {
    // The mutation's own onSuccess (toast + would-be closeDialog) already ran;
    // the created account is only available on the resolved promise below, so
    // pre-selecting it and closing happen there instead of here.
  });

  const handleAdd = () => dialog.handleAdd();

  const handleCreate = (values: Parameters<typeof createMutation.mutateAsync>[0]) => {
    createMutation
      .mutateAsync(values)
      .then((created) => {
        setAccount(created.data.id, created.data.name);
        // `useAccountMutations`'s own invalidation only covers the accounts
        // page's own key; `useAllAccounts` — what this picker (and
        // `EditableFormFields`'s `AccountField`) reads from — is keyed
        // separately and needs its own bust so the new account shows up here.
        void queryClient.invalidateQueries({ queryKey: ['finance', 'accounts', 'list'] });
        dialog.closeDialog();
      })
      .catch((err: unknown) => {
        if (!mapAccountApiError(err, dialog.form)) {
          toast.error(err instanceof Error ? err.message : 'Failed to create account');
        }
      });
  };

  return {
    accounts,
    accountsLoading,
    accountId,
    setAccount,
    account,
    availableBanks,
    liveProvider,
    bankEntities: bankEntitiesQuery.data?.data ?? [],
    currencies: currenciesQuery.data?.data ?? [],
    dialog,
    handleAdd,
    handleCreate,
    isCreating: createMutation.isPending,
    createBankEntity: useCreateBankEntity(dialog.form),
  };
}

export type AccountAndFormatState = ReturnType<typeof useAccountAndFormat>;
