import { Card, DataTable } from '@pops/ui';

import { buildHistoryColumns } from './history-columns';

import type { HistoryPayload } from './types';

export function UsageHistorySection({ history }: { history: HistoryPayload }) {
  const historyColumns = buildHistoryColumns();

  if (history.records.length === 0) {
    return (
      <Card className="p-12 text-center">
        <p className="text-muted-foreground">No AI usage data yet</p>
        <p className="text-sm text-muted-foreground mt-2">
          AI observability data will appear here after the first AI call
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold">Daily History</h2>
        <p className="text-sm text-muted-foreground">
          {history.records.length} days · Total: ${history.summary.totalCostUsd.toFixed(4)}
        </p>
      </div>
      <DataTable columns={historyColumns} data={history.records} />
    </div>
  );
}
