import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { usePillarQuery } from '@pops/pillar-sdk/react';
import { ErrorAlert, PageHeader } from '@pops/ui';

import { AiUsageMainContent } from './ai-usage/ai-usage-main-content';
import { AiUsagePageSkeleton } from './ai-usage/ai-usage-page-skeleton';

import type { HistoryPayload } from './ai-usage/types';

interface BreakdownRow {
  key: string;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

interface StatsOutput {
  totalCalls: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCostUsd: number;
  cacheHitRate: number;
  errorRate: number;
  byProvider: BreakdownRow[];
  byModel: BreakdownRow[];
  byDomain: BreakdownRow[];
  byOperation: BreakdownRow[];
}

interface QualityMetrics {
  byModel: Array<{
    provider: string;
    model: string;
    cacheHitRate: number;
    errorRate: number;
    timeoutRate: number;
    averageLatencyMs: number;
  }>;
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
  } = usePillarQuery<StatsOutput>('core', ['aiObservability', 'getStats'], filters);

  const {
    data: history,
    isLoading: historyLoading,
    error: historyError,
  } = usePillarQuery<HistoryPayload>('core', ['aiObservability', 'getHistory'], filters);

  const { data: quality } = usePillarQuery<QualityMetrics>(
    'core',
    ['aiObservability', 'getQualityMetrics'],
    filters
  );

  const { t } = useTranslation('ai');
  const isLoading = statsLoading || historyLoading;
  const error = statsError ?? historyError;

  if (isLoading) {
    return <AiUsagePageSkeleton />;
  }

  if (error) {
    return (
      <div className="space-y-6">
        <PageHeader title={t('observability')} />
        <ErrorAlert title={t('observability.failedToLoad')} message={error.message} />
      </div>
    );
  }

  return (
    <AiUsageMainContent
      stats={stats}
      history={history}
      quality={quality}
      startDate={startDate}
      endDate={endDate}
      onStartDateChange={setStartDate}
      onEndDateChange={setEndDate}
      onClearDates={() => {
        setStartDate('');
        setEndDate('');
      }}
    />
  );
}
