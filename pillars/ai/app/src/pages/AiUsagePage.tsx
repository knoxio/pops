import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ErrorAlert, PageHeader } from '@pops/ui';

import { unwrap } from '../ai-api-helpers.js';
import {
  aiObservabilityGetHistory,
  aiObservabilityGetQualityMetrics,
  aiObservabilityGetStats,
} from '../ai-api/index.js';
import { AiUsageMainContent } from './ai-usage/ai-usage-main-content';
import { AiUsagePageSkeleton } from './ai-usage/ai-usage-page-skeleton';

import type {
  AiObservabilityGetHistoryData,
  AiObservabilityGetQualityMetricsResponse,
  AiObservabilityGetStatsResponse,
} from '../ai-api/types.gen.js';

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
    queryKey: ['ai', 'aiObservability', 'getStats', filters],
    queryFn: async () => unwrap(await aiObservabilityGetStats({ query: filters })),
  });

  const {
    data: history,
    isLoading: historyLoading,
    error: historyError,
  } = useQuery({
    queryKey: ['ai', 'aiObservability', 'getHistory', filters],
    queryFn: async () => unwrap(await aiObservabilityGetHistory({ query: filters })),
  });

  const { data: quality } = useQuery<AiObservabilityGetQualityMetricsResponse>({
    queryKey: ['ai', 'aiObservability', 'getQualityMetrics', filters],
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
