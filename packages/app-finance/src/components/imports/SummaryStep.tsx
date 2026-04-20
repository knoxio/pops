import { AlertCircle, CheckCircle, List, Plus, RefreshCw, XCircle } from 'lucide-react';
import { useNavigate } from 'react-router';

import { Button, SummaryCard } from '@pops/ui';

import { useImportStore } from '../../store/importStore';

import type { CommitResult } from '@pops/api/modules/finance/imports';

function totalRulesApplied(commitResult: CommitResult): number {
  return (
    commitResult.rulesApplied.add +
    commitResult.rulesApplied.edit +
    commitResult.rulesApplied.disable +
    commitResult.rulesApplied.remove +
    (commitResult.tagRulesApplied ?? 0)
  );
}

function SummaryHeader() {
  return (
    <div className="text-center">
      <CheckCircle className="w-16 h-16 text-success mx-auto mb-4" />
      <h2 className="text-2xl font-semibold mb-2">Import Complete</h2>
      <p className="text-sm text-gray-600 dark:text-gray-400">
        All changes have been committed successfully.
      </p>
    </div>
  );
}

function SummaryCards({
  commitResult,
  totalRules,
}: {
  commitResult: CommitResult;
  totalRules: number;
}) {
  return (
    <div className="grid grid-cols-2 gap-4">
      <SummaryCard
        icon={<CheckCircle className="w-5 h-5 text-success" />}
        value={commitResult.entitiesCreated}
        label="Entities Created"
        variant="success"
      />
      <SummaryCard
        icon={<CheckCircle className="w-5 h-5 text-info" />}
        value={totalRules}
        label="Rules Applied"
        variant="info"
      />
      <SummaryCard
        icon={<CheckCircle className="w-5 h-5 text-success" />}
        value={commitResult.transactionsImported}
        label="Transactions Imported"
        variant="success"
      />
      {commitResult.transactionsFailed > 0 ? (
        <SummaryCard
          icon={<XCircle className="w-5 h-5 text-destructive" />}
          value={commitResult.transactionsFailed}
          label="Transactions Failed"
          variant="destructive"
        />
      ) : (
        <SummaryCard
          icon={<AlertCircle className="w-5 h-5 text-gray-400" />}
          value={0}
          label="Transactions Failed"
          variant="neutral"
        />
      )}
    </div>
  );
}

function FailedDetailsList({ details }: { details: NonNullable<CommitResult['failedDetails']> }) {
  if (details.length === 0) return null;
  return (
    <div className="border border-destructive/20 rounded-lg p-4">
      <div className="flex items-center gap-2 mb-2">
        <XCircle className="h-4 w-4 text-destructive" />
        <h3 className="text-sm font-semibold text-destructive">Failed Transactions</h3>
      </div>
      <div className="space-y-2">
        {details.map((detail, idx) => (
          <div
            key={idx}
            className="flex items-start gap-3 text-sm py-1 border-b border-destructive/10 last:border-0"
          >
            {detail.checksum && (
              <span className="font-mono text-xs text-destructive shrink-0">
                {detail.checksum.slice(0, 12)}
              </span>
            )}
            <span className="text-destructive text-xs">{detail.error}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function RuleBreakdown({
  rulesApplied,
  totalRules,
}: {
  rulesApplied: CommitResult['rulesApplied'];
  totalRules: number;
}) {
  if (totalRules === 0) return null;
  const items: Array<[number, string]> = [
    [rulesApplied.add, 'Added'],
    [rulesApplied.edit, 'Edited'],
    [rulesApplied.disable, 'Disabled'],
    [rulesApplied.remove, 'Removed'],
  ];
  return (
    <div className="border rounded-lg p-4">
      <h3 className="text-sm font-semibold mb-2">Rule Breakdown</h3>
      <div className="grid grid-cols-4 gap-2 text-sm text-center">
        {items.map(([count, label]) =>
          count > 0 ? (
            <div key={label}>
              <div className="font-medium">{count}</div>
              <div className="text-xs text-muted-foreground">{label}</div>
            </div>
          ) : null
        )}
      </div>
    </div>
  );
}

function RetroactiveSection({ count }: { count: number }) {
  return (
    <div className="border rounded-lg p-4">
      <div className="flex items-center gap-2 mb-1">
        <RefreshCw className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold">Retroactive Reclassifications</h3>
      </div>
      <p className="text-sm text-muted-foreground">
        {count > 0
          ? `${count} existing transaction${count === 1 ? ' was' : 's were'} reclassified based on updated rules.`
          : 'No existing transactions affected.'}
      </p>
    </div>
  );
}

function FooterActions({ onReset, onView }: { onReset: () => void; onView: () => void }) {
  return (
    <div className="flex justify-between gap-3">
      <Button variant="outline" onClick={onReset}>
        <Plus className="h-4 w-4" />
        New Import
      </Button>
      <Button onClick={onView}>
        <List className="h-4 w-4" />
        View Transactions
      </Button>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="text-center py-12 space-y-4">
      <p className="text-gray-500">No commit results available.</p>
      <p className="text-sm text-gray-400">
        Complete the final review and commit before viewing the summary.
      </p>
    </div>
  );
}

/**
 * Step 7: Import summary — reads CommitResult from store (PRD-031 US-06).
 * Guards against direct navigation without a commit.
 */
export function SummaryStep() {
  const commitResult = useImportStore((s) => s.commitResult);
  const reset = useImportStore((s) => s.reset);
  const navigate = useNavigate();
  if (!commitResult) return <EmptyState />;
  const totalRules = totalRulesApplied(commitResult);
  return (
    <div className="space-y-6">
      <SummaryHeader />
      <SummaryCards commitResult={commitResult} totalRules={totalRules} />
      {commitResult.failedDetails && <FailedDetailsList details={commitResult.failedDetails} />}
      <RuleBreakdown rulesApplied={commitResult.rulesApplied} totalRules={totalRules} />
      <RetroactiveSection count={commitResult.retroactiveReclassifications} />
      <FooterActions
        onReset={() => {
          reset();
          navigate('/import');
        }}
        onView={() => navigate('/transactions')}
      />
    </div>
  );
}
