import { Badge } from '@pops/ui';

import type { PreviewChangeSetOutput } from '../types';

const MAX_CHANGED = 100;
const MAX_UNCHANGED = 30;

function ImpactSummary({ summary }: { summary: PreviewChangeSetOutput['summary'] }) {
  return (
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
  );
}

type DiffItem = PreviewChangeSetOutput['diffs'][number];

function ChangedSection({ changed }: { changed: DiffItem[] }) {
  if (changed.length === 0) return null;
  return (
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
  );
}

function UnchangedSection({ unchanged }: { unchanged: DiffItem[] }) {
  if (unchanged.length === 0) return null;
  return (
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
  );
}

export function ImpactContent({ result }: { result: PreviewChangeSetOutput }) {
  const { diffs, summary } = result;
  const changed = diffs.filter((d) => d.changed);
  const unchanged = diffs.filter((d) => !d.changed);
  return (
    <div className="space-y-3">
      <ImpactSummary summary={summary} />
      <ChangedSection changed={changed} />
      <UnchangedSection unchanged={unchanged} />
      {changed.length === 0 && unchanged.length === 0 && (
        <div className="text-xs text-muted-foreground">
          No transactions in the current import match this scope.
        </div>
      )}
    </div>
  );
}
