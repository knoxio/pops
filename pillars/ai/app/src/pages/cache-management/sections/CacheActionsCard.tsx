import { Database } from 'lucide-react';

import { Card } from '@pops/ui';

import { ClearAllRow } from './ClearAllRow';
import { ClearStaleRow } from './ClearStaleRow';

type CacheActionsCardProps = {
  staleDays: number;
  onStaleDaysChange: (value: number) => void;
  onClearStale: () => void;
  onClearAll: () => void;
  totalEntries: number;
  clearStaleDisabled: boolean;
  clearAllDisabled: boolean;
};

export function CacheActionsCard({
  staleDays,
  onStaleDaysChange,
  onClearStale,
  onClearAll,
  totalEntries,
  clearStaleDisabled,
  clearAllDisabled,
}: CacheActionsCardProps) {
  return (
    <Card className="p-6">
      <div className="flex items-center gap-3 mb-6">
        <Database className="h-5 w-5 text-muted-foreground" />
        <h2 className="text-lg font-semibold">Clear Cache</h2>
      </div>

      <div className="space-y-4">
        <ClearStaleRow
          staleDays={staleDays}
          onStaleDaysChange={onStaleDaysChange}
          onClearStale={onClearStale}
          disabled={clearStaleDisabled}
        />
        <ClearAllRow
          totalEntries={totalEntries}
          onClearAll={onClearAll}
          disabled={clearAllDisabled}
        />
      </div>
    </Card>
  );
}
