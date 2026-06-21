import { StatCard } from '@pops/ui';

export type ObservabilityTotals = {
  totalCostUsd?: number;
  totalCalls?: number;
  totalInputTokens?: number;
  totalOutputTokens?: number;
  cacheHitRate?: number;
  errorRate?: number;
};

type NormalizedTotals = Required<ObservabilityTotals>;

function num(value: number | undefined): number {
  return value ?? 0;
}

function normalizeTotals(stats: ObservabilityTotals | undefined): NormalizedTotals {
  return {
    totalCostUsd: num(stats?.totalCostUsd),
    totalCalls: num(stats?.totalCalls),
    totalInputTokens: num(stats?.totalInputTokens),
    totalOutputTokens: num(stats?.totalOutputTokens),
    cacheHitRate: num(stats?.cacheHitRate),
    errorRate: num(stats?.errorRate),
  };
}

type DerivedKpis = {
  totalCost: string;
  totalCalls: string;
  totalTokens: string;
  cacheHitPct: string;
  errorPct: string;
  errorColor: 'rose' | 'sky';
};

function deriveKpis(stats: ObservabilityTotals | undefined): DerivedKpis {
  const t = normalizeTotals(stats);
  const errorPct = (t.errorRate * 100).toFixed(1);
  return {
    totalCost: `$${t.totalCostUsd.toFixed(4)}`,
    totalCalls: t.totalCalls.toLocaleString(),
    totalTokens: (t.totalInputTokens + t.totalOutputTokens).toLocaleString(),
    cacheHitPct: (t.cacheHitRate * 100).toFixed(1),
    errorPct,
    errorColor: Number(errorPct) > 5 ? 'rose' : 'sky',
  };
}

export function ObservabilityKpis({ stats }: { stats: ObservabilityTotals | undefined }) {
  const k = deriveKpis(stats);

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <StatCard
        title="Total Cost"
        value={k.totalCost}
        description={`${k.totalCalls} total calls`}
        color="amber"
      />
      <StatCard
        title="Total Calls"
        value={k.totalCalls}
        description={`${k.totalTokens} tokens`}
        color="indigo"
      />
      <StatCard
        title="Cache Hit Rate"
        value={`${k.cacheHitPct}%`}
        description="Calls served from cache"
        color="emerald"
      />
      <StatCard
        title="Error Rate"
        value={`${k.errorPct}%`}
        description="Errors, timeouts, blocked"
        color={k.errorColor}
      />
    </div>
  );
}
