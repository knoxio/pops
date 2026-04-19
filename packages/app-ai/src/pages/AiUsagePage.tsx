import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Database,
  RefreshCw,
  Server,
  Trash2,
} from 'lucide-react';
import { useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { toast } from 'sonner';

import { DataTable, DateInput, PageHeader, SortableHeader, StatCard } from '@pops/ui';
import { Badge, Button, Input, Label } from '@pops/ui';
import { Alert } from '@pops/ui';
import { Skeleton } from '@pops/ui';
import { Card } from '@pops/ui';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@pops/ui';

import { trpc } from '../lib/trpc';

import type { ColumnDef } from '@tanstack/react-table';

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function CacheManagement() {
  const utils = trpc.useUtils();
  const [staleDays, setStaleDays] = useState(30);

  const { data: cacheStats, isLoading: cacheLoading } = trpc.core.aiUsage.cacheStats.useQuery();

  const clearStaleMutation = trpc.core.aiUsage.clearStaleCache.useMutation({
    onSuccess: (data) => {
      toast.success(`Removed ${data.removed} stale cache entries`);
      void utils.core.aiUsage.cacheStats.invalidate();
    },
    onError: () => {
      toast.error('Failed to clear stale cache');
    },
  });

  const clearAllMutation = trpc.core.aiUsage.clearAllCache.useMutation({
    onSuccess: (data) => {
      toast.success(`Cleared ${data.removed} cache entries`);
      void utils.core.aiUsage.cacheStats.invalidate();
    },
    onError: () => {
      toast.error('Failed to clear cache');
    },
  });

  if (cacheLoading) {
    return <Skeleton className="h-24" />;
  }

  return (
    <Card className="p-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Database className="h-5 w-5 text-muted-foreground" />
          <div>
            <h3 className="font-semibold">AI Cache</h3>
            <p className="text-sm text-muted-foreground">
              {cacheStats?.totalEntries.toLocaleString() ?? 0} entries
              {cacheStats ? ` (${formatBytes(cacheStats.diskSizeBytes)})` : ''}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5">
            <Label
              htmlFor="stale-days"
              className="text-muted-foreground whitespace-nowrap font-normal"
            >
              Older than
            </Label>
            <Input
              id="stale-days"
              type="number"
              min={1}
              max={365}
              value={staleDays}
              onChange={(e) => setStaleDays(Number(e.target.value) || 30)}
              className="w-16 h-8 px-2 py-1 text-sm text-center"
            />
            <span className="text-sm text-muted-foreground">days</span>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => clearStaleMutation.mutate({ maxAgeDays: staleDays })}
            disabled={clearStaleMutation.isPending || (cacheStats?.totalEntries ?? 0) === 0}
          >
            Clear Stale
          </Button>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive"
                disabled={clearAllMutation.isPending || (cacheStats?.totalEntries ?? 0) === 0}
              >
                <Trash2 className="mr-1 h-3.5 w-3.5" />
                Clear All
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Clear entire AI cache?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will remove all {cacheStats?.totalEntries.toLocaleString() ?? 0} cached
                  categorization results. Future transactions will require new API calls.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  variant="ghost"
                  className="text-destructive hover:text-destructive"
                  onClick={() => clearAllMutation.mutate()}
                >
                  Clear All
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
    </Card>
  );
}

interface HistoryRecord {
  date: string;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  cacheHits: number;
  errors: number;
}

