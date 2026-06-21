import { Badge } from '@pops/ui';

import { matchTypeLabel } from '../lib/correction-utils';

import type {
  CorrectionSignal,
  PreviewChangeSetOutput,
  TriggeringTransactionContext,
} from './types';

function diffEntity(
  signal: CorrectionSignal,
  triggering: TriggeringTransactionContext
): string | null {
  const newEntity = signal.entityName ?? null;
  const oldEntity = triggering.previousEntityName ?? null;
  if (newEntity && !oldEntity) return `assigned entity: ${newEntity}`;
  if (newEntity && oldEntity && newEntity !== oldEntity)
    return `entity: ${oldEntity} → ${newEntity}`;
  return null;
}

function diffType(
  signal: CorrectionSignal,
  triggering: TriggeringTransactionContext
): string | null {
  const newType = signal.transactionType ?? null;
  const oldType = triggering.previousTransactionType ?? null;
  if (!newType || newType === oldType) return null;
  return oldType ? `type: ${oldType} → ${newType}` : `type: ${newType}`;
}

function diffLocation(
  signal: CorrectionSignal,
  triggering: TriggeringTransactionContext
): string | null {
  const newLocation = signal.location ?? null;
  const oldLocation = triggering.location ?? null;
  if (!newLocation || newLocation === oldLocation) return null;
  return oldLocation ? `location: ${oldLocation} → ${newLocation}` : `location: ${newLocation}`;
}

function formatCorrectionDiff(
  signal: CorrectionSignal,
  triggering: TriggeringTransactionContext
): string | null {
  const parts = [
    diffEntity(signal, triggering),
    diffType(signal, triggering),
    diffLocation(signal, triggering),
  ].filter(Boolean) as string[];
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

function TriggeringSection({
  triggeringTransaction,
  diff,
}: {
  triggeringTransaction: TriggeringTransactionContext;
  diff: string | null;
}) {
  return (
    <div className="space-y-1">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">
        Triggering transaction
      </div>
      <div className="text-sm font-mono break-all" data-testid="triggering-description">
        {triggeringTransaction.description}
      </div>
      <div className="text-xs text-muted-foreground flex flex-wrap gap-x-3 gap-y-0.5">
        <span data-testid="triggering-amount">{formatCurrency(triggeringTransaction.amount)}</span>
        <span data-testid="triggering-date">{triggeringTransaction.date}</span>
        <span data-testid="triggering-account">{triggeringTransaction.account}</span>
        {triggeringTransaction.location && <span>location: {triggeringTransaction.location}</span>}
      </div>
      {diff && (
        <div className="text-xs text-foreground" data-testid="triggering-diff">
          {diff}
        </div>
      )}
    </div>
  );
}

function ProposedRuleDescription({ signal }: { signal: CorrectionSignal }) {
  return (
    <div className="text-sm" data-testid="proposed-rule-description">
      When description <strong>{matchTypeLabel(signal.matchType)}</strong>{' '}
      <code className="rounded bg-background px-1 py-0.5 text-xs">{signal.descriptionPattern}</code>
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
  );
}

function SummaryBadges({
  opCount,
  combinedSummary,
}: {
  opCount: number;
  combinedSummary: PreviewChangeSetOutput['summary'] | null;
}) {
  return (
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
  );
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
        <TriggeringSection triggeringTransaction={triggeringTransaction} diff={diff} />
      )}
      <div className="flex flex-wrap items-start gap-4">
        <div className="flex-1 min-w-0 space-y-1">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Proposed rule</div>
          <ProposedRuleDescription signal={signal} />
          {rationale && <div className="text-xs text-muted-foreground">{rationale}</div>}
        </div>
        <SummaryBadges opCount={opCount} combinedSummary={combinedSummary} />
      </div>
    </div>
  );
}
