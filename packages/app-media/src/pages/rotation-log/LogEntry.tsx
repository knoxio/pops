import { AlertTriangle, ChevronDown, XCircle } from 'lucide-react';
import { useState } from 'react';

import {
  Card,
  CardContent,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  formatDate,
} from '@pops/ui';

import { parseDetails, type LogDetails, type LogEntryData } from './types';

function DetailList({
  label,
  items,
}: {
  label: string;
  items?: { tmdbId: number; title: string }[];
}) {
  if (!items || items.length === 0) return null;
  return (
    <div>
      <h4 className="mb-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </h4>
      <ul className="space-y-0.5 text-sm">
        {items.map((m) => (
          <li key={m.tmdbId}>{m.title}</li>
        ))}
      </ul>
    </div>
  );
}

function FailedList({ items }: { items: NonNullable<LogDetails['failed']> }) {
  return (
    <div>
      <h4 className="mb-1 text-xs font-medium uppercase tracking-wider text-destructive">Failed</h4>
      <ul className="space-y-0.5 text-sm">
        {items.map((m) => (
          <li key={m.tmdbId} className="text-destructive">
            {m.title}
            {m.error && <span className="ml-1 text-xs text-destructive/70">({m.error})</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}

function StatusPills({
  hasError,
  wasSkipped,
  failedCount,
}: {
  hasError: boolean;
  wasSkipped: boolean;
  failedCount: number;
}) {
  return (
    <>
      {wasSkipped && (
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-xs text-amber-500">
          <AlertTriangle className="h-3 w-3" />
          Skipped
        </span>
      )}
      {hasError && (
        <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-xs text-destructive">
          <XCircle className="h-3 w-3" />
          {failedCount} failed
        </span>
      )}
    </>
  );
}

function LogEntryHeader({
  entry,
  open,
  hasError,
  wasSkipped,
}: {
  entry: LogEntryData;
  open: boolean;
  hasError: boolean;
  wasSkipped: boolean;
}) {
  return (
    <CardContent className="p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{formatDate(entry.executedAt, 'datetime')}</span>
            <StatusPills
              hasError={hasError}
              wasSkipped={wasSkipped}
              failedCount={entry.removalsFailed}
            />
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <span>
              Marked: <strong className="text-foreground">{entry.moviesMarkedLeaving}</strong>
            </span>
            <span>
              Removed: <strong className="text-foreground">{entry.moviesRemoved}</strong>
            </span>
            <span>
              Added: <strong className="text-foreground">{entry.moviesAdded}</strong>
            </span>
            <span>
              Space: <strong className="text-foreground">{entry.freeSpaceGb.toFixed(1)}</strong>
              {' / '}
              {entry.targetFreeGb.toFixed(1)} GB
            </span>
          </div>
          {wasSkipped && <p className="text-xs text-amber-500">{entry.skippedReason}</p>}
        </div>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </div>
    </CardContent>
  );
}

function LogEntryBody({ details }: { details: LogDetails | null }) {
  return (
    <div className="border-t px-4 pb-4 pt-3">
      {details ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <DetailList label="Marked Leaving" items={details.marked} />
          <DetailList label="Removed" items={details.removed} />
          <DetailList label="Added" items={details.added} />
          {details.failed && details.failed.length > 0 && <FailedList items={details.failed} />}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No detailed movie data available.</p>
      )}
    </div>
  );
}

function getBorderClass(hasError: boolean, wasSkipped: boolean): string {
  if (hasError) return 'border-destructive/50';
  if (wasSkipped) return 'border-amber-500/50';
  return '';
}

export function LogEntry({ entry }: { entry: LogEntryData }) {
  const [open, setOpen] = useState(false);
  const details = parseDetails(entry.details);
  const hasError = entry.removalsFailed > 0;
  const wasSkipped = !!entry.skippedReason;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card className={getBorderClass(hasError, wasSkipped)}>
        <CollapsibleTrigger asChild>
          <button className="w-full text-left">
            <LogEntryHeader entry={entry} open={open} hasError={hasError} wasSkipped={wasSkipped} />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <LogEntryBody details={details} />
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