function DailyCostChart({ data }: { data: HistoryRecord[] }) {
  const chartData = [...data]
    .toSorted((a, b) => a.date.localeCompare(b.date))
    .map((d) => ({
      date: new Date(d.date).toLocaleDateString('en-AU', { day: '2-digit', month: 'short' }),
      cost: d.costUsd,
      calls: d.calls,
    }));

  if (chartData.length === 0) return null;

  return (
    <Card className="p-4">
      <h3 className="font-semibold mb-4">Daily Cost</h3>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={chartData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 12 }}
            className="fill-muted-foreground"
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            tick={{ fontSize: 12 }}
            className="fill-muted-foreground"
            tickFormatter={(v: number) => `$${v.toFixed(3)}`}
            tickLine={false}
            axisLine={false}
            width={60}
          />
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const item = payload[0]?.payload as { date: string; cost: number; calls: number };
              return (
                <div className="rounded-lg border bg-background p-2 shadow-md text-sm">
                  <p className="font-medium">{item.date}</p>
                  <p className="text-amber-600">Cost: ${item.cost.toFixed(4)}</p>
                  <p className="text-muted-foreground">{item.calls} calls</p>
                </div>
              );
            }}
          />
          <Bar dataKey="cost" fill="var(--color-chart-1)" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </Card>
  );
}

