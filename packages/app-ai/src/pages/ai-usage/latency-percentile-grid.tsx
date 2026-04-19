import { Card } from '@pops/ui';

type LatencyPercentiles = {
  p50: number;
  p75: number;
  p95: number;
  p99: number;
};

export function LatencyPercentileGrid({ latency }: { latency: LatencyPercentiles }) {
  const items = [
    { label: 'P50', value: latency.p50 },
    { label: 'P75', value: latency.p75 },
    { label: 'P95', value: latency.p95 },
    { label: 'P99', value: latency.p99 },
  ];
  return (
    <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
      {items.map(({ label, value }) => (
        <Card key={label} className="p-4 text-center">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-2xl font-semibold tabular-nums">{value.toLocaleString()}</p>
          <p className="text-xs text-muted-foreground">ms</p>
        </Card>
      ))}
    </div>
  );
}
