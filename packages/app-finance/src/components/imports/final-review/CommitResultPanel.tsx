import { CheckCircle } from 'lucide-react';

import type { CommitResult } from '@pops/api/modules/finance/imports';

function totalRules(rulesApplied: CommitResult['rulesApplied']): number {
  return rulesApplied.add + rulesApplied.edit + rulesApplied.disable + rulesApplied.remove;
}

function RuleBreakdown({ rulesApplied }: { rulesApplied: CommitResult['rulesApplied'] }) {
  if (totalRules(rulesApplied) === 0) return null;
  return (
    <div className="flex gap-3 text-xs text-muted-foreground pt-1 border-t">
      {rulesApplied.add > 0 && <span>{rulesApplied.add} added</span>}
      {rulesApplied.edit > 0 && <span>{rulesApplied.edit} edited</span>}
      {rulesApplied.disable > 0 && <span>{rulesApplied.disable} disabled</span>}
      {rulesApplied.remove > 0 && <span>{rulesApplied.remove} removed</span>}
    </div>
  );
}

function FailureDetails({ details }: { details: NonNullable<CommitResult['failedDetails']> }) {
  if (details.length === 0) return null;
  return (
    <div className="pt-1 border-t">
      <p className="text-xs font-medium text-destructive mb-1">Failed transactions:</p>
      <ul className="space-y-1">
        {details.map((detail) => (
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
  );
}

export function CommitResultPanel({ commitResult }: { commitResult: CommitResult }) {
  return (
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
          <span className="font-medium">{totalRules(commitResult.rulesApplied)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Tag rules applied:</span>
          <span className="font-medium">{commitResult.tagRulesApplied ?? 0}</span>
        </div>
        {commitResult.transactionsFailed > 0 && (
          <div className="flex justify-between">
            <span className="text-destructive">Transactions failed:</span>
            <span className="font-medium text-destructive">{commitResult.transactionsFailed}</span>
          </div>
        )}
        <div className="flex justify-between">
          <span className="text-muted-foreground">Reclassifications:</span>
          <span className="font-medium">{commitResult.retroactiveReclassifications}</span>
        </div>
      </div>
      <RuleBreakdown rulesApplied={commitResult.rulesApplied} />
      {commitResult.failedDetails && <FailureDetails details={commitResult.failedDetails} />}
    </div>
  );
}
