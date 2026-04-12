import { Button } from '@pops/ui';
import { AlertCircle, CheckCircle, RefreshCw, XCircle } from 'lucide-react';
import { useNavigate } from 'react-router';

import { useImportStore } from '../../store/importStore';

/**
 * Step 7: Import summary — reads CommitResult from store (PRD-031 US-06).
 * Guards against direct navigation without a commit.
 */
export function SummaryStep() {
  const commitResult = useImportStore((s) => s.commitResult);
  const reset = useImportStore((s) => s.reset);
  const navigate = useNavigate();

  if (!commitResult) {
    return (
      <div className="text-center py-12 space-y-4">
        <p className="text-gray-500">No commit results available.</p>
        <p className="text-sm text-gray-400">
          Complete the final review and commit before viewing the summary.
        </p>
      </div>
    );
  }

  const totalRules =
    commitResult.rulesApplied.add +
    commitResult.rulesApplied.edit +
    commitResult.rulesApplied.disable +
    commitResult.rulesApplied.remove;

  return (
    <div className="space-y-6">
      <div className="text-center">
        <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
        <h2 className="text-2xl font-semibold mb-2">Import Complete</h2>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          All changes have been committed successfully.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Entities created */}
        <div className="bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg p-4 text-center">
          <div className="flex items-center justify-center mb-2">
            <CheckCircle className="w-5 h-5 text-green-600" />
          </div>
          <div className="text-2xl font-semibold text-green-900 dark:text-green-100">
            {commitResult.entitiesCreated}
          </div>
          <div className="text-xs text-green-700 dark:text-green-300">Entities Created</div>
        </div>

        {/* Rules applied */}
        <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-4 text-center">
          <div className="flex items-center justify-center mb-2">
            <CheckCircle className="w-5 h-5 text-blue-600" />
          </div>
          <div className="text-2xl font-semibold text-blue-900 dark:text-blue-100">
            {totalRules}
          </div>
          <div className="text-xs text-blue-700 dark:text-blue-300">Rules Applied</div>
        </div>

        {/* Transactions imported */}
        <div className="bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg p-4 text-center">
          <div className="flex items-center justify-center mb-2">
            <CheckCircle className="w-5 h-5 text-green-600" />
          </div>
          <div className="text-2xl font-semibold text-green-900 dark:text-green-100">
            {commitResult.transactionsImported}
          </div>
          <div className="text-xs text-green-700 dark:text-green-300">Transactions Imported</div>
        </div>

        {/* Transactions failed */}
        {commitResult.transactionsFailed > 0 ? (
          <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg p-4 text-center">
            <div className="flex items-center justify-center mb-2">
              <XCircle className="w-5 h-5 text-red-600" />
            </div>
            <div className="text-2xl font-semibold text-red-900 dark:text-red-100">
              {commitResult.transactionsFailed}
            </div>
            <div className="text-xs text-red-700 dark:text-red-300">Transactions Failed</div>
          </div>
        ) : (
          <div className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 text-center">
            <div className="flex items-center justify-center mb-2">
              <AlertCircle className="w-5 h-5 text-gray-400" />
            </div>
            <div className="text-2xl font-semibold text-gray-900 dark:text-gray-100">0</div>
            <div className="text-xs text-gray-700 dark:text-gray-300">Transactions Failed</div>
          </div>
        )}
      </div>

      {/* Failure details (US-06 AC-5) */}
      {commitResult.failedDetails && commitResult.failedDetails.length > 0 && (
        <div className="border border-red-200 dark:border-red-800 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <XCircle className="h-4 w-4 text-red-600" />
            <h3 className="text-sm font-semibold text-red-800 dark:text-red-200">
              Failed Transactions
            </h3>
          </div>
          <div className="space-y-2">
            {commitResult.failedDetails.map((detail, idx) => (
              <div
                key={idx}
                className="flex items-start gap-3 text-sm py-1 border-b border-red-100 dark:border-red-900 last:border-0"
              >
                {detail.checksum && (
                  <span className="font-mono text-xs text-red-600 dark:text-red-400 shrink-0">
                    {detail.checksum.slice(0, 12)}
                  </span>
                )}
                <span className="text-red-700 dark:text-red-300 text-xs">{detail.error}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Rule breakdown */}
      {totalRules > 0 && (
        <div className="border rounded-lg p-4">
          <h3 className="text-sm font-semibold mb-2">Rule Breakdown</h3>
          <div className="grid grid-cols-4 gap-2 text-sm text-center">
            {commitResult.rulesApplied.add > 0 && (
              <div>
                <div className="font-medium">{commitResult.rulesApplied.add}</div>
                <div className="text-xs text-muted-foreground">Added</div>
              </div>
            )}
            {commitResult.rulesApplied.edit > 0 && (
              <div>
                <div className="font-medium">{commitResult.rulesApplied.edit}</div>
                <div className="text-xs text-muted-foreground">Edited</div>
              </div>
            )}
            {commitResult.rulesApplied.disable > 0 && (
              <div>
                <div className="font-medium">{commitResult.rulesApplied.disable}</div>
                <div className="text-xs text-muted-foreground">Disabled</div>
              </div>
            )}
            {commitResult.rulesApplied.remove > 0 && (
              <div>
                <div className="font-medium">{commitResult.rulesApplied.remove}</div>
                <div className="text-xs text-muted-foreground">Removed</div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Retroactive reclassifications */}
      <div className="border rounded-lg p-4">
        <div className="flex items-center gap-2 mb-1">
          <RefreshCw className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Retroactive Reclassifications</h3>
        </div>
        <p className="text-sm text-muted-foreground">
          {commitResult.retroactiveReclassifications > 0
            ? `${commitResult.retroactiveReclassifications} existing transaction${commitResult.retroactiveReclassifications === 1 ? ' was' : 's were'} reclassified based on updated rules.`
            : 'No existing transactions affected.'}
        </p>
      </div>

      <div className="flex justify-between gap-3">
        <Button
          variant="outline"
          onClick={() => {
            reset();
            navigate('/import');
          }}
        >
          New Import
        </Button>
        <Button onClick={() => navigate('/transactions')}>View Transactions</Button>
      </div>
    </div>
  );
}
