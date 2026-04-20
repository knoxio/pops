import { RefreshCcw } from 'lucide-react';

import { Button } from '@pops/ui';

import { PREVIEW_CHANGESET_MAX_TRANSACTIONS } from '../lib/preview-scoping';
import { ImpactContent } from './impact-panel/ImpactContent';

import type { PreviewChangeSetOutput, PreviewView } from './types';

function PanelHeader({ onRerun, disabled }: { onRerun: () => void; disabled: boolean }) {
  return (
    <div className="px-4 py-2 border-b flex items-center gap-2">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex-1">
        Impact
      </div>
      <Button
        size="sm"
        variant="ghost"
        onClick={onRerun}
        disabled={disabled}
        title="Re-run preview"
      >
        <RefreshCcw className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

function ViewSwitcher({
  view,
  onViewChange,
}: {
  view: PreviewView;
  onViewChange: (v: PreviewView) => void;
}) {
  return (
    <div className="px-4 py-2 border-b flex gap-1">
      <Button
        size="sm"
        variant={view === 'selected' ? 'default' : 'outline'}
        onClick={() => onViewChange('selected')}
        className="flex-1"
      >
        Selected
      </Button>
      <Button
        size="sm"
        variant={view === 'combined' ? 'default' : 'outline'}
        onClick={() => onViewChange('combined')}
        className="flex-1"
      >
        Combined
      </Button>
    </div>
  );
}

function PanelLabel({
  label,
  stale,
  truncated,
}: {
  label: string;
  stale: boolean;
  truncated: boolean;
}) {
  return (
    <div className="px-4 py-2 text-xs text-muted-foreground">
      {label}
      {stale && <span className="ml-2 text-amber-600">(stale)</span>}
      {truncated && (
        <span
          className="ml-2 text-amber-600"
          title={`Previewed against the first ${PREVIEW_CHANGESET_MAX_TRANSACTIONS} matching transactions. The counts below are an under-count — narrow the pattern or re-run after importing in smaller batches to see full impact.`}
        >
          (preview truncated)
        </span>
      )}
    </div>
  );
}

interface SectionsProps {
  previewResult: PreviewChangeSetOutput;
  dbPreviewResult?: PreviewChangeSetOutput | null;
  isPending: boolean;
  dbTruncated?: boolean;
  dbTotal?: number;
}

function DbSectionContent({
  dbPreviewResult,
  isPending,
}: {
  dbPreviewResult?: PreviewChangeSetOutput | null;
  isPending: boolean;
}) {
  if (dbPreviewResult) return <ImpactContent result={dbPreviewResult} />;
  if (isPending) return <div className="text-xs text-muted-foreground">Computing…</div>;
  return <div className="text-xs text-muted-foreground">No existing transactions match.</div>;
}

function TwoSectionView({
  previewResult,
  dbPreviewResult,
  isPending,
  dbTruncated,
  dbTotal,
}: SectionsProps) {
  return (
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
          {dbTruncated && dbTotal !== undefined && (
            <span
              className="text-amber-600 normal-case font-normal"
              title={`Preview truncated — showing first ${PREVIEW_CHANGESET_MAX_TRANSACTIONS} of ${dbTotal} existing transactions.`}
            >
              (preview truncated — first {PREVIEW_CHANGESET_MAX_TRANSACTIONS} of {dbTotal})
            </span>
          )}
        </div>
        <DbSectionContent dbPreviewResult={dbPreviewResult} isPending={isPending} />
      </div>
    </div>
  );
}

interface PanelBodyProps {
  previewError: string | null;
  isPending: boolean;
  previewResult: PreviewChangeSetOutput | null;
  dbPreviewResult?: PreviewChangeSetOutput | null;
  dbTruncated?: boolean;
  dbTotal?: number;
}

function PanelBody(props: PanelBodyProps) {
  if (props.previewError)
    return <div className="text-sm text-destructive">{props.previewError}</div>;
  if (props.isPending && !props.previewResult)
    return <div className="text-sm text-muted-foreground">Computing preview…</div>;
  if (!props.previewResult)
    return <div className="text-sm text-muted-foreground">No preview yet.</div>;
  if (props.dbPreviewResult !== undefined) {
    return (
      <TwoSectionView
        previewResult={props.previewResult}
        dbPreviewResult={props.dbPreviewResult}
        isPending={props.isPending}
        dbTruncated={props.dbTruncated}
        dbTotal={props.dbTotal}
      />
    );
  }
  return <ImpactContent result={props.previewResult} />;
}

export function ImpactPanel(props: {
  view: PreviewView;
  onViewChange: (v: PreviewView) => void;
  label: string;
  previewResult: PreviewChangeSetOutput | null;
  dbPreviewResult?: PreviewChangeSetOutput | null;
  dbTruncated?: boolean;
  dbTotal?: number;
  previewError: string | null;
  isPending: boolean;
  stale: boolean;
  truncated: boolean;
  onRerun: () => void;
  disabled: boolean;
}) {
  return (
    <div className="flex flex-col min-h-0 border-l">
      <PanelHeader onRerun={props.onRerun} disabled={props.disabled} />
      <ViewSwitcher view={props.view} onViewChange={props.onViewChange} />
      <PanelLabel label={props.label} stale={props.stale} truncated={props.truncated} />
      <div className="flex-1 overflow-auto px-4 pb-4">
        <PanelBody
          previewError={props.previewError}
          isPending={props.isPending}
          previewResult={props.previewResult}
          dbPreviewResult={props.dbPreviewResult}
          dbTruncated={props.dbTruncated}
          dbTotal={props.dbTotal}
        />
      </div>
    </div>
  );
}
