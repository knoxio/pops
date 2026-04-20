import { AlertTriangle } from 'lucide-react';

import type { ImportWarning } from '@pops/api/modules/finance/imports';

export function ReviewWarnings({ warnings }: { warnings?: ImportWarning[] }) {
  if (!warnings || warnings.length === 0) return null;
  return (
    <div className="space-y-2">
      {warnings.map((warning, idx) => (
        <div
          key={idx}
          className="p-4 text-sm rounded-lg border text-warning bg-warning/10 border-warning/25"
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
                  {warning.affectedCount !== 1 ? 's' : ''} could not be automatically categorized
                  and may appear in the Uncertain or Failed tabs.
                </p>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
