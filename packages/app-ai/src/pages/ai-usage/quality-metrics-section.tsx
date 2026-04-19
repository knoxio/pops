type QualityModelRow = {
  provider: string;
  model: string;
  cacheHitRate: number;
  errorRate: number;
  timeoutRate: number;
  averageLatencyMs: number;
};

export function QualityMetricsSection({ byModel }: { byModel: QualityModelRow[] }) {
  if (byModel.length === 0) return null;

  return (
    <div className="space-y-3">
      <h2 className="text-xl font-semibold">Quality Metrics</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="pb-2 pr-4">Model</th>
              <th className="pb-2 px-4 text-right">Cache Hit</th>
              <th className="pb-2 px-4 text-right">Error Rate</th>
              <th className="pb-2 px-4 text-right">Timeout Rate</th>
              <th className="pb-2 pl-4 text-right">Avg Latency</th>
            </tr>
          </thead>
          <tbody>
            {byModel.map((m) => (
              <tr key={`${m.provider}:${m.model}`} className="border-b last:border-0">
                <td className="py-2 pr-4 font-mono text-xs">{m.model}</td>
                <td className="py-2 px-4 text-right tabular-nums">
                  {(m.cacheHitRate * 100).toFixed(1)}%
                </td>
                <td className="py-2 px-4 text-right tabular-nums">
                  <span className={m.errorRate > 0.05 ? 'text-destructive' : ''}>
                    {(m.errorRate * 100).toFixed(1)}%
                  </span>
                </td>
                <td className="py-2 px-4 text-right tabular-nums">
                  {(m.timeoutRate * 100).toFixed(1)}%
                </td>
                <td className="py-2 pl-4 text-right tabular-nums font-mono">
                  {m.averageLatencyMs.toFixed(0)}ms
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
