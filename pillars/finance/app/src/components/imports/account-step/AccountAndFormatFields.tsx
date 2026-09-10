import { CircleSlash, Plus, Wallet } from 'lucide-react';

import {
  AccountSelect,
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  EmptyState,
  RadioInput,
} from '@pops/ui';

import { AccountFormDialog } from '../../../pages/accounts/AccountFormDialog';
import { LiveFeedSection } from '../live/LiveFeedSection';
import { BANK_OPTIONS } from '../upload-step/bank-upload-config';
import { useAccountAndFormat } from './useAccountAndFormat';

import type { AccountOption } from '@pops/ui';

import type { BankDialectId } from '../../../store/import-store-types';
import type { AccountAndFormatState } from './useAccountAndFormat';

function AddAccountHatch({ onAdd }: { onAdd: () => void }) {
  return (
    <p className="text-xs text-muted-foreground">
      Importing into a bank POPS has never seen?{' '}
      <Button
        type="button"
        variant="link"
        className="h-auto p-0 text-xs"
        prefix={<Plus className="h-3 w-3" />}
        onClick={onAdd}
      >
        Add the account
      </Button>{' '}
      — you come straight back here with it selected.
    </p>
  );
}

function NoAccountsYet({ onAdd }: { onAdd: () => void }) {
  return (
    <EmptyState
      icon={Wallet}
      title="No accounts yet"
      description="An import files transactions against an account, so there has to be one first."
      action={
        <Button onClick={onAdd} prefix={<Plus className="h-4 w-4" />}>
          Add an account
        </Button>
      }
    />
  );
}

/** The same create-account dialog the Accounts page uses — always in create mode here. */
function NewAccountDialog({ state }: { state: AccountAndFormatState }) {
  return (
    <AccountFormDialog
      open={state.dialog.isDialogOpen}
      onOpenChange={state.dialog.setIsDialogOpen}
      editingAccount={null}
      form={state.dialog.form}
      bankEntities={state.bankEntities}
      currencies={state.currencies}
      onCreateBankEntity={state.createBankEntity}
      isSubmitting={state.isCreating}
      onSubmit={state.handleCreate}
      onArchiveToggle={() => {}}
      isArchiving={false}
    />
  );
}

/** Shown when the picked account's institution/kind combination has no dialect to read (POPS-2854). */
function NoFormats({ account }: { account: AccountOption }) {
  return (
    <Alert>
      <CircleSlash aria-hidden />
      <AlertTitle>Nothing to import into {account.name}</AlertTitle>
      <AlertDescription>
        <p>
          POPS has no parser for this account. A cash or gift-card balance has no statement to
          export, and an institution nobody has written a parser for has nothing POPS can read yet.
        </p>
        <p>Record these transactions by hand, or pick another account.</p>
      </AlertDescription>
    </Alert>
  );
}

function FormatSection({
  state,
  dialectId,
  onBankChange,
}: {
  state: AccountAndFormatState;
  dialectId: BankDialectId;
  onBankChange: (value: string) => void;
}) {
  if (!state.accountId) {
    return (
      <p className="rounded-lg border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">
        Pick an account first — the file format on offer depends on it.
      </p>
    );
  }
  // The account list and the institution list resolve at different times;
  // until the picked account itself is resolvable, there is nothing to judge
  // formats against yet, so this renders neither the empty state nor a radio
  // list with nothing in it.
  if (!state.account) return null;
  if (state.liveProvider !== null) {
    return <LiveFeedSection account={state.account} />;
  }
  if (state.availableBanks.length === 0) {
    return <NoFormats account={state.account} />;
  }
  const options = BANK_OPTIONS.filter((option) => state.availableBanks.includes(option.value));
  return (
    <RadioInput
      label="Bank"
      options={options}
      value={dialectId}
      onValueChange={onBankChange}
      orientation="horizontal"
    />
  );
}

function AccountSection({ state }: { state: AccountAndFormatState }) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">Account</p>
      <AccountSelect
        accounts={state.accounts}
        value={state.accountId ?? undefined}
        onChange={(accountId, account) => state.setAccount(accountId, account.name)}
        aria-label="Account to import into"
        placeholder="Which account is this statement for?"
      />
      <AddAccountHatch onAdd={state.handleAdd} />
    </div>
  );
}

/**
 * Account and bank-dialect pickers for the Upload step (POPS-2840), per the
 * design playground's `import/account.tsx` mockup: the account comes first,
 * the file-format dialect is a separate control shown once an account is
 * picked, and an inline hatch opens the same create-account dialog the
 * Accounts page uses, pre-selecting the new account on success.
 */
export function AccountAndFormatFields({
  dialectId,
  onBankChange,
}: {
  dialectId: BankDialectId;
  onBankChange: (value: string) => void;
}) {
  const state = useAccountAndFormat();

  if (!state.accountsLoading && state.accounts.length === 0) {
    return (
      <>
        <NoAccountsYet onAdd={state.handleAdd} />
        <NewAccountDialog state={state} />
      </>
    );
  }

  return (
    <div className="space-y-6">
      <AccountSection state={state} />
      <FormatSection state={state} dialectId={dialectId} onBankChange={onBankChange} />
      <NewAccountDialog state={state} />
    </div>
  );
}
