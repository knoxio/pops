import { RefreshCcw } from 'lucide-react';

import { Badge, Button } from '@pops/ui';

import { PREVIEW_CHANGESET_MAX_TRANSACTIONS } from '../lib/preview-scoping';

import type { PreviewChangeSetOutput, PreviewView } from './types';

function ImpactContent(props: { result: PreviewChangeSetOutput }) {
  const { diffs, summary } = props.result;
  const changed = diffs.filter((d) => d.changed);
  const unchanged = diffs.filter((d) => !d.changed);
  const MAX_CHANGED = 100;
  const MAX_UNCHANGED = 30;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        <Badge variant="secondary" className="text-[10px]">
          {summary.total} checked
        </Badge>
        <Badge variant="secondary" className="text-[10px]">
          +{summary.newMatches}
        </Badge>
        <Badge variant="secondary" className="text-[10px]">
          -{summary.removedMatches}
        </Badge>
        <Badge variant="secondary" className="text-[10px]">
          {summary.statusChanges} Δ
        </Badge>
      </div>
      {changed.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Will change ({changed.length})
          </div>
          {changed.slice(0, MAX_CHANGED).map((d) => (
            <div
              key={`c-${d.checksum ?? d.description}`}
              className="text-xs rounded border-l-2 border-primary pl-2"
            >
              <div className="font-medium truncate">{d.description}</div>
              <div className="text-[10px] text-muted-foreground">
                {d.before.matched ? d.before.status : 'unmatched'} →{' '}
                {d.after.matched ? d.after.status : 'unmatched'}
              </div>
            </div>
          ))}
          {changed.length > MAX_CHANGED && (
            <div className="text-[10px] text-muted-foreground">
              Showing first {MAX_CHANGED} of {changed.length}.
            </div>
          )}
        </div>
      )}
      {unchanged.length > 0 && (
        <div className="space-y-1">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Already matching ({unchanged.length})
          </div>
          {unchanged.slice(0, MAX_UNCHANGED).map((d) => (
            <div
              key={`u-${d.checksum ?? d.description}`}
              className="text-xs text-muted-foreground truncate"
            >
              {d.description}
            </div>
          ))}
          {unchanged.length > MAX_UNCHANGED && (
            <div className="text-[10px] text-muted-foreground">
              Showing first {MAX_UNCHANGED} of {unchanged.length}.
            </div>
          )}
        </div>
      )}
      {changed.length === 0 && unchanged.length === 0 && (
        <div className="text-xs text-muted-foreground">
          No transactions in the current import match this scope.
        </div>
      )}
    </div>
  );
}

export function ImpactPanel(props: {
  view: PreviewView;
  onViewChange: (v: PreviewView) => void;
  label: string;
  previewResult: PreviewChangeSetOutput | null;
  /** DB-transaction portion of the preview (browse mode, PRD-032 US-06). */
  dbPreviewResult?: PreviewChangeSetOutput | null;
  /** Whether DB transactions were truncated at fetch time. */
  dbTruncated?: boolean;
  /** Total DB transaction count when truncated. */
  dbTotal?: number;
  previewError: string | null;
  isPending: boolean;
  stale: boolean;
  truncated: boolean;
  onRerun: () => void;
  disabled: boolean;
}) {
  const { previewResult, dbPreviewResult, previewError } = props;
  const hasTwoSections = dbPreviewResult !== undefined;
  return (
    <div className="flex flex-col min-h-0 border-l">
      <div className="px-4 py-2 border-b flex items-center gap-2">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex-1">
          Impact
        </div>
        <Button
          size="sm"
          variant="ghost"
          onClick={props.onRerun}
          disabled={props.disabled}
          title="Re-run preview"
        >
          <RefreshCcw className="h-3.5 w-3.5" />
        </Button>
      </div>
      <div className="px-4 py-2 border-b flex gap-1">
        <Button
          size="sm"
          variant={props.view === 'selected' ? 'default' : 'outline'}
          onClick={() => {
            props.onViewChange('selected');
          }}
          className="flex-1"
        >
          Selected
        </Button>
        <Button
          size="sm"
          variant={props.view === 'combined' ? 'default' : 'outline'}
          onClick={() => {
            props.onViewChange('combined');
          }}
          className="flex-1"
        >
          Combined
        </Button>
      </div>
      <div className="px-4 py-2 text-xs text-muted-foreground">
        {props.label}
        {props.stale && <span className="ml-2 text-amber-600">(stale)</span>}
        {props.truncated && (
          <span
            className="ml-2 text-amber-600"
            title={`Previewed against the first ${PREVIEW_CHANGESET_MAX_TRANSACTIONS} matching transactions. The counts below are an under-count — narrow the pattern or re-run after importing in smaller batches to see full impact.`}
          >
            (preview truncated)
          </span>
        )}
      </div>
      <div className="flex-1 overflow-auto px-4 pb-4">
        {previewError ? (
          <div className="text-sm text-destructive">{previewError}</div>
        ) : props.isPending && !previewResult ? (
          <div className="text-sm text-muted-foreground">Computing preview…</div>
        ) : !previewResult ? (
          <div className="text-sm text-muted-foreground">No preview yet.</div>
        ) : hasTwoSections ? (
          <div className="space-y-4">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                Import transactions
              </div>
              <ImpactContent result={previewResult} />
            </div>
            <div className="border-t pt-3">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5">
                Existing transactions
                {props.dbTruncated && props.dbTotal !== undefined && (
                  <span
                    className="text-amber-600 normal-case font-normal"
                    title={`Preview truncated — showing first ${PREVIEW_CHANGESET_MAX_TRANSACTIONS} of ${props.dbTotal} existing transactions.`}
                  >
                    (preview truncated — first {PREVIEW_CHANGESET_MAX_TRANSACTIONS} of{' '}
                    {props.dbTotal})
                  </span>
                )}
              </div>
              {dbPreviewResult ? (
                <ImpactContent result={dbPreviewResult} />
              ) : props.isPending ? (
                <div className="text-xs text-muted-foreground">Computing…</div>
              ) : (
                <div className="text-xs text-muted-foreground">No existing transactions match.</div>
              )}
            </div>
          </div>
        ) : (
          <ImpactContent result={previewResult} />
        )}
      </div>
    </div>
  );
}
