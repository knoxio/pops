import {
  AlertCircle,
  Ban,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  Loader2,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react';
import { useMemo, useState } from 'react';

import { Button } from '@pops/ui';

import { buildCommitPayload } from '../../lib/commit-payload';
import { trpc } from '../../lib/trpc';
import { useImportStore } from '../../store/importStore';

type ChangeSetOp =
  | { op: 'add'; data: { descriptionPattern: string; [k: string]: unknown } }
  | { op: 'edit'; id: string; data: { entityName?: string | null; [k: string]: unknown } }
  | { op: 'disable'; id: string }
  | { op: 'remove'; id: string };

type TagRuleChangeSetOp =
  | { op: 'add'; data: { descriptionPattern: string; tags?: string[]; [k: string]: unknown } }
  | { op: 'edit'; id: string; data: Record<string, unknown> }
  | { op: 'disable'; id: string }
  | { op: 'remove'; id: string };

// ---------------------------------------------------------------------------
// Collapsible section wrapper
// ---------------------------------------------------------------------------

function Section(props: {
  title: string;
  count: number;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(props.defaultOpen ?? props.count <= 10);

  return (
    <div className="border rounded-lg">
      <button
        type="button"
        className="flex w-full items-center justify-between px-4 py-3 text-left font-medium hover:bg-muted/50"
        onClick={() => {
          setOpen(!open);
        }}
      >
        <span>
          {props.title} <span className="text-muted-foreground font-normal">({props.count})</span>
        </span>
        {open ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        )}
      </button>
      {open && <div className="border-t px-4 py-3">{props.children}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Op badge
// ---------------------------------------------------------------------------

const OP_BADGE: Record<string, { label: string; icon: React.ReactNode; className: string }> = {
  add: {
    label: 'Add',
    icon: <Plus className="h-3 w-3" />,
    className: 'bg-success/10 text-success dark:bg-success/10 dark:text-success/60',
  },
  edit: {
    label: 'Edit',
    icon: <Pencil className="h-3 w-3" />,
    className: 'bg-info/10 text-info dark:bg-info/10 dark:text-info/60',
  },
  disable: {
    label: 'Disable',
    icon: <Ban className="h-3 w-3" />,
    className: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-300',
  },
  remove: {
    label: 'Remove',
    icon: <Trash2 className="h-3 w-3" />,
    className: 'bg-destructive/10 text-destructive dark:bg-destructive/10 dark:text-destructive/60',
  },
};

// ---------------------------------------------------------------------------
// FinalReviewStep — PRD-031 US-01+02+05
// ---------------------------------------------------------------------------

/** Extract a human-readable label from a ChangeSet op. */
function opDisplayLabel(op: ChangeSetOp): string {
  switch (op.op) {
    case 'add':
      return op.data.descriptionPattern;
    case 'edit':
      return op.data.entityName ?? `Rule ${op.id.slice(0, 8)}`;
    case 'disable':
    case 'remove':
      return `Rule ${op.id.slice(0, 8)}`;
  }
}

function tagRuleOpDisplayLabel(op: TagRuleChangeSetOp): string {
  switch (op.op) {
    case 'add': {
      const tags = op.data.tags?.length ? ` → ${op.data.tags.join(', ')}` : '';
      return `${op.data.descriptionPattern}${tags}`;
    }
    case 'edit':
      return `Rule ${op.id.slice(0, 8)}`;
    case 'disable':
    case 'remove':
      return `Rule ${op.id.slice(0, 8)}`;
  }
}

export function FinalReviewStep() {
  const pendingEntities = useImportStore((s) => s.pendingEntities);
  const pendingChangeSets = useImportStore((s) => s.pendingChangeSets);
  const pendingTagRuleChangeSets = useImportStore((s) => s.pendingTagRuleChangeSets);
  const confirmedTransactions = useImportStore((s) => s.confirmedTransactions);
  const processedTransactions = useImportStore((s) => s.processedTransactions);
  const prevStep = useImportStore((s) => s.prevStep);
  const nextStep = useImportStore((s) => s.nextStep);
  const setCommitResult = useImportStore((s) => s.setCommitResult);
  const commitResult = useImportStore((s) => s.commitResult);

  const [commitError, setCommitError] = useState<string | null>(null);
  const [committed, setCommitted] = useState(false);

  const commitMutation = trpc.finance.imports.commitImport.useMutation({
    onSuccess: (response) => {
      setCommitResult(response.data);
      setCommitted(true);
      setCommitError(null);
    },
    onError: (err) => {
      setCommitError(err.message);
    },
  });

  const handleCommit = () => {
    setCommitError(null);
    const payload = buildCommitPayload(
      pendingEntities,
      pendingChangeSets,
      pendingTagRuleChangeSets,
      confirmedTransactions
    );
    commitMutation.mutate(payload);
  };

  // Transaction breakdown — labels match AC: matched / corrected / manual
  const txnBreakdown = useMemo(() => {
    const matched = processedTransactions.matched.length;
    const corrected = processedTransactions.uncertain.length;
    const manual = processedTransactions.failed.length;
    const skipped = processedTransactions.skipped.length;
    return { matched, corrected, manual, skipped, total: confirmedTransactions.length };
  }, [processedTransactions, confirmedTransactions]);

  // Tag assignment count
  const tagAssignmentCount = useMemo(() => {
    return confirmedTransactions.reduce((sum, txn) => sum + (txn.tags?.length ?? 0), 0);
  }, [confirmedTransactions]);

  // Transactions with tags (used in tag section)
  const taggedTxnCount = useMemo(
    () => confirmedTransactions.filter((t) => (t.tags?.length ?? 0) > 0).length,
    [confirmedTransactions]
  );

  // Total op count across all ChangeSets
  const totalOps = useMemo(
    () => pendingChangeSets.reduce((sum, pcs) => sum + pcs.changeSet.ops.length, 0),
    [pendingChangeSets]
  );

  const totalTagRuleOps = useMemo(
    () => pendingTagRuleChangeSets.reduce((sum, pcs) => sum + pcs.changeSet.ops.length, 0),
    [pendingTagRuleChangeSets]
  );

  const hasEntities = pendingEntities.length > 0;
  const hasRuleChanges = totalOps > 0;
  const hasTagRuleChanges = totalTagRuleOps > 0;
  const hasTransactions = txnBreakdown.total > 0;
  const hasTags = tagAssignmentCount > 0;
  const isCommitting = commitMutation.isPending;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold mb-2">Final Review</h2>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Review all pending changes before committing. Navigate back to make edits.
        </p>
      </div>

      <div className="space-y-4">
        {/* New entities */}
        {hasEntities && (
          <Section title="New Entities" count={pendingEntities.length}>
            <ul className="space-y-1">
              {pendingEntities.map((entity) => (
                <li key={entity.tempId} className="flex items-center gap-2 text-sm py-1">
                  <span className="font-medium">{entity.name}</span>
                  <span className="text-muted-foreground text-xs">({entity.type})</span>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {/* Rule changes */}
        {hasRuleChanges && (
          <Section title="Classification Rule Changes" count={totalOps}>
            <div className="space-y-3">
              {pendingChangeSets.map((pcs) => (
                <div key={pcs.tempId} className="space-y-1">
                  {pcs.changeSet.source && (
                    <p className="text-xs text-muted-foreground">Source: {pcs.changeSet.source}</p>
                  )}
                  <ul className="space-y-1">
                    {pcs.changeSet.ops.map((op) => {
                      const badge = OP_BADGE[op.op];
                      const label = opDisplayLabel(op as ChangeSetOp);
                      const rowKey =
                        op.op === 'add'
                          ? `${pcs.tempId}-cor-add-${op.data.descriptionPattern}`
                          : `${pcs.tempId}-cor-${op.op}-${op.id}`;
                      return (
                        <li key={rowKey} className="flex items-center gap-2 text-sm py-0.5">
                          {badge && (
                            <span
                              className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium ${badge.className}`}
                            >
                              {badge.icon}
                              {badge.label}
                            </span>
                          )}
                          <span className="font-mono text-xs truncate">{label}</span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          </Section>
        )}

        {hasTagRuleChanges && (
          <Section title="Tag Rule Changes" count={totalTagRuleOps}>
            <div className="space-y-3">
              {pendingTagRuleChangeSets.map((pcs) => (
                <div key={pcs.tempId} className="space-y-1">
                  {pcs.changeSet.source && (
                    <p className="text-xs text-muted-foreground">Source: {pcs.changeSet.source}</p>
                  )}
                  <ul className="space-y-1">
                    {pcs.changeSet.ops.map((op) => {
                      const badge = OP_BADGE[op.op];
                      const label = tagRuleOpDisplayLabel(op as TagRuleChangeSetOp);
                      const rowKey =
                        op.op === 'add'
                          ? `${pcs.tempId}-add-${op.data.descriptionPattern}`
                          : `${pcs.tempId}-${op.op}-${op.id}`;
                      return (
                        <li key={rowKey} className="flex items-center gap-2 text-sm py-0.5">
                          {badge && (
                            <span
                              className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium ${badge.className}`}
                            >
                              {badge.icon}
                              {badge.label}
                            </span>
                          )}
                          <span className="font-mono text-xs truncate">{label}</span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* Transactions */}
        {hasTransactions && (
          <Section title="Transactions to Import" count={txnBreakdown.total}>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Matched:</span>
                <span className="font-medium">{txnBreakdown.matched}</span>
              </div>
              {txnBreakdown.corrected > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Corrected:</span>
                  <span className="font-medium">{txnBreakdown.corrected}</span>
                </div>
              )}
              {txnBreakdown.manual > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Manual:</span>
                  <span className="font-medium">{txnBreakdown.manual}</span>
                </div>
              )}
              {txnBreakdown.skipped > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Skipped:</span>
                  <span className="font-medium">{txnBreakdown.skipped}</span>
                </div>
              )}
            </div>
          </Section>
        )}

        {/* Tag assignments */}
        {hasTags && (
          <Section title="Tag Assignments" count={tagAssignmentCount}>
            <p className="text-sm text-muted-foreground">
              {tagAssignmentCount} tag{tagAssignmentCount === 1 ? '' : 's'} will be applied across{' '}
              {taggedTxnCount} transaction{taggedTxnCount === 1 ? '' : 's'}.
            </p>
          </Section>
        )}

        {/* Empty state */}
        {!hasEntities && !hasRuleChanges && !hasTagRuleChanges && !hasTransactions && !hasTags && (
          <p className="text-sm text-muted-foreground text-center py-8">
            No pending changes to review.
          </p>
        )}
      </div>

      {/* Commit error */}
      {commitError && (
        <div className="flex items-start gap-2 p-3 bg-destructive/5 border border-destructive/20 rounded-lg">
          <AlertCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
          <div className="text-sm text-destructive">
            <p className="font-medium">Commit failed</p>
            <p className="text-xs mt-1">{commitError}</p>
          </div>
        </div>
      )}

      {/* Inline result after successful commit (US-05 AC-4) */}
      {committed && commitResult && (
        <div className="space-y-3 border rounded-lg p-4 bg-success/5 border-success/20">
          <div className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-success" />
            <h3 className="font-semibold text-success">Commit Successful</h3>
          </div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Entities created:</span>
              <span className="font-medium">{commitResult.entitiesCreated}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Transactions imported:</span>
              <span className="font-medium">{commitResult.transactionsImported}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Classification rules applied:</span>
              <span className="font-medium">
                {commitResult.rulesApplied.add +
                  commitResult.rulesApplied.edit +
                  commitResult.rulesApplied.disable +
                  commitResult.rulesApplied.remove}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Tag rules applied:</span>
              <span className="font-medium">{commitResult.tagRulesApplied ?? 0}</span>
            </div>
            {commitResult.transactionsFailed > 0 && (
              <div className="flex justify-between">
                <span className="text-destructive">Transactions failed:</span>
                <span className="font-medium text-destructive">
                  {commitResult.transactionsFailed}
                </span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-muted-foreground">Reclassifications:</span>
              <span className="font-medium">{commitResult.retroactiveReclassifications}</span>
            </div>
          </div>
          {/* Rule breakdown by op type */}
          {commitResult.rulesApplied.add +
            commitResult.rulesApplied.edit +
            commitResult.rulesApplied.disable +
            commitResult.rulesApplied.remove >
            0 && (
            <div className="flex gap-3 text-xs text-muted-foreground pt-1 border-t">
              {commitResult.rulesApplied.add > 0 && (
                <span>{commitResult.rulesApplied.add} added</span>
              )}
              {commitResult.rulesApplied.edit > 0 && (
                <span>{commitResult.rulesApplied.edit} edited</span>
              )}
              {commitResult.rulesApplied.disable > 0 && (
                <span>{commitResult.rulesApplied.disable} disabled</span>
              )}
              {commitResult.rulesApplied.remove > 0 && (
                <span>{commitResult.rulesApplied.remove} removed</span>
              )}
            </div>
          )}
          {/* Inline failure details */}
          {commitResult.failedDetails && commitResult.failedDetails.length > 0 && (
            <div className="pt-1 border-t">
              <p className="text-xs font-medium text-destructive mb-1">Failed transactions:</p>
              <ul className="space-y-1">
                {commitResult.failedDetails.map((detail) => (
                  <li
                    key={`${detail.checksum ?? 'no-chk'}-${detail.error}`}
                    className="text-xs text-destructive flex gap-2"
                  >
                    {detail.checksum && (
                      <span className="font-mono shrink-0">{detail.checksum.slice(0, 12)}</span>
                    )}
                    <span className="truncate">{detail.error}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <div className="flex justify-between pt-4">
        {!committed && (
          <Button variant="outline" onClick={prevStep} disabled={isCommitting}>
            Back
          </Button>
        )}
        {committed ? (
          <Button onClick={nextStep} className="ml-auto">
            Continue
          </Button>
        ) : (
          <Button onClick={handleCommit} disabled={isCommitting}>
            {isCommitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {isCommitting ? 'Committing...' : 'Approve & Commit All'}
          </Button>
        )}
      </div>
    </div>
  );
}
