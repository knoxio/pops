import { Database } from 'lucide-react';

import { Card, formatBytes, Skeleton } from '@pops/ui';

import { ClearAllControl } from './cache-management/ClearAllControl';
import { StaleEntriesControl } from './cache-management/StaleEntriesControl';
import { useCacheCardModel } from './cache-management/useCacheCardModel';

export function CacheManagementCard() {
  const { staleDays, setStaleDays, cacheStats, isLoading, clearStaleMutation, clearAllMutation } =
    useCacheCardModel();

  if (isLoading) {
    return <Skeleton className="h-24" />;
  }

  const totalEntries = cacheStats?.totalEntries ?? 0;
  const hasEntries = totalEntries > 0;

  return (
    <Card className="p-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Database className="h-5 w-5 text-muted-foreground" />
          <div>
            <h3 className="font-semibold">AI Cache</h3>
            <p className="text-sm text-muted-foreground">
              {totalEntries.toLocaleString()} entries
              {cacheStats ? ` (${formatBytes(cacheStats.diskSizeBytes)})` : ''}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <StaleEntriesControl
            staleDays={staleDays}
            onStaleDaysChange={setStaleDays}
            onClearStale={() => clearStaleMutation.mutate({ maxAgeDays: staleDays })}
            disabled={clearStaleMutation.isPending || !hasEntries}
          />
          <ClearAllControl
            totalEntries={totalEntries}
            onClearAll={() => clearAllMutation.mutate()}
            disabled={clearAllMutation.isPending || !hasEntries}
          />
        </div>
      </div>
    </Card>
  );
}
