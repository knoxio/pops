import { Scale } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle, formatCents } from '@pops/ui';

import { useImportStore } from '../../../store/importStore';
import { useAllAccounts } from '../../accounts/hooks/useAllAccounts';
import { dayLabel } from '../pending/pending-import-view';

import type { CommitResult } from '@pops/finance';

function useAccountCurrency(accountId: string | null): string {
  const { rows } = useAllAccounts();
  return rows?.find((row) => row.id === accountId)?.currency ?? 'AUD';
}

function newestDate(dates: readonly string[]): string | null {
  return dates.toSorted().at(-1) ?? null;
}

/**
 * What committing a live draft records besides its rows (POPS-3335): the
 * balance Up reported with the newest row becomes an import checkpoint on
 * that row's date. Shown on Commit for a live draft only; a file draft's
 * checkpoint comes from a statement's closing balance and needs no notice.
 */
export function LiveCheckpointSection() {
  const source = useImportStore((s) => s.draftSource);
  const balance = useImportStore((s) => s.draftBalanceCents);
  const accountId = useImportStore((s) => s.accountId);
  const parsed = useImportStore((s) => s.parsedTransactions);
  const currency = useAccountCurrency(accountId);
  if (source?.kind !== 'live' || balance === null) return null;
  const asOf = newestDate(parsed.map((t) => t.date));
  if (asOf === null) return null;
  return (
    <Card>
      <CardHeader className="flex flex-row items-center gap-2 space-y-0">
        <Scale className="h-4 w-4 text-muted-foreground" aria-hidden />
        <CardTitle className="text-sm font-medium">Balance checkpoint</CardTitle>
      </CardHeader>
      <CardContent className="space-y-1 text-sm">
        <p>
          Up reported{' '}
          <span className="font-medium tabular-nums">{formatCents(balance, currency)}</span> with
          the newest row, on {dayLabel(asOf)}.
        </p>
        <p className="text-muted-foreground">
          Committing records it as an import checkpoint on that date. If the ledger disagrees once
          these rows are in, the account’s checkpoints page says by how much.
        </p>
      </CardContent>
    </Card>
  );
}

type CommitCheckpoint = NonNullable<CommitResult['checkpoints']>[number];

/** `deltaCents` is checkpoint minus ledger; zero is agreement. */
export function agreementTail(checkpoint: CommitCheckpoint): string {
  if (checkpoint.deltaCents === 0) return ' · the ledger agrees.';
  return ` · the ledger is off by ${formatCents(Math.abs(checkpoint.deltaCents), checkpoint.currency)}.`;
}

export function CheckpointResultLines({ checkpoints }: { checkpoints: CommitCheckpoint[] }) {
  if (checkpoints.length === 0) return null;
  return (
    <div className="space-y-1">
      {checkpoints.map((checkpoint) => (
        <p key={checkpoint.id} className="text-center text-sm text-muted-foreground">
          Checkpoint recorded: {formatCents(checkpoint.balanceCents, checkpoint.currency)} as of{' '}
          {dayLabel(checkpoint.asOf)}
          {agreementTail(checkpoint)}
        </p>
      ))}
    </div>
  );
}
