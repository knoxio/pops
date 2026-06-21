import { useQuery } from '@tanstack/react-query';

import { Skeleton } from '@pops/ui';

import { unwrap } from '../../ai-api-helpers.js';
import { aiObservabilityGetLatencyStats } from '../../ai-api/index.js';
import { LatencyPercentileGrid } from './latency-percentile-grid';
import { SlowQueriesCard } from './slow-queries-card';

import type { AiObservabilityGetLatencyStatsData } from '../../ai-api/types.gen.js';

type ObservabilityFilters = NonNullable<AiObservabilityGetLatencyStatsData['query']>;

export function LatencySection({ startDate, endDate }: { startDate: string; endDate: string }) {
  const filters: ObservabilityFilters = {
    ...(startDate ? { startDate } : {}),
    ...(endDate ? { endDate } : {}),
  };
  const { data: latency, isLoading } = useQuery({
    queryKey: ['ai', 'aiObservability', 'getLatencyStats', filters],
    queryFn: async () => unwrap(await aiObservabilityGetLatencyStats({ query: filters })),
  });

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