function ProviderStatusSection() {
  const utils = trpc.useUtils();
  const { data: providers, isLoading } = trpc.core.aiProviders.list.useQuery();

  const healthCheckMutation = trpc.core.aiProviders.healthCheck.useMutation({
    onSuccess: (result) => {
      if (result.status === 'active') {
        toast.success(`Provider healthy (${result.latencyMs}ms)`);
      } else {
        toast.error(`Provider unhealthy: ${result.error ?? 'unknown error'}`);
      }
      void utils.core.aiProviders.list.invalidate();
    },
    onError: () => toast.error('Health check failed'),
  });

  if (isLoading) return <Skeleton className="h-32" />;
  if (!providers?.length) return null;

  return (
    <div className="space-y-3">
      <h2 className="text-xl font-semibold">Providers</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {providers.map((p) => (
          <Card key={p.id} className="p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <Server className="h-4 w-4 text-muted-foreground shrink-0" />
                <div>
                  <p className="font-medium text-sm">{p.name}</p>
                  <p className="text-xs text-muted-foreground capitalize">{p.type}</p>
                </div>
              </div>
              <Badge
                variant={p.status === 'active' ? 'default' : 'destructive'}
                className="shrink-0"
              >
                {p.status === 'active' ? (
                  <CheckCircle2 className="mr-1 h-3 w-3" />
                ) : (
                  <AlertCircle className="mr-1 h-3 w-3" />
                )}
                {p.status}
              </Badge>
            </div>
            <div className="mt-3 flex items-center justify-between">
              <div className="text-xs text-muted-foreground">
                {p.models.length} model{p.models.length !== 1 ? 's' : ''}
                {p.lastLatencyMs != null && ` · ${p.lastLatencyMs}ms`}
              </div>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={() => healthCheckMutation.mutate({ providerId: p.id })}
                disabled={healthCheckMutation.isPending}
              >
                <RefreshCw className="mr-1 h-3 w-3" />
                Check
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

function BudgetStatusSection() {
  const { data: budgetStatuses, isLoading } = trpc.core.aiBudgets.getBudgetStatus.useQuery();

  if (isLoading) return <Skeleton className="h-24" />;
  if (!budgetStatuses?.length) return null;

  return (
    <div className="space-y-3">
      <h2 className="text-xl font-semibold">Budgets</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {budgetStatuses.map((b) => {
          const pct = b.percentageUsed ?? 0;
          const barColor =
            pct >= 80 ? 'bg-destructive' : pct >= 60 ? 'bg-amber-500' : 'bg-emerald-500';
          return (
            <Card key={b.id} className="p-4 space-y-2">
              <div className="flex items-center justify-between">
                <p className="font-medium text-sm capitalize">
                  {b.scopeValue ? `${b.scopeType}: ${b.scopeValue}` : b.scopeType}
                </p>
                <Badge variant="outline" className="text-xs">
                  {b.action}
                </Badge>
              </div>
              <div className="w-full bg-muted rounded-full h-2">
                <div
                  className={`h-2 rounded-full transition-all ${barColor}`}
                  style={{ width: `${Math.min(pct, 100)}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>
                  {b.monthlyCostLimit != null
                    ? `$${b.currentCostUsage.toFixed(4)} / $${b.monthlyCostLimit.toFixed(2)}`
                    : b.monthlyTokenLimit != null
                      ? `${b.currentTokenUsage.toLocaleString()} / ${b.monthlyTokenLimit.toLocaleString()} tokens`
                      : 'No limit'}
                </span>
                {b.projectedExhaustionDate && (
                  <span className="text-amber-600">Exhausts {b.projectedExhaustionDate}</span>
                )}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function LatencySection({ startDate, endDate }: { startDate: string; endDate: string }) {
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

function BreakdownTable({
  title,
  data,
}: {
  title: string;
  data: {
    key: string;
    calls: number;
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
  }[];
}) {
  type Row = (typeof data)[number];
  const columns: ColumnDef<Row>[] = [
    {
      accessorKey: 'key',
      header: title,
      cell: ({ row }) => <span className="font-mono text-sm">{row.original.key}</span>,
    },
    {
      accessorKey: 'calls',
      header: ({ column }) => (
        <div className="flex justify-end">
          <SortableHeader column={column}>Calls</SortableHeader>
        </div>
      ),
      cell: ({ row }) => (
        <div className="text-right tabular-nums">{row.original.calls.toLocaleString()}</div>
      ),
    },
    {
      id: 'tokens',
      header: () => <div className="text-right">Tokens</div>,
      cell: ({ row }) => (
        <div className="text-right text-sm tabular-nums text-muted-foreground">
          {(row.original.inputTokens + row.original.outputTokens).toLocaleString()}
        </div>
      ),
    },
    {
      accessorKey: 'costUsd',
      header: ({ column }) => (
        <div className="flex justify-end">
          <SortableHeader column={column}>Cost</SortableHeader>
        </div>
      ),
      cell: ({ row }) => (
        <div className="text-right font-mono font-medium tabular-nums">
          ${row.original.costUsd.toFixed(4)}
        </div>
      ),
    },
  ];

  if (data.length === 0) return null;

  return (
    <div className="space-y-2">
      <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
        By {title}
      </h3>
      <DataTable columns={columns} data={data} />
    </div>
  );
}

export function AiUsagePage() {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const filters = {
    ...(startDate ? { startDate } : {}),
    ...(endDate ? { endDate } : {}),
  };

  const {
    data: stats,
    isLoading: statsLoading,
    error: statsError,
  } = trpc.core.aiObservability.getStats.useQuery(filters);

  const {
    data: history,
    isLoading: historyLoading,
    error: historyError,
  } = trpc.core.aiObservability.getHistory.useQuery(filters);

  const { data: quality } = trpc.core.aiObservability.getQualityMetrics.useQuery(filters);

  const isLoading = statsLoading || historyLoading;
  const error = statsError ?? historyError;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="AI Observability"
          description="Monitor AI usage, costs, latency, and provider health"
        />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {(['cost', 'calls', 'cache', 'error'] as const).map((k) => (
            <Skeleton key={k} className="h-32" />
          ))}
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <PageHeader title="AI Observability" />
        <Alert variant="destructive">
          <h3 className="font-semibold">Failed to load observability data</h3>
          <p className="text-sm mt-1">{error.message}</p>
        </Alert>
      </div>
    );
  }

  const cacheHitPct = ((stats?.cacheHitRate ?? 0) * 100).toFixed(1);
  const errorPct = ((stats?.errorRate ?? 0) * 100).toFixed(1);

  const historyColumns: ColumnDef<HistoryRecord>[] = [
    {
      accessorKey: 'date',
      header: ({ column }) => <SortableHeader column={column}>Date</SortableHeader>,
      cell: ({ row }) =>
        new Date(row.original.date).toLocaleDateString('en-AU', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
        }),
    },
    {
      accessorKey: 'calls',
      header: ({ column }) => (
        <div className="flex justify-end">
          <SortableHeader column={column}>Calls</SortableHeader>
        </div>
      ),
      cell: ({ row }) => (
        <div className="text-right tabular-nums">{row.original.calls.toLocaleString()}</div>
      ),
    },
    {
      accessorKey: 'cacheHits',
      header: () => <div className="text-right">Cache Hits</div>,
      cell: ({ row }) => (
        <div className="text-right tabular-nums">{row.original.cacheHits.toLocaleString()}</div>
      ),
    },
    {
      id: 'cacheRate',
      header: () => <div className="text-right">Hit Rate</div>,
      cell: ({ row }) => {
        const total = row.original.calls + row.original.cacheHits;
        const rate = total > 0 ? (row.original.cacheHits / total) * 100 : 0;
        return (
          <div className="text-right">
            <Badge variant={rate > 80 ? 'default' : rate > 50 ? 'secondary' : 'outline'}>
              {rate.toFixed(1)}%
            </Badge>
          </div>
        );
      },
    },
    {
      accessorKey: 'inputTokens',
      header: () => <div className="text-right">Input Tokens</div>,
      cell: ({ row }) => (
        <div className="text-right font-mono text-sm tabular-nums">
          {row.original.inputTokens.toLocaleString()}
        </div>
      ),
    },
    {
      accessorKey: 'outputTokens',
      header: () => <div className="text-right">Output Tokens</div>,
      cell: ({ row }) => (
        <div className="text-right font-mono text-sm tabular-nums">
          {row.original.outputTokens.toLocaleString()}
        </div>
      ),
    },
    {
      accessorKey: 'costUsd',
      header: ({ column }) => (
        <div className="flex justify-end">
          <SortableHeader column={column}>Cost</SortableHeader>
        </div>
      ),
      cell: ({ row }) => (
        <div className="text-right font-mono font-medium tabular-nums">
          ${row.original.costUsd.toFixed(4)}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-8">
      <PageHeader
        title="AI Observability"
        description="Monitor AI usage, costs, latency, and provider health"
      />

      {/* KPI Cards */}
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
          description={`${((stats?.totalInputTokens ?? 0) + (stats?.totalOutputTokens ?? 0)).toLocaleString()} tokens`}
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

      {/* Cache Management */}
      <CacheManagement />

      {/* Provider Status */}
      <ProviderStatusSection />

      {/* Budget Status */}
      <BudgetStatusSection />

      {/* Date Range Filter */}
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm font-medium">Date Range:</span>
        <DateInput
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          size="sm"
          aria-label="Start date"
        />
        <span className="text-sm text-muted-foreground">to</span>
        <DateInput
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
          size="sm"
          aria-label="End date"
        />
        {(startDate || endDate) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setStartDate('');
              setEndDate('');
            }}
          >
            Clear
          </Button>
        )}
      </div>

      {/* Daily Cost Chart */}
      {history && history.records.length > 0 && <DailyCostChart data={history.records} />}

      {/* Latency Section */}
      <LatencySection startDate={startDate} endDate={endDate} />

      {/* Breakdowns */}
      {stats && (
        <div className="space-y-6">
          <h2 className="text-xl font-semibold">Breakdowns</h2>
          <div className="grid gap-6 lg:grid-cols-2">
            <BreakdownTable title="Provider" data={stats.byProvider} />
            <BreakdownTable title="Model" data={stats.byModel} />
            <BreakdownTable title="Operation" data={stats.byOperation} />
            <BreakdownTable title="Domain" data={stats.byDomain} />
          </div>
        </div>
      )}

      {/* Quality Metrics */}
      {quality && quality.byModel.length > 0 && (
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
                {quality.byModel.map((m) => (
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
      )}

      {/* Usage History Table */}
      {history && history.records.length > 0 ? (
        <div className="space-y-4">
          <div>
            <h2 className="text-xl font-semibold">Daily History</h2>
            <p className="text-sm text-muted-foreground">
              {history.records.length} days · Total: ${history.summary.totalCostUsd.toFixed(4)}
            </p>
          </div>
          <DataTable columns={historyColumns} data={history.records} />
        </div>
      ) : (
        <Card className="p-12 text-center">
          <p className="text-muted-foreground">No AI usage data yet</p>
          <p className="text-sm text-muted-foreground mt-2">
            AI observability data will appear here after the first AI call
          </p>
        </Card>
      )}
    </div>
  );
}
