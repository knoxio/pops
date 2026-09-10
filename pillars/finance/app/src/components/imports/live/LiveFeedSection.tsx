import { Radio, RefreshCw } from 'lucide-react';
import { useNavigate } from 'react-router';

import { Button, Card, CardContent, CardHeader, CardTitle, formatCents } from '@pops/ui';

import { dayLabel, whenLabel } from '../pending/pending-import-view';
import { draftUrl, usePendingImports } from '../pending/usePendingImports';
import { useSyncNow } from './useSyncNow';

import type { AccountOption } from '@pops/ui';

import type { PendingImportItem } from '../pending/pending-import-view';

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-0.5">
      <p className="text-xs tracking-wide text-muted-foreground uppercase">{label}</p>
      <p className="text-sm font-medium tabular-nums">{value}</p>
    </div>
  );
}

function Arrived({ item, currency }: { item: PendingImportItem; currency: string }) {
  const navigate = useNavigate();
  const { draft } = item;
  const need = draft.unresolvedCount;
  return (
    <>
      <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Arrived" value={`${draft.rowCount} transactions`} />
        <Stat
          label="Covering"
          value={
            draft.span
              ? `${dayLabel(draft.span.from)} – ${dayLabel(draft.span.to)}`
              : 'Not recorded'
          }
        />
        <Stat label="Newest" value={whenLabel(draft.savedAt)} />
        <Stat
          label="Balance reported"
          value={
            draft.balanceReportedCents === null
              ? 'Not reported'
              : formatCents(draft.balanceReportedCents, currency)
          }
        />
      </CardContent>
      <CardContent className="flex items-center justify-between gap-3 text-sm">
        <p className="text-muted-foreground">
          {need === 0 ? 'Nothing needs a decision yet.' : `${need} need a decision.`}
        </p>
        <Button size="sm" onClick={() => void navigate(draftUrl(draft.id))}>
          Next: process what arrived
        </Button>
      </CardContent>
    </>
  );
}

const WAITING_LINE =
  'Nothing has arrived since the last sync. Up sends each transaction as it settles, so the next one appears here on its own.';

function syncLine(sync: ReturnType<typeof useSyncNow>): string {
  if (sync.error) return sync.error.message;
  const finished = sync.lastJob;
  if (finished !== null && (finished.result?.staged ?? 0) === 0) {
    return 'Up had nothing new. The next transaction appears here on its own.';
  }
  return WAITING_LINE;
}

function NothingYet({ accountId }: { accountId: string }) {
  const sync = useSyncNow(accountId);
  return (
    <CardContent className="flex items-center justify-between gap-3 text-sm">
      <p className="text-muted-foreground">{syncLine(sync)}</p>
      <Button
        size="sm"
        variant="outline"
        prefix={<RefreshCw className={sync.isSyncing ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />}
        onClick={sync.syncNow}
        disabled={sync.isSyncing}
      >
        {sync.isSyncing ? 'Syncing…' : 'Sync now'}
      </Button>
    </CardContent>
  );
}

/**
 * What a live-fed account has waiting, shown as soon as an Up account is
 * picked (POPS-3335). There is no file, so Upload and Map columns are
 * skipped: Next opens the account's collecting draft on Process, with its
 * rows already classified. With nothing waiting, Sync now asks Up directly.
 */
export function LiveFeedSection({ account }: { account: AccountOption & { currency?: string } }) {
  const { items } = usePendingImports();
  const live = items?.find(
    (item) => item.draft.accountId === account.id && item.draft.state === 'live'
  );
  return (
    <Card>
      <CardHeader className="flex flex-row items-center gap-2 space-y-0">
        <Radio className="h-4 w-4 text-primary" aria-hidden />
        <CardTitle className="text-sm font-medium">
          {live ? 'Waiting from the Up live feed' : 'Up live feed'}
        </CardTitle>
      </CardHeader>
      {live ? (
        <Arrived item={live} currency={account.currency ?? 'AUD'} />
      ) : (
        <NothingYet accountId={account.id} />
      )}
    </Card>
  );
}
