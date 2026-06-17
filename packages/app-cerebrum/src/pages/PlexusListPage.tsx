/**
 * PlexusListPage — `/cerebrum/plexus` (PRD-090, PRD-091).
 *
 * Lists registered Plexus adapters with health, last sync, and ingest
 * counts. Each row links to the adapter detail page; health-check and
 * sync mutations are wired to the existing
 * `cerebrum.plexus.adapters.{healthCheck,sync}` endpoints.
 */
import { useMutation, useQuery } from '@tanstack/react-query';
import { Plug } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { toast } from 'sonner';

import {
  Badge,
  Button,
  EmptyState,
  PageHeader,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@pops/ui';

import { plexusAdaptersHealthCheck, plexusAdaptersList, plexusAdaptersSync } from '../cerebrum-api';
import { unwrap } from '../cerebrum-api-helpers';
import { formatTimestamp, statusBadgeVariant, statusKey } from '../plexus/format';
import { extractMessage } from '../utils/errors';
import { TOUCH_TARGET_MIN_HEIGHT } from '../utils/touchTarget';

import type { PlexusAdapter } from '../plexus/types';

interface RowProps {
  adapter: PlexusAdapter;
  onHealth: (id: string) => void;
  onSync: (id: string) => void;
  isPending: boolean;
}

function AdapterRow({ adapter, onHealth, onSync, isPending }: RowProps) {
  const { t } = useTranslation('cerebrum');
  return (
    <TableRow data-testid="plexus-row">
      <TableCell className="font-medium">
        <Link to={`/cerebrum/plexus/${encodeURIComponent(adapter.id)}`} className="hover:underline">
          {adapter.name}
        </Link>
      </TableCell>
      <TableCell>
        <Badge variant={statusBadgeVariant(adapter.status)}>{t(statusKey(adapter.status))}</Badge>
      </TableCell>
      <TableCell className="text-xs text-muted-foreground">
        {formatTimestamp(adapter.lastHealth)}
      </TableCell>
      <TableCell className="text-xs text-muted-foreground">{adapter.ingestedCount}</TableCell>
      <TableCell className="text-xs text-muted-foreground">{adapter.emittedCount}</TableCell>
      <TableCell>
        <div className="flex items-center gap-2 justify-end">
          <Button
            size="sm"
            variant="outline"
            disabled={isPending}
            className={TOUCH_TARGET_MIN_HEIGHT}
            onClick={() => onHealth(adapter.id)}
          >
            {t('plexus.list.healthCheck')}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={isPending}
            className={TOUCH_TARGET_MIN_HEIGHT}
            onClick={() => onSync(adapter.id)}
          >
            {t('plexus.list.sync')}
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

function LoadingState() {
  return (
    <div className="space-y-2" data-testid="plexus-loading">
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  const { t } = useTranslation('cerebrum');
  return (
    <div className="p-6 text-center" data-testid="plexus-error">
      <p className="text-destructive mb-3">{t('plexus.list.error', { message })}</p>
      <Button variant="outline" size="sm" onClick={onRetry} className={TOUCH_TARGET_MIN_HEIGHT}>
        {t('plexus.list.retry')}
      </Button>
    </div>
  );
}

function EmptyAdapters() {
  const { t } = useTranslation('cerebrum');
  return (
    <EmptyState
      icon={Plug}
      title={t('plexus.list.empty.title')}
      description={t('plexus.list.empty.description')}
    />
  );
}

interface AdapterMutations {
  isPending: boolean;
  onHealth: (id: string) => void;
  onSync: (id: string) => void;
}

function useAdapterMutations(): AdapterMutations {
  const { t } = useTranslation('cerebrum');
  const healthMutation = useMutation({
    mutationFn: async ({ adapterId }: { adapterId: string }) =>
      unwrap(await plexusAdaptersHealthCheck({ path: { adapterId } })),
    onSuccess: () => {
      toast.success(t('plexus.list.healthSuccess'));
    },
    onError: (err: Error) => toast.error(extractMessage(err, t('errors.unknown'))),
  });
  const syncMutation = useMutation({
    mutationFn: async ({ adapterId }: { adapterId: string }) =>
      unwrap(await plexusAdaptersSync({ path: { adapterId } })),
    onSuccess: () => {
      toast.success(t('plexus.list.syncSuccess'));
    },
    onError: (err: Error) => toast.error(extractMessage(err, t('errors.unknown'))),
  });
  return {
    isPending: healthMutation.isPending || syncMutation.isPending,
    onHealth: (id) => healthMutation.mutate({ adapterId: id }),
    onSync: (id) => syncMutation.mutate({ adapterId: id }),
  };
}

interface ListBodyProps {
  list: {
    isLoading: boolean;
    error: unknown;
    refetch: () => Promise<unknown>;
  };
  adapters: PlexusAdapter[];
  mutations: AdapterMutations;
}

function PlexusListBody({ list, adapters, mutations }: ListBodyProps) {
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
  if (adapters.length === 0) return <EmptyAdapters />;
  return (
    <div data-testid="plexus-list">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('plexus.list.column.name')}</TableHead>
            <TableHead>{t('plexus.list.column.status')}</TableHead>
            <TableHead>{t('plexus.list.column.lastHealth')}</TableHead>
            <TableHead>{t('plexus.list.column.ingested')}</TableHead>
            <TableHead>{t('plexus.list.column.emitted')}</TableHead>
            <TableHead className="text-right">{t('plexus.list.column.actions')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {adapters.map((adapter) => (
            <AdapterRow
              key={adapter.id}
              adapter={adapter}
              onHealth={mutations.onHealth}
              onSync={mutations.onSync}
              isPending={mutations.isPending}
            />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export function PlexusListPage() {
  const { t } = useTranslation('cerebrum');
  const list = useQuery({
    queryKey: ['cerebrum', 'plexus', 'adapters', 'list'],
    queryFn: async () => unwrap(await plexusAdaptersList()),
  });
  const mutations = useAdapterMutations();
  const adapters = list.data?.adapters ?? [];
  return (
    <div className="p-4 md:p-6 space-y-6 max-w-6xl">
      <PageHeader title={t('plexus.title')} description={t('plexus.description')} />
      <PlexusListBody list={list} adapters={adapters} mutations={mutations} />
    </div>
  );
}
