/**
 * Recent-execution table for the reflex detail page.
 */
import { useTranslation } from 'react-i18next';

import { Badge, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@pops/ui';

import { formatTimestamp } from '../../utils/format';

import type { ReflexExecution, ReflexExecutionStatus } from '../../reflex/types';

function statusVariant(status: ReflexExecutionStatus): 'default' | 'secondary' | 'destructive' {
  if (status === 'failed') return 'destructive';
  if (status === 'completed') return 'default';
  return 'secondary';
}

function StatusBadge({ status }: { status: ReflexExecutionStatus }) {
  return <Badge variant={statusVariant(status)}>{status}</Badge>;
}

export function HistoryTable({ history }: { history: ReflexExecution[] }) {
  const { t } = useTranslation('cerebrum');
  if (history.length === 0) {
    return (
      <p className="text-sm text-muted-foreground" data-testid="reflex-history-empty">
        {t('reflex.detail.historyEmpty')}
      </p>
    );
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t('reflex.detail.history.triggered')}</TableHead>
          <TableHead>{t('reflex.detail.history.status')}</TableHead>
          <TableHead>{t('reflex.detail.history.action')}</TableHead>
          <TableHead>{t('reflex.detail.history.completed')}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {history.map((row) => (
          <TableRow key={row.id} data-testid="reflex-history-row">
            <TableCell className="text-xs">{formatTimestamp(row.triggeredAt)}</TableCell>
            <TableCell>
              <StatusBadge status={row.status} />
            </TableCell>
            <TableCell className="text-xs">{`${row.actionType}.${row.actionVerb}`}</TableCell>
            <TableCell className="text-xs">{formatTimestamp(row.completedAt)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
