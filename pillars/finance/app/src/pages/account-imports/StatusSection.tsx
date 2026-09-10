import { Card, CardContent, CardHeader, CardTitle } from '@pops/ui';

import { dayLabel, whenLabel } from '../../components/imports/pending/pending-import-view';
import { PendingImportList } from '../../components/imports/pending/PendingImportList';
import { cadenceLabel } from './SourceSection';

import type { PendingImportItem } from '../../components/imports/pending/pending-import-view';
import type { Account } from '../accounts/types';

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="space-y-0.5">
      <p className="text-xs tracking-wide text-muted-foreground uppercase">{label}</p>
      <p className="text-sm font-medium tabular-nums">{value}</p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

/**
 * When the account was last fed and what it holds, plus anything waiting in
 * a pending draft (finance ADR-005). `lastImportAt` is the later of the
 * newest batch and the last provider pass, so an account synced with
 * nothing new still reads as current; `lastSyncedAt` is shown beside it
 * when a provider feeds this account, because a pass that found nothing is
 * the difference between quiet and broken.
 */
export function StatusSection({
  account,
  drafts,
}: {
  account: Account;
  drafts: PendingImportItem[];
}) {
  const status = account.importStatus;
  return (
    <Card>
      <CardHeader className="space-y-0">
        <CardTitle className="text-sm font-medium">Status</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Last fed"
          value={status.lastImportAt ? whenLabel(status.lastImportAt) : 'Never'}
          hint={status.lastSyncedAt ? `Last sync ${whenLabel(status.lastSyncedAt)}` : undefined}
        />
        <Stat
          label="Newest transaction"
          value={status.newestTransactionDate ? dayLabel(status.newestTransactionDate) : 'None yet'}
        />
        <Stat
          label="Covers"
          value={
            status.span
              ? `${dayLabel(status.span.from)} – ${dayLabel(status.span.to)}`
              : 'Not recorded'
          }
        />
        <Stat label="Cadence" value={cadenceLabel(status.cadenceDays)} />
      </CardContent>
      {drafts.length > 0 && (
        <CardContent className="space-y-2">
          <p className="text-xs tracking-wide text-muted-foreground uppercase">
            Waiting for review
          </p>
          <PendingImportList items={drafts} compact />
        </CardContent>
      )}
    </Card>
  );
}
