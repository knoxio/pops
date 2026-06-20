import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ErrorAlert, PageHeader } from '@pops/ui';

import { unwrap } from '../core-api-helpers.js';
import {
  aiObservabilityGetHistory,
  aiObservabilityGetQualityMetrics,
  aiObservabilityGetStats,
} from '../core-api/index.js';
import { AiUsageMainContent } from './ai-usage/ai-usage-main-content';
import { AiUsagePageSkeleton } from './ai-usage/ai-usage-page-skeleton';

import type {
  AiObservabilityGetHistoryData,
  AiObservabilityGetQualityMetricsResponse,
  AiObservabilityGetStatsResponse,
} from '../core-api/types.gen.js';

type ObservabilityFilters = NonNullable<AiObservabilityGetHistoryData['query']>;

export function AiUsagePage() {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const filters: ObservabilityFilters = {
    ...(startDate ? { startDate } : {}),
    ...(endDate ? { endDate } : {}),
  };

  const {
    data: stats,
    isLoading: statsLoading,
    error: statsError,
  } = useQuery<AiObservabilityGetStatsResponse>({
    queryKey: ['core', 'aiObservability', 'getStats', filters],
    queryFn: async () => unwrap(await aiObservabilityGetStats({ query: filters })),
  });

  const {
    data: history,
    isLoading: historyLoading,
    error: historyError,
  } = useQuery({
    queryKey: ['core', 'aiObservability', 'getHistory', filters],
    queryFn: async () => unwrap(await aiObservabilityGetHistory({ query: filters })),
  });

  const { data: quality } = useQuery<AiObservabilityGetQualityMetricsResponse>({
    queryKey: ['core', 'aiObservability', 'getQualityMetrics', filters],
    queryFn: async () => unwrap(await aiObservabilityGetQualityMetrics({ query: filters })),
  });

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
