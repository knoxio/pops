import { usePillarQuery } from '@pops/pillar-sdk/react';
import { Skeleton } from '@pops/ui';

import { LatencyPercentileGrid } from './latency-percentile-grid';
import { SlowQueriesCard } from './slow-queries-card';

interface SlowQuery {
  id: number;
  model: string;
  operation: string;
  latencyMs: number;
  createdAt: string;
  contextId: string | null;
}

interface LatencyStats {
  p50: number;
  p75: number;
  p95: number;
  p99: number;
  avg: number;
  slowQueries: SlowQuery[];
}

export function LatencySection({ startDate, endDate }: { startDate: string; endDate: string }) {
  const filters = {
    ...(startDate ? { startDate } : {}),
    ...(endDate ? { endDate } : {}),
  };
  const { data: latency, isLoading } = usePillarQuery<LatencyStats>(
    'core',
    ['aiObservability', 'getLatencyStats'],
    filters
  );

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
