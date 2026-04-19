import { Clock } from 'lucide-react';

import { trpc } from '@pops/api-client';
import { Badge, Card, Skeleton } from '@pops/ui';

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
      {hasData && (
        <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
          {[
            { label: 'P50', value: latency.p50 },
            { label: 'P75', value: latency.p75 },
            { label: 'P95', value: latency.p95 },
            { label: 'P99', value: latency.p99 },
          ].map(({ label, value }) => (
            <Card key={label} className="p-4 text-center">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="text-2xl font-semibold tabular-nums">{value.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground">ms</p>
            </Card>
          ))}
        </div>
      )}

      {latency.slowQueries.length > 0 && (
        <Card className="p-4 space-y-3">
          <h3 className="font-semibold text-sm flex items-center gap-2">
            <Clock className="h-4 w-4 text-amber-500" />
            Slow Queries
          </h3>
          <div className="space-y-2">
            {latency.slowQueries.map((q) => (
              <div key={q.id} className="flex items-center justify-between text-sm">
                <div>
                  <span className="font-mono text-xs text-muted-foreground">{q.model}</span>
                  <span className="mx-2 text-muted-foreground">·</span>
                  <span className="text-muted-foreground">{q.operation}</span>
                </div>
                <div className="flex items-center gap-3">
                  {q.contextId && (
                    <span className="text-xs text-muted-foreground font-mono">
                      {q.contextId.slice(0, 8)}…
                    </span>
                  )}
                  <Badge variant="destructive" className="tabular-nums">
                    {q.latencyMs.toLocaleString()}ms
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
