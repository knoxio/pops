import { AlertTriangle, RefreshCw } from 'lucide-react';

import { Button } from '@pops/ui';

import type { ImportWarning } from '@pops/api/modules/finance/imports';

export function WarningCard({ warning }: { warning: ImportWarning }) {
  return (
    <div
      key={warning.type}
      className="w-full max-w-md p-4 text-sm rounded-lg border text-warning bg-warning/10 border-warning/25"
    >
      <div className="flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
        <div className="flex-1 space-y-1">
          <p className="font-medium">
            {warning.type === 'AI_CATEGORIZATION_UNAVAILABLE'
              ? 'AI Categorization Unavailable'
              : 'AI API Error'}
          </p>
          <p className="text-xs">{warning.message}</p>
          {warning.details && <p className="text-xs opacity-70 font-mono">{warning.details}</p>}
          {warning.affectedCount && (
            <p className="text-xs opacity-80">
              {warning.affectedCount} transaction
              {warning.affectedCount !== 1 ? 's' : ''} could not be automatically categorized. You
              can manually categorize them in the review step.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

interface ErrorPanelProps {
  errorMessage?: string;
  errors?: Array<{ error: string }>;
  onRetry: () => void;
}

export function FatalErrorPanel({ errorMessage, errors, onRetry }: ErrorPanelProps) {
  return (
    <div className="p-4 max-w-md w-full text-sm text-destructive bg-destructive/10 dark:text-destructive/40 rounded-lg">
      <p className="font-medium mb-1">Processing Failed</p>
      <p>{errorMessage || 'An unexpected error occurred'}</p>
      {errors && errors.length > 0 && (
        <div className="mt-2 space-y-1">
          {errors.map((error) => (
            <p key={error.error} className="text-xs">
              • {error.error}
            </p>
          ))}
        </div>
      )}
      <Button
        variant="ghost"
        size="sm"
        className="mt-3 text-destructive hover:text-destructive"
        onClick={onRetry}
      >
        <RefreshCw className="h-4 w-4" />
        Retry
      </Button>
    </div>
  );
}
