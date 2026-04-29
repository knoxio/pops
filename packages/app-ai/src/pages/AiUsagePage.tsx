import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { trpc } from '@pops/api-client';
import { ErrorAlert, PageHeader } from '@pops/ui';

import { AiUsageMainContent } from './ai-usage/ai-usage-main-content';
import { AiUsagePageSkeleton } from './ai-usage/ai-usage-page-skeleton';

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
