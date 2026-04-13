import { Badge } from '@pops/ui';

import { matchTypeLabel } from '../lib/correction-utils';
import type {
  CorrectionSignal,
  PreviewChangeSetOutput,
  TriggeringTransactionContext,
} from './types';

function formatCorrectionDiff(
  signal: CorrectionSignal,
  triggering: TriggeringTransactionContext
): string | null {
  const parts: string[] = [];

  const newEntity = signal.entityName ?? null;
  const oldEntity = triggering.previousEntityName ?? null;
  if (newEntity && !oldEntity) {
    parts.push(`assigned entity: ${newEntity}`);
  } else if (newEntity && oldEntity && newEntity !== oldEntity) {
    parts.push(`entity: ${oldEntity} → ${newEntity}`);
  }

  const newType = signal.transactionType ?? null;
  const oldType = triggering.previousTransactionType ?? null;
  if (newType && newType !== oldType) {
    parts.push(oldType ? `type: ${oldType} → ${newType}` : `type: ${newType}`);
  }

  const newLocation = signal.location ?? null;
  const oldLocation = triggering.location ?? null;
  if (newLocation && newLocation !== oldLocation) {
    parts.push(
      oldLocation ? `location: ${oldLocation} → ${newLocation}` : `location: ${newLocation}`
    );
  }

  return parts.length > 0 ? parts.join(' · ') : null;
}

function formatCurrency(amount: number): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return amount.toFixed(2);
  }
}

export function ContextPanel(props: {
  signal: CorrectionSignal;
  triggeringTransaction: TriggeringTransactionContext | null;
  rationale: string | null;
  opCount: number;
  combinedSummary: PreviewChangeSetOutput['summary'] | null;
}) {
  const { signal, triggeringTransaction, rationale, opCount, combinedSummary } = props;
  const diff = triggeringTransaction ? formatCorrectionDiff(signal, triggeringTransaction) : null;
  return (
    <div className="px-6 py-3 bg-muted/30 border-t space-y-3">
      {triggeringTransaction && (
        <div className="space-y-1">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            Triggering transaction
          </div>
          <div className="text-sm font-mono break-all" data-testid="triggering-description">
            {triggeringTransaction.description}
          </div>
          <div className="text-xs text-muted-foreground flex flex-wrap gap-x-3 gap-y-0.5">
            <span data-testid="triggering-amount">
              {formatCurrency(triggeringTransaction.amount)}
            </span>
            <span data-testid="triggering-date">{triggeringTransaction.date}</span>
            <span data-testid="triggering-account">{triggeringTransaction.account}</span>
            {triggeringTransaction.location && (
              <span>location: {triggeringTransaction.location}</span>
            )}
          </div>
          {diff && (
            <div className="text-xs text-foreground" data-testid="triggering-diff">
              {diff}
            </div>
          )}
        </div>
      )}
      <div className="flex flex-wrap items-start gap-4">
        <div className="flex-1 min-w-0 space-y-1">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Proposed rule</div>
          <div className="text-sm">
            When description <strong>{matchTypeLabel(signal.matchType)}</strong>{' '}
            <code className="rounded bg-background px-1 py-0.5 text-xs">
              {signal.descriptionPattern}
            </code>
            {signal.entityName && (
              <>
                {' '}
                → <strong>{signal.entityName}</strong>
              </>
            )}
            {signal.transactionType && (
              <>
                {' '}
                · type <strong>{signal.transactionType}</strong>
              </>
            )}
            {signal.location && (
              <>
                {' '}
                · location <strong>{signal.location}</strong>
              </>
            )}
          </div>
          {rationale && <div className="text-xs text-muted-foreground">{rationale}</div>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">
            {opCount} op{opCount === 1 ? '' : 's'}
          </Badge>
          {combinedSummary && (
            <>
              <Badge variant="secondary">{combinedSummary.newMatches} new</Badge>
              <Badge variant="secondary">{combinedSummary.removedMatches} removed</Badge>
              <Badge variant="secondary">{combinedSummary.statusChanges} status</Badge>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
