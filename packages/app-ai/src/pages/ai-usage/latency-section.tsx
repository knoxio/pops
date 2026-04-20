import { trpc } from '@pops/api-client';
import { Skeleton } from '@pops/ui';

import { LatencyPercentileGrid } from './latency-percentile-grid';
import { SlowQueriesCard } from './slow-queries-card';

export function LatencySection({ startDate, endDate }: { startDate: string; endDate: string }) {
  const filters = {
    ...(startDate ? { startDate } : {}),
    ...(endDate ? { endDate } : {}),
  };
  const { data: latency, isLoading } = trpc.core.aiObservability.getLatencyStats.useQuery(filters);

  if (isLoading) return <Skeleton className="h-40" />;
  if (!latency) return null;

  const hasData = latency.p50 > 0 || latency.p95 > 0;
  if (!hasData && latency.slowQueries.length === 0) return null;

  return (
    <div className="space-y-3">
      <h2 className="text-xl font-semibold">Latency</h2>
      {hasData && <LatencyPercentileGrid latency={latency} />}
      {latency.slowQueries.length > 0 && <SlowQueriesCard queries={latency.slowQueries} />}
    </div>
  );
}
