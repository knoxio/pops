/**
 * ReflexDetailPage — `/cerebrum/reflex/:name`.
 *
 * Read-only view of the reflex TOML definition with recent execution
 * history. The toggle and manual fire actions are surfaced here as well
 * as on the list page.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import { toast } from 'sonner';

import { Button, PageHeader, Skeleton, Switch } from '@pops/ui';

import { reflexDisable, reflexEnable, reflexGet, reflexTest } from '../cerebrum-api';
import { unwrap } from '../cerebrum-api-helpers';
import { extractMessage } from '../utils/errors';
import { TOUCH_TARGET_MIN_HEIGHT } from '../utils/touchTarget';
import { DefinitionPanel } from './reflex-detail/DefinitionPanel';
import { HistoryTable } from './reflex-detail/HistoryTable';

import type { ReflexExecution, ReflexWithStatus } from '../reflex/types';

interface ReflexMutations {
  isPending: boolean;
  onToggle: (name: string, next: boolean) => void;
  onTest: (name: string) => void;
}

function useReflexMutations(_name: string): ReflexMutations {
  const { t } = useTranslation('cerebrum');
  const queryClient = useQueryClient();
  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ['cerebrum', 'reflex'] });
  const enableMutation = useMutation({
    mutationFn: async ({ name }: { name: string }) =>
      unwrap(await reflexEnable({ path: { name } })),
    onSuccess: invalidate,
    onError: (err: Error) => toast.error(extractMessage(err, t('errors.unknown'))),
  });
  const disableMutation = useMutation({
    mutationFn: async ({ name }: { name: string }) =>
      unwrap(await reflexDisable({ path: { name } })),
    onSuccess: invalidate,
    onError: (err: Error) => toast.error(extractMessage(err, t('errors.unknown'))),
  });
  const testMutation = useMutation({
    mutationFn: async ({ name }: { name: string }) => unwrap(await reflexTest({ path: { name } })),
    onSuccess: () => {
      toast.success(t('reflex.list.fireSuccess'));
      invalidate();
    },
    onError: (err: Error) => toast.error(extractMessage(err, t('errors.unknown'))),
  });
  return {
    isPending: enableMutation.isPending || disableMutation.isPending || testMutation.isPending,
    onToggle: (n, next) =>
      next ? enableMutation.mutate({ name: n }) : disableMutation.mutate({ name: n }),
    onTest: (n) => testMutation.mutate({ name: n }),
  };
}

function BackLink() {
  const { t } = useTranslation('cerebrum');
  return (
    <Link to="/cerebrum/reflex" className="text-xs underline text-muted-foreground">
      ← {t('reflex.detail.back')}
    </Link>
  );
}

function ReflexHeader({
  reflex,
  mutations,
}: {
  reflex: ReflexWithStatus;
  mutations: ReflexMutations;
}) {
  const { t } = useTranslation('cerebrum');
  return (
    <div className="flex items-center gap-3">
      <Switch
        checked={reflex.enabled}
        disabled={mutations.isPending}
        aria-label={t('reflex.detail.toggle')}
        onCheckedChange={(next) => mutations.onToggle(reflex.name, next)}
      />
      <span className="text-sm">
        {reflex.enabled ? t('reflex.status.enabled') : t('reflex.status.disabled')}
      </span>
      <Button
        variant="outline"
        size="sm"
        disabled={mutations.isPending}
        className={TOUCH_TARGET_MIN_HEIGHT}
        onClick={() => mutations.onTest(reflex.name)}
      >
        {t('reflex.list.fire')}
      </Button>
    </div>
  );
}

function ReflexDetailContent({
  reflex,
  history,
  mutations,
}: {
  reflex: ReflexWithStatus;
  history: ReflexExecution[];
  mutations: ReflexMutations;
}) {
  const { t } = useTranslation('cerebrum');
  return (
    <div className="p-4 md:p-6 space-y-6 max-w-4xl">
      <BackLink />
      <PageHeader title={reflex.name} description={reflex.description} />
      <ReflexHeader reflex={reflex} mutations={mutations} />
      <DefinitionPanel reflex={reflex} />
      <section className="space-y-3">
        <h3 className="text-xs font-semibold uppercase text-muted-foreground">
          {t('reflex.detail.history.title')}
        </h3>
        <HistoryTable history={history} />
      </section>
    </div>
  );
}

export function ReflexDetailPage() {
  const { t } = useTranslation('cerebrum');
  const params = useParams<{ name: string }>();
  const name = params.name ?? '';
  const detail = useQuery({
    queryKey: ['cerebrum', 'reflex', 'get', { name }],
    queryFn: async () => unwrap(await reflexGet({ path: { name } })),
    enabled: name.length > 0,
    retry: false,
  });
  const mutations = useReflexMutations(name);

  if (detail.isLoading) {
    return (
      <div className="p-4 md:p-6 space-y-3" data-testid="reflex-detail-loading">
        <Skeleton className="h-8 w-1/2" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }
  if (detail.error) {
    return (
      <div className="p-4 md:p-6" data-testid="reflex-detail-error">
        <p className="text-destructive">
          {t('reflex.detail.error', { message: extractMessage(detail.error, t('errors.unknown')) })}
        </p>
        <BackLink />
      </div>
    );
  }
  const reflex = detail.data?.reflex;
  if (!reflex) {
    return (
      <div className="p-4 md:p-6" data-testid="reflex-detail-notfound">
        <p className="text-muted-foreground">{t('reflex.detail.notFound')}</p>
        <BackLink />
      </div>
    );
  }
  return (
    <ReflexDetailContent
      reflex={reflex}
      history={detail.data?.history ?? []}
      mutations={mutations}
    />
  );
}
