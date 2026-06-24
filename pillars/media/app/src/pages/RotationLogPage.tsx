import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, ScrollText } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';

import { Button, Card, CardContent, PageHeader, Skeleton } from '@pops/ui';

import { unwrap } from '../media-api-helpers.js';
import { rotationListRotationLog, rotationRotationLogStats } from '../media-api/index.js';
import { LogEntry } from './rotation-log/LogEntry';
import { StatsGrid } from './rotation-log/StatsGrid';

import type { LogEntryData } from './rotation-log/types';

const PAGE_SIZE = 20;

function LogPagination({
  page,
  totalPages,
  setPage,
}: {
  page: number;
  totalPages: number;
  setPage: React.Dispatch<React.SetStateAction<number>>;
}) {
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-center gap-2">
      <Button
        variant="outline"
        size="sm"
        onClick={() => setPage((p) => Math.max(0, p - 1))}
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
        onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
        disabled={page >= totalPages - 1}
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
}

function LogList({ isLoading, items }: { isLoading: boolean; items: LogEntryData[] }) {
  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-full rounded-lg" />
        ))}
      </div>
    );
  }
  if (items.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-muted-foreground">
          No rotation cycles have run yet. Enable rotation in{' '}
          <Link to="/media/rotation" className="text-primary underline">
            Settings
          </Link>{' '}
          to get started.
        </CardContent>
      </Card>
    );
  }
  return (
    <div className="space-y-2">
      {items.map((entry) => (
        <LogEntry key={entry.id} entry={entry} />
      ))}
    </div>
  );
}

export function RotationLogPage() {
  const [page, setPage] = useState(0);

  const logInput = { limit: PAGE_SIZE, offset: page * PAGE_SIZE };
  const { data, isLoading } = useQuery({
    queryKey: ['media', 'rotation', 'listRotationLog', logInput],
    queryFn: async () => unwrap(await rotationListRotationLog({ query: logInput })),
  });

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['media', 'rotation', 'rotationLogStats'],
    queryFn: async () => unwrap(await rotationRotationLogStats()),
  });

  const log = data?.data;
  const items: LogEntryData[] = log?.items ?? [];
  const totalPages = log ? Math.ceil(log.total / PAGE_SIZE) : 0;

  return (
    <div className="space-y-6 max-w-4xl mx-auto p-6">
      <PageHeader
        title="Rotation Log"
        icon={<ScrollText className="h-6 w-6 text-muted-foreground" />}
        backHref="/media/rotation"
        breadcrumbs={[
          { label: 'Media', href: '/media' },
          { label: 'Rotation', href: '/media/rotation' },
          { label: 'Log' },
        ]}
        renderLink={Link}
      />
      <StatsGrid stats={stats?.data} isLoading={statsLoading} />
      <LogList isLoading={isLoading} items={items} />
      <LogPagination page={page} totalPages={totalPages} setPage={setPage} />
    </div>
  );
}
