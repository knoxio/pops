import { RefreshCw, Upload } from 'lucide-react';
import { Link } from 'react-router';

import { Button } from '@pops/ui';

import { useSyncNow } from '../../components/imports/live/useSyncNow';

import type { ImportConfigWire } from './types';

/**
 * Why `Sync now` is not on offer, or null when it is. Said beside the
 * button rather than in a tooltip on it: a disabled control does not fire
 * the pointer events a tooltip waits for, so the reason would be invisible
 * exactly when it is needed.
 */
export function syncRefusal(config: ImportConfigWire | null): string | null {
  if (config === null || config.sourceKind !== 'api') {
    return 'Only an account fed by a provider API can be synced.';
  }
  if (config.provider !== 'up') return 'No client exists for this provider yet.';
  if (config.secretRef === null) {
    return 'This account names no secret to read its token from, so nothing can authenticate.';
  }
  return null;
}

/** What a finished pass says, in the words of what it actually did. */
export function syncOutcomeLine(staged: number, settled: number): string {
  if (staged === 0 && settled === 0) return 'Up had nothing new.';
  const parts = [];
  if (staged > 0) parts.push(`${staged} staged for review`);
  if (settled > 0) parts.push(`${settled} settled`);
  return `${parts.join(', ')}.`;
}

export function ImportActions({
  accountId,
  config,
}: {
  accountId: string;
  config: ImportConfigWire | null;
}) {
  const sync = useSyncNow(accountId);
  const refusal = syncRefusal(config);
  const result = sync.lastJob?.result;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {result !== undefined && result !== null && (
        <span className="text-xs text-muted-foreground">
          {syncOutcomeLine(result.staged, result.settled)}
        </span>
      )}
      {sync.error && <span className="text-xs text-destructive">{sync.error.message}</span>}
      {refusal !== null && <span className="text-xs text-muted-foreground">{refusal}</span>}
      <Button
        size="sm"
        variant="outline"
        prefix={<RefreshCw className={sync.isSyncing ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />}
        onClick={sync.syncNow}
        disabled={refusal !== null || sync.isSyncing}
      >
        {sync.isSyncing ? 'Syncing…' : 'Sync now'}
      </Button>
      <Button size="sm" asChild prefix={<Upload className="h-4 w-4" />}>
        <Link to={`/finance/import?account=${accountId}`}>Import file</Link>
      </Button>
    </div>
  );
}
