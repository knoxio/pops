import {
  AlertTriangle,
  ArrowLeft,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  RotateCw,
  ScrollText,
  TrendingUp,
  XCircle,
} from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';

/**
 * RotationLogPage — paginated history of rotation cycle events.
 *
 * PRD-072 US-06
 */
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
  Button,
  Card,
  CardContent,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Skeleton,
} from '@pops/ui';

import { trpc } from '../lib/trpc';

const PAGE_SIZE = 20;

interface LogDetails {
  marked?: { tmdbId: number; title: string }[];
  removed?: { tmdbId: number; title: string }[];
  added?: { tmdbId: number; title: string }[];
  failed?: { tmdbId: number; title: string; error?: string }[];
}

function parseDetails(raw: string | null): LogDetails | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as LogDetails;
  } catch {
    return null;
  }
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString();
}

export function RotationLogPage() {
  const [page, setPage] = useState(0);

  const { data, isLoading } = trpc.media.rotation.listRotationLog.useQuery({
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  });

  const { data: stats, isLoading: statsLoading } =
    trpc.media.rotation.getRotationLogStats.useQuery();

  const items = data?.items ?? [];
  const totalPages = data ? Math.ceil(data.total / PAGE_SIZE) : 0;

  return (
    <div className="space-y-6 max-w-4xl mx-auto p-6">
      {/* Breadcrumb */}
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link to="/media">Media</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link to="/media/rotation">Rotation</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Log</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          to="/media/rotation"
          className="inline-flex items-center justify-center h-8 w-8 rounded-md hover:bg-accent hover:text-accent-foreground transition-colors"
          aria-label="Back to Rotation Settings"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <ScrollText className="h-6 w-6 text-muted-foreground" />
        <h1 className="text-2xl font-bold tracking-tight">Rotation Log</h1>
      </div>

      {/* Summary stats */}
      {statsLoading ? (
        <div className="grid gap-4 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-lg" />
          ))}
        </div>
      ) : stats ? (
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-lg border bg-card p-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <RotateCw className="h-4 w-4" />
              Total Rotated
            </div>
            <p className="mt-1 text-2xl font-bold tabular-nums">{stats.totalRotated}</p>
          </div>
          <div className="rounded-lg border bg-card p-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <TrendingUp className="h-4 w-4" />
              Avg / Day
            </div>
            <p className="mt-1 text-2xl font-bold tabular-nums">{stats.avgPerDay}</p>
          </div>
          <div className="rounded-lg border bg-card p-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <ScrollText className="h-4 w-4" />
              Streak
            </div>
            <p className="mt-1 text-2xl font-bold tabular-nums">
              {stats.streak} cycle{stats.streak !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
      ) : null}

      {/* Log entries */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-lg" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            No rotation cycles have run yet. Enable rotation in{' '}
            <Link to="/media/rotation" className="text-primary underline">
              Settings
            </Link>{' '}
            to get started.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {items.map((entry) => (
            <LogEntry key={entry.id} entry={entry} />
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setPage((p) => Math.max(0, p - 1));
            }}
            disabled={page === 0}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {page + 1} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setPage((p) => Math.min(totalPages - 1, p + 1));
            }}
            disabled={page >= totalPages - 1}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}

function LogEntry({
  entry,
}: {
  entry: {
    id: number;
    executedAt: string;
    moviesMarkedLeaving: number;
    moviesRemoved: number;
    moviesAdded: number;
    removalsFailed: number;
    freeSpaceGb: number;
    targetFreeGb: number;
    skippedReason: string | null;
    details: string | null;
  };
}) {
  const [open, setOpen] = useState(false);
  const details = parseDetails(entry.details);
  const hasError = entry.removalsFailed > 0;
  const wasSkipped = !!entry.skippedReason;

  const borderClass = hasError ? 'border-destructive/50' : wasSkipped ? 'border-amber-500/50' : '';

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card className={borderClass}>
        <CollapsibleTrigger asChild>
          <button className="w-full text-left">
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{formatDate(entry.executedAt)}</span>
                    {wasSkipped && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-xs text-amber-500">
                        <AlertTriangle className="h-3 w-3" />
                        Skipped
                      </span>
                    )}
                    {hasError && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-xs text-destructive">
                        <XCircle className="h-3 w-3" />
                        {entry.removalsFailed} failed
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                    <span>
                      Marked:{' '}
                      <strong className="text-foreground">{entry.moviesMarkedLeaving}</strong>
                    </span>
                    <span>
                      Removed: <strong className="text-foreground">{entry.moviesRemoved}</strong>
                    </span>
                    <span>
                      Added: <strong className="text-foreground">{entry.moviesAdded}</strong>
                    </span>
                    <span>
                      Space:{' '}
                      <strong className="text-foreground">{entry.freeSpaceGb.toFixed(1)}</strong>
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
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="border-t px-4 pb-4 pt-3">
            {details ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <DetailList label="Marked Leaving" items={details.marked} />
                <DetailList label="Removed" items={details.removed} />
                <DetailList label="Added" items={details.added} />
                {details.failed && details.failed.length > 0 && (
                  <div>
                    <h4 className="mb-1 text-xs font-medium uppercase tracking-wider text-destructive">
                      Failed
                    </h4>
                    <ul className="space-y-0.5 text-sm">
                      {details.failed.map((m) => (
                        <li key={m.tmdbId} className="text-destructive">
                          {m.title}
                          {m.error && (
                            <span className="ml-1 text-xs text-destructive/70">({m.error})</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No detailed movie data available.</p>
            )}
          </div>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

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
