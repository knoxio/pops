import { StatCard } from '@pops/ui';

export type ObservabilityTotals = {
  totalCostUsd?: number;
  totalCalls?: number;
  totalInputTokens?: number;
  totalOutputTokens?: number;
  cacheHitRate?: number;
  errorRate?: number;
};

export function ObservabilityKpis({ stats }: { stats: ObservabilityTotals | undefined }) {
  const cacheHitPct = ((stats?.cacheHitRate ?? 0) * 100).toFixed(1);
  const errorPct = ((stats?.errorRate ?? 0) * 100).toFixed(1);
  const totalTokens = (
    (stats?.totalInputTokens ?? 0) + (stats?.totalOutputTokens ?? 0)
  ).toLocaleString();

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <StatCard
        title="Total Cost"
        value={`$${(stats?.totalCostUsd ?? 0).toFixed(4)}`}
        description={`${(stats?.totalCalls ?? 0).toLocaleString()} total calls`}
        color="amber"
      />
      <StatCard
        title="Total Calls"
        value={(stats?.totalCalls ?? 0).toLocaleString()}
        description={`${totalTokens} tokens`}
        color="indigo"
      />
      <StatCard
        title="Cache Hit Rate"
        value={`${cacheHitPct}%`}
        description="Calls served from cache"
        color="emerald"
      />
      <StatCard
        title="Error Rate"
        value={`${errorPct}%`}
        description="Errors, timeouts, blocked"
        color={Number(errorPct) > 5 ? 'rose' : 'sky'}
      />
    </div>
  );
}
