/**
 * Trust state panel — shows the current graduation phase per action
 * type with running counts of approvals/rejections/reverts.
 */
import { useTranslation } from 'react-i18next';

import { trpc } from '@pops/api-client';
import {
  Badge,
  Button,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@pops/ui';

import { extractMessage } from '../../utils/errors';
import { TOUCH_TARGET_MIN_HEIGHT } from '../../utils/touchTarget';

import type { GliaTrustState } from '../../glia/types';

function TrustRow({ state }: { state: GliaTrustState }) {
  return (
    <TableRow data-testid="glia-trust-row">
      <TableCell className="text-xs">{state.actionType}</TableCell>
      <TableCell>
        <Badge variant="outline">{state.currentPhase}</Badge>
      </TableCell>
      <TableCell className="text-xs">{state.approvedCount}</TableCell>
      <TableCell className="text-xs">{state.rejectedCount}</TableCell>
      <TableCell className="text-xs">{state.revertedCount}</TableCell>
    </TableRow>
  );
}

interface TrustBodyProps {
  query: {
    isLoading: boolean;
    error: { message: string } | null;
    refetch: () => Promise<unknown>;
  };
  states: GliaTrustState[];
}

function TrustBody({ query, states }: TrustBodyProps) {
  const { t } = useTranslation('cerebrum');
  if (query.isLoading) {
    return <Skeleton className="h-24 w-full" data-testid="glia-trust-loading" />;
  }
  if (query.error) {
    return (
      <div className="p-6 text-center" data-testid="glia-trust-error">
        <p className="text-destructive mb-3">
          {t('glia.trust.error', { message: extractMessage(query.error, t('errors.unknown')) })}
        </p>
        <Button
          variant="outline"
          size="sm"
          className={TOUCH_TARGET_MIN_HEIGHT}
          onClick={() => void query.refetch()}
        >
          {t('glia.trust.retry')}
        </Button>
      </div>
    );
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t('glia.trust.column.type')}</TableHead>
          <TableHead>{t('glia.trust.column.phase')}</TableHead>
          <TableHead>{t('glia.trust.column.approved')}</TableHead>
          <TableHead>{t('glia.trust.column.rejected')}</TableHead>
          <TableHead>{t('glia.trust.column.reverted')}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {states.map((state) => (
          <TrustRow key={state.actionType} state={state} />
        ))}
      </TableBody>
    </Table>
  );
}

export function TrustStatePanel() {
  const { t } = useTranslation('cerebrum');
  const query = trpc.cerebrum.glia.trustState.list.useQuery();
  const states: GliaTrustState[] = query.data?.states ?? [];

  return (
    <section className="space-y-3">
      <header>
        <h3 className="text-xs font-semibold uppercase text-muted-foreground">
          {t('glia.trust.title')}
        </h3>
      </header>
      <TrustBody query={query} states={states} />
    </section>
  );
}
