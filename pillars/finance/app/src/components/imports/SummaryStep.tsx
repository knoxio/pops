import { AlertCircle, CheckCircle, List, Plus, RefreshCw, XCircle } from 'lucide-react';
import { useNavigate } from 'react-router';

import { Button, EmptyState, SummaryCard } from '@pops/ui';

import { useImportStore } from '../../store/importStore';
import { ImportWarningBanner } from './ImportWarningBanner';
import { CheckpointResultLines } from './live/LiveCheckpointSection';
import { RuleBreakdown } from './SummaryRuleBreakdown';

import type { CommitResult } from '@pops/finance';

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
      <p className="text-sm text-muted-foreground">All changes have been committed successfully.</p>
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
          icon={<AlertCircle className="w-5 h-5 text-muted-foreground" />}
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

function CommitWarnings({ warnings }: { warnings: NonNullable<CommitResult['warnings']> }) {
  if (warnings.length === 0) return null;
  return (
    <div className="space-y-2">
      {warnings.map((warning, index) => (
        // A commit spanning two accounts raises one CHECKPOINT_MISMATCH each,
        // so `type` alone is not unique and the second account's banner would
        // collide with the first — the position disambiguates them.
        <ImportWarningBanner
          key={`${warning.type}:${String(index)}`}
          warning={warning}
          affectedHint=""
        />
      ))}
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

/**
 * Final import-flow step: the commit summary. Renders the empty state when
 * reached by direct navigation without a prior commit.
 */
export function SummaryStep() {
  const commitResult = useImportStore((s) => s.commitResult);
  const reset = useImportStore((s) => s.reset);
  const navigate = useNavigate();
  if (!commitResult)
    return (
      <EmptyState
        title="No commit results available."
        description="Complete the final review and commit before viewing the summary."
      />
    );
  const totalRules = totalRulesApplied(commitResult);
  return (
    <div className="space-y-6">
      <SummaryHeader />
      <SummaryCards commitResult={commitResult} totalRules={totalRules} />
      {commitResult.failedDetails && <FailedDetailsList details={commitResult.failedDetails} />}
      {commitResult.warnings && <CommitWarnings warnings={commitResult.warnings} />}
      <CheckpointResultLines checkpoints={commitResult.checkpoints ?? []} />
      <RuleBreakdown
        rulesApplied={commitResult.rulesApplied}
        tagRuleWrites={commitResult.tagRuleWrites}
        correctionRuleWrites={commitResult.correctionRuleWrites}
        totalRules={totalRules}
      />
      <RetroactiveSection count={commitResult.retroactiveReclassifications} />
      <FooterActions
        onReset={() => {
          reset();
          void navigate('/finance/import');
        }}
        onView={() => void navigate('/finance/transactions')}
      />
    </div>
  );
}
