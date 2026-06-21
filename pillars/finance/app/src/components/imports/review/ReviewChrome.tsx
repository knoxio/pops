import { Settings2 } from 'lucide-react';

import { Button } from '@pops/ui';

export function ReviewHeader({
  unresolvedCount,
  browseOpen,
  setBrowseOpen,
}: {
  unresolvedCount: number;
  browseOpen: boolean;
  setBrowseOpen: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between">
      <div>
        <h2 className="text-2xl font-semibold mb-2">Review</h2>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          {unresolvedCount > 0
            ? `${unresolvedCount} transaction(s) need your attention`
            : 'All transactions are ready to import'}
        </p>
      </div>
      <Button variant="outline" size="sm" onClick={() => setBrowseOpen(true)} disabled={browseOpen}>
        <Settings2 className="mr-1.5 h-4 w-4" />
        Manage Rules
      </Button>
    </div>
  );
}

export function ReviewFooter({
  unresolvedCount,
  matchedCount,
  onBack,
  onContinue,
}: {
  unresolvedCount: number;
  matchedCount: number;
  onBack: () => void;
  onContinue: () => void;
}) {
  return (
    <div className="flex justify-between gap-3 items-center">
      <Button variant="outline" onClick={onBack} title="Back to column mapping">
        Back
      </Button>
      <div className="flex flex-col items-end gap-1">
        {unresolvedCount > 0 && (
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Resolve all uncertain/failed transactions to continue
          </p>
        )}
        <Button onClick={onContinue} disabled={unresolvedCount > 0}>
          {`Continue to Tag Review (${matchedCount})`}
        </Button>
      </div>
    </div>
  );
}
