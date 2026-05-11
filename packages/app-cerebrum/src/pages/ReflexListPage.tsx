import { Zap } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { trpc } from '@pops/api-client';
import {
  Button,
  EmptyState,
  PageHeader,
  Skeleton,
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from '@pops/ui';

import { extractMessage } from '../utils/errors';
import { TOUCH_TARGET_MIN_HEIGHT } from '../utils/touchTarget';
import { ReflexRow } from './reflex-list/ReflexRow';

import type { ReflexWithStatus } from '../reflex/types';

function LoadingState() {
  return (
    <div className="space-y-2" data-testid="reflex-loading">
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  const { t } = useTranslation('cerebrum');
  return (
    <div className="p-6 text-center" data-testid="reflex-error">
      <p className="text-destructive mb-3">{t('reflex.list.error', { message })}</p>
      <Button variant="outline" size="sm" onClick={onRetry} className={TOUCH_TARGET_MIN_HEIGHT}>
        {t('reflex.list.retry')}
      </Button>
    </div>
  );
}

function EmptyReflexes() {
  const { t } = useTranslation('cerebrum');
  return (
    <EmptyState
      icon={Zap}
      title={t('reflex.list.empty.title')}
      description={t('reflex.list.empty.description')}
    />
  );
}

interface ReflexListMutations {
  isPending: boolean;
  onToggle: (name: string, next: boolean) => void;
  onTest: (name: string) => void;
}

function useReflexListMutations(): ReflexListMutations {
  const { t } = useTranslation('cerebrum');
  const utils = trpc.useUtils();
  const invalidate = () => {
    void utils.cerebrum.reflex.list.invalidate();
  };
  const enableMutation = trpc.cerebrum.reflex.enable.useMutation({
    onSuccess: invalidate,
    onError: (err) => toast.error(extractMessage(err, t('errors.unknown'))),
  });
  const disableMutation = trpc.cerebrum.reflex.disable.useMutation({
    onSuccess: invalidate,
    onError: (err) => toast.error(extractMessage(err, t('errors.unknown'))),
  });
  const testMutation = trpc.cerebrum.reflex.test.useMutation({
    onSuccess: () => {
      invalidate();
      toast.success(t('reflex.list.fireSuccess'));
    },
    onError: (err) => toast.error(extractMessage(err, t('errors.unknown'))),
  });
  return {
    isPending: enableMutation.isPending || disableMutation.isPending || testMutation.isPending,
    onToggle: (name, next) =>
      next ? enableMutation.mutate({ name }) : disableMutation.mutate({ name }),
    onTest: (name) => testMutation.mutate({ name }),
  };
}

interface ReflexListBodyProps {
  list: {
    isLoading: boolean;
    error: { message: string } | null;
    refetch: () => Promise<unknown>;
  };
  reflexes: ReflexWithStatus[];
  mutations: ReflexListMutations;
}

function ReflexListBody({ list, reflexes, mutations }: ReflexListBodyProps) {
  const { t } = useTranslation('cerebrum');
  if (list.isLoading) return <LoadingState />;
  if (list.error) {
    return (
      <ErrorState
        message={extractMessage(list.error, t('errors.unknown'))}
        onRetry={() => void list.refetch()}
      />
    );
  }
  if (reflexes.length === 0) return <EmptyReflexes />;
  return (
    <div data-testid="reflex-list">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('reflex.list.column.name')}</TableHead>
            <TableHead>{t('reflex.list.column.status')}</TableHead>
            <TableHead>{t('reflex.list.column.trigger')}</TableHead>
            <TableHead>{t('reflex.list.column.lastFired')}</TableHead>
            <TableHead>{t('reflex.list.column.count')}</TableHead>
            <TableHead className="text-right">{t('reflex.list.column.actions')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {reflexes.map((reflex) => (
            <ReflexRow
              key={reflex.name}
              reflex={reflex}
              onToggle={mutations.onToggle}
              onTest={mutations.onTest}
              isPending={mutations.isPending}
            />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export function ReflexListPage() {
  const { t } = useTranslation('cerebrum');
  const list = trpc.cerebrum.reflex.list.useQuery(undefined);
  const mutations = useReflexListMutations();
  const reflexes = list.data?.reflexes ?? [];

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-6xl">
      <PageHeader title={t('reflex.title')} description={t('reflex.description')} />
      <ReflexListBody list={list} reflexes={reflexes} mutations={mutations} />
    </div>
  );
}
