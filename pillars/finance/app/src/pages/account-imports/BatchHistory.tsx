import { Link } from 'react-router';

import {
  Button,
  Card,
  EmptyState,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@pops/ui';

import { dayLabel, whenLabel } from '../../components/imports/pending/pending-import-view';

import type { ImportBatchWire } from './types';

const KIND_LABEL: Record<ImportBatchWire['sourceKind'], string> = {
  'csv-dialect': 'CSV',
  'pdf-statement': 'PDF',
  api: 'API',
};

function span(batch: ImportBatchWire): string {
  if (batch.dateFrom === null || batch.dateTo === null) return 'No rows';
  return batch.dateFrom === batch.dateTo
    ? dayLabel(batch.dateFrom)
    : `${dayLabel(batch.dateFrom)} – ${dayLabel(batch.dateTo)}`;
}

function BatchRow({ batch, accountId }: { batch: ImportBatchWire; accountId: string }) {
  return (
    <TableRow>
      <TableCell className="whitespace-nowrap">{whenLabel(batch.createdAt)}</TableCell>
      <TableCell>
        {KIND_LABEL[batch.sourceKind]}
        {batch.sourceRef === null ? '' : ` · ${batch.sourceRef}`}
      </TableCell>
      <TableCell className="text-right tabular-nums">{batch.rowCount}</TableCell>
      <TableCell className="whitespace-nowrap">{span(batch)}</TableCell>
      <TableCell>
        {batch.checkpointId === null ? (
          <span className="text-muted-foreground">None</span>
        ) : (
          <Link
            to={`/finance/accounts/${accountId}/checkpoints`}
            className="underline underline-offset-2"
          >
            Checkpoint
          </Link>
        )}
      </TableCell>
    </TableRow>
  );
}

/**
 * Every batch that fed the account, newest first (finance ADR-003). A batch
 * is what one commit wrote, so it is the only durable record of an import:
 * a batch with a checkpoint links to it, because the balance the import
 * recorded is the thing a reader chases next.
 */
export function BatchHistory({
  accountId,
  accountName,
  batches,
  hasMore,
  isFetchingMore,
  onLoadMore,
}: {
  accountId: string;
  accountName: string;
  batches: ImportBatchWire[];
  hasMore: boolean;
  isFetchingMore: boolean;
  onLoadMore: () => void;
}) {
  if (batches.length === 0) {
    return (
      <EmptyState
        title="Never fed"
        description={`Nothing has landed in ${accountName} yet. Every batch that feeds it will be listed here with what it wrote.`}
      />
    );
  }
  return (
    <Card className="overflow-hidden p-0">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>When</TableHead>
              <TableHead>Read as</TableHead>
              <TableHead className="text-right">Rows</TableHead>
              <TableHead>Covering</TableHead>
              <TableHead>Checkpoint</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {batches.map((batch) => (
              <BatchRow key={batch.id} batch={batch} accountId={accountId} />
            ))}
          </TableBody>
        </Table>
      </div>
      {hasMore && (
        <div className="flex justify-center p-3">
          <Button variant="outline" size="sm" onClick={onLoadMore} disabled={isFetchingMore}>
            {isFetchingMore ? 'Loading…' : 'Load older batches'}
          </Button>
        </div>
      )}
    </Card>
  );
}
