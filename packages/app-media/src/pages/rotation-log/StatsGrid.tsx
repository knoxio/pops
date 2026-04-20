import { RotateCw, ScrollText, TrendingUp } from 'lucide-react';

import { Skeleton } from '@pops/ui';

interface Stats {
  totalRotated: number;
  avgPerDay: number;
  streak: number;
}

function StatTile({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof RotateCw;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Icon className="h-4 w-4" />
        {label}
      </div>
      <p className="mt-1 text-2xl font-bold tabular-nums">{value}</p>
    </div>
  );
}

export function StatsGrid({ stats, isLoading }: { stats: Stats | undefined; isLoading: boolean }) {
  if (isLoading) {
    return (
      <div className="grid gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-full rounded-lg" />
        ))}
      </div>
    );
  }
  if (!stats) return null;
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <StatTile icon={RotateCw} label="Total Rotated" value={stats.totalRotated} />
      <StatTile icon={TrendingUp} label="Avg / Day" value={stats.avgPerDay} />
      <StatTile
        icon={ScrollText}
        label="Streak"
        value={`${stats.streak} cycle${stats.streak !== 1 ? 's' : ''}`}
      />
    </div>
  );
}
