/**
 * PlexusDetailPage — `/cerebrum/plexus/:adapterId`.
 *
 * Shows a single adapter's full configuration, last error, filter list,
 * and exposes the same health-check + sync actions as the list page.
 * Config display is read-only — editing config lives in `plexus.toml`.
 */
import { useMutation, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import { toast } from 'sonner';

import { Badge, Button, PageHeader, Skeleton } from '@pops/ui';

import {
  plexusAdaptersGet,
  plexusAdaptersHealthCheck,
  plexusAdaptersSync,
  plexusFiltersList,
} from '../cerebrum-api';
import { unwrap } from '../cerebrum-api-helpers';
import { formatTimestamp, statusBadgeVariant, statusKey } from '../plexus/format';
import { extractMessage } from '../utils/errors';
import { TOUCH_TARGET_MIN_HEIGHT } from '../utils/touchTarget';
import { ConfigPanel, ErrorPanel, FiltersPanel } from './plexus-detail/Panels';

import type { PlexusAdapter, PlexusFilter } from '../plexus/types';

interface DetailMutations {
  isPending: boolean;
  onHealth: () => void;
  onSync: () => void;
}

function useDetailMutations(adapterId: string): DetailMutations {
  const { t } = useTranslation('cerebrum');
  const healthMutation = useMutation({
    mutationFn: async () => unwrap(await plexusAdaptersHealthCheck({ path: { adapterId } })),
    onSuccess: () => {
      toast.success(t('plexus.list.healthSuccess'));
    },
    onError: (err: Error) => toast.error(extractMessage(err, t('errors.unknown'))),
  });
  const syncMutation = useMutation({
    mutationFn: async () => unwrap(await plexusAdaptersSync({ path: { adapterId } })),
    onSuccess: () => {
      toast.success(t('plexus.list.syncSuccess'));
    },
    onError: (err: Error) => toast.error(extractMessage(err, t('errors.unknown'))),
  });
  return {
    isPending: healthMutation.isPending || syncMutation.isPending,
    onHealth: () => healthMutation.mutate(),
    onSync: () => syncMutation.mutate(),
  };
}

function BackLink() {
  const { t } = useTranslation('cerebrum');
  return (
    <Link to="/cerebrum/plexus" className="text-xs underline text-muted-foreground">
      ← {t('plexus.detail.back')}
    </Link>
  );
}

function AdapterHeader({
  adapter,
  mutations,
}: {
  adapter: PlexusAdapter;
  mutations: DetailMutations;
}) {
  const { t } = useTranslation('cerebrum');
  return (
    <div className="flex items-center gap-3">
      <Badge variant={statusBadgeVariant(adapter.status)}>{t(statusKey(adapter.status))}</Badge>
      <span className="text-xs text-muted-foreground">{formatTimestamp(adapter.lastHealth)}</span>
      <Button
        variant="outline"
        size="sm"
        disabled={mutations.isPending}
        className={TOUCH_TARGET_MIN_HEIGHT}
        onClick={mutations.onHealth}
      >
        {t('plexus.list.healthCheck')}
      </Button>
      <Button
        variant="outline"
        size="sm"
        disabled={mutations.isPending}
        className={TOUCH_TARGET_MIN_HEIGHT}
        onClick={mutations.onSync}
      >
        {t('plexus.list.sync')}
      </Button>
    </div>
  );
}

function DetailContent({
  adapter,
  filters,
  mutations,
}: {
  adapter: PlexusAdapter;
  filters: PlexusFilter[];
  mutations: DetailMutations;
}) {
  return (
    <div className="p-4 md:p-6 space-y-6 max-w-4xl">
      <BackLink />
      <PageHeader title={adapter.name} description={adapter.id} />
      <AdapterHeader adapter={adapter} mutations={mutations} />
      <ConfigPanel adapter={adapter} />
      <ErrorPanel lastError={adapter.lastError} />
      <FiltersPanel filters={filters} />
    </div>
  );
}

export function PlexusDetailPage() {
  const { t } = useTranslation('cerebrum');
  const params = useParams<{ adapterId: string }>();
  const adapterId = params.adapterId ?? '';
  const detail = useQuery({
    queryKey: ['cerebrum', 'plexus', 'adapters', 'get', { adapterId }],
    queryFn: async () => unwrap(await plexusAdaptersGet({ path: { adapterId } })),
    enabled: adapterId.length > 0,
    retry: false,
  });
  const filtersQuery = useQuery({
    queryKey: ['cerebrum', 'plexus', 'filters', 'list', { adapterId }],
    queryFn: async () => unwrap(await plexusFiltersList({ path: { adapterId } })),
    enabled: adapterId.length > 0,
  });
  const mutations = useDetailMutations(adapterId);

  if (detail.isLoading) {
    return (
      <div className="p-4 md:p-6 space-y-3" data-testid="plexus-detail-loading">
        <Skeleton className="h-8 w-1/2" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }
  if (detail.error) {
    return (
      <div className="p-4 md:p-6" data-testid="plexus-detail-error">
        <p className="text-destructive">
          {t('plexus.detail.error', { message: extractMessage(detail.error, t('errors.unknown')) })}
        </p>
        <BackLink />
      </div>
    );
  }
  const adapter = detail.data?.adapter;
  if (!adapter) {
    return (
      <div className="p-4 md:p-6" data-testid="plexus-detail-notfound">
        <p className="text-muted-foreground">{t('plexus.detail.notFound')}</p>
        <BackLink />
      </div>
    );
  }
  return (
    <DetailContent
      adapter={adapter}
      filters={filtersQuery.data?.filters ?? []}
      mutations={mutations}
    />
  );
}
