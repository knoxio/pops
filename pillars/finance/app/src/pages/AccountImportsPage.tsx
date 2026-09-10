import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { toast } from 'sonner';

import { AccountMark, EmptyState, ErrorAlert, PageHeader, Skeleton } from '@pops/ui';

import { ALL_ACCOUNTS_KEY } from '../components/accounts/hooks/useAllAccounts';
import { toAccountOptions } from '../components/accounts/toAccountOptions';
import { unwrap } from '../finance-api-helpers.js';
import { accountImportsWriteConfig } from '../finance-api/index.js';
import { BatchHistory } from './account-imports/BatchHistory';
import { ImportActions } from './account-imports/ImportActions';
import { accountImportConfigKey } from './account-imports/queryKeys';
import {
  bodyOf,
  type SourceFormValues,
  SourceFormDialog,
} from './account-imports/SourceFormDialog';
import { SourceSection } from './account-imports/SourceSection';
import { StatusSection } from './account-imports/StatusSection';
import { useAccountImportsPage } from './account-imports/useAccountImportsPage';

import type { ImportConfigWire } from './account-imports/types';

function LoadingSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-40 w-full" />
      <Skeleton className="h-48 w-full" />
    </div>
  );
}

/**
 * `/accounts/:id/imports` (POPS-2919, finance ADR-003) — how this account
 * gets its transactions, when it last did, what is waiting for review, and
 * every batch that fed it. The account page is the result; this is the
 * plumbing behind it, which is why neither the source nor the history
 * appears there.
 */
export function AccountImportsPage() {
  const { id } = useParams<{ id: string }>();
  const accountId = id ?? '';
  const state = useAccountImportsPage(accountId);
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);

  const save = useMutation({
    mutationFn: async (values: SourceFormValues) =>
      unwrap(await accountImportsWriteConfig({ path: { id: accountId }, body: bodyOf(values) })),
    onSuccess: () => {
      setEditing(false);
      toast.success('Import source saved');
      void queryClient.invalidateQueries({ queryKey: accountImportConfigKey(accountId) });
      void queryClient.invalidateQueries({ queryKey: ALL_ACCOUNTS_KEY });
    },
  });

  if (state.accounts.error) {
    return (
      <ErrorAlert title="Failed to load this account" message={state.accounts.error.message} />
    );
  }
  // The config is part of the page's answer, not a detail of it: rendering
  // before it lands would say "fed by hand" and refuse the sync for an
  // account that is neither.
  if (state.isLoading || state.config.isPending) return <LoadingSkeleton />;

  const { account } = state;
  if (!account) {
    return <EmptyState title="No such account" description="It may have been deleted." />;
  }
  const [option] = toAccountOptions([account]);
  const config = state.config.data ?? null;

  return (
    <ImportsPageBody
      account={account}
      option={option}
      config={config}
      state={state}
      editing={editing}
      setEditing={setEditing}
      save={save}
    />
  );
}

interface BodyProps {
  account: NonNullable<ReturnType<typeof useAccountImportsPage>['account']>;
  option: ReturnType<typeof toAccountOptions>[number] | undefined;
  config: ImportConfigWire | null;
  state: ReturnType<typeof useAccountImportsPage>;
  editing: boolean;
  setEditing: (open: boolean) => void;
  save: { mutate: (values: SourceFormValues) => void; isPending: boolean; error: Error | null };
}

function ImportsPageBody({ account, option, config, state, editing, setEditing, save }: BodyProps) {
  return (
    <div className="space-y-6">
      <PageHeader
        backHref={`/finance/accounts/${account.id}`}
        icon={option && <AccountMark account={option} size="md" />}
        title={`Imports — ${account.name}`}
        description="How this account gets its transactions, when it last did, and every batch that fed it."
        actions={<ImportActions accountId={account.id} config={config} />}
        renderLink={Link}
      />
      <SourceSection accountName={account.name} config={config} onEdit={() => setEditing(true)} />
      <StatusSection account={account} drafts={state.drafts} />
      <section className="space-y-2">
        <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          History
        </h2>
        <BatchHistory
          accountId={account.id}
          accountName={account.name}
          batches={state.batchRows}
          hasMore={state.batches.hasNextPage}
          isFetchingMore={state.batches.isFetchingNextPage}
          onLoadMore={() => void state.batches.fetchNextPage()}
        />
      </section>
      <SourceFormDialog
        open={editing}
        onOpenChange={setEditing}
        accountName={account.name}
        config={config}
        onSave={(values) => save.mutate(values)}
        isSaving={save.isPending}
        error={save.error?.message ?? null}
      />
    </div>
  );
}
