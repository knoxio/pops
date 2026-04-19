import { PageHeader } from '@pops/ui';

import { BreakdownTable } from '../../components/BreakdownTable';
import { BudgetStatusSection } from './budget-status-section';
import { CacheManagementCard } from './cache-management-card';
import { DailyCostChart } from './daily-cost-chart';
import { DateRangeFilter } from './date-range-filter';
import { LatencySection } from './latency-section';
import { ObservabilityKpis, type ObservabilityTotals } from './observability-kpis';
import { ProviderStatusSection } from './provider-status-section';
import { QualityMetricsSection } from './quality-metrics-section';
import { UsageHistorySection } from './usage-history-section';

import type { HistoryPayload } from './types';

type BreakdownRow = {
  key: string;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
};

type BreakdownStats = {
  byProvider: BreakdownRow[];
  byModel: BreakdownRow[];
  byOperation: BreakdownRow[];
  byDomain: BreakdownRow[];
};

type QualityShape = {
  byModel: Array<{
    provider: string;
    model: string;
    cacheHitRate: number;
    errorRate: number;
    timeoutRate: number;
    averageLatencyMs: number;
  }>;
};

type AiUsageMainContentProps = {
  stats: (BreakdownStats & ObservabilityTotals) | undefined;
  history: HistoryPayload | undefined;
  quality: QualityShape | undefined;
  startDate: string;
  endDate: string;
  onStartDateChange: (v: string) => void;
  onEndDateChange: (v: string) => void;
  onClearDates: () => void;
};

export function AiUsageMainContent({
  stats,
  history,
  quality,
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
  onClearDates,
}: AiUsageMainContentProps) {
  return (
    <div className="space-y-8">
      <PageHeader
        title="AI Observability"
        description="Monitor AI usage, costs, latency, and provider health"
      />

      <ObservabilityKpis stats={stats} />

      <CacheManagementCard />

      <ProviderStatusSection />

      <BudgetStatusSection />

      <DateRangeFilter
        startDate={startDate}
        endDate={endDate}
        onStartChange={onStartDateChange}
        onEndChange={onEndDateChange}
        onClear={onClearDates}
      />

      {history && history.records.length > 0 && <DailyCostChart data={history.records} />}

      <LatencySection startDate={startDate} endDate={endDate} />

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

      {quality && <QualityMetricsSection byModel={quality.byModel} />}

      {history && <UsageHistorySection history={history} />}
    </div>
  );
}
