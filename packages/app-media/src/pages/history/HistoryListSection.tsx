import { Button } from '@pops/ui';

import { HistoryCard } from './HistoryCard';
import { HistoryItem } from './HistoryItem';
import { PAGE_SIZE, type HistoryEntry } from './types';

interface HistoryListSectionProps {
  entries: HistoryEntry[];
  isDeleting: boolean;
  onDelete: (id: number) => void;
  debriefByMovieId: Map<number, number>;
  offset: number;
  total: number;
  hasMore: boolean;
  onPageChange: (offset: number) => void;
}

function getDebriefId(entry: HistoryEntry, debriefByMovieId: Map<number, number>): number | null {
  if (entry.mediaType !== 'movie') return null;
  return debriefByMovieId.get(entry.mediaId) ?? null;
}

function PaginationBar({
  offset,
  total,
  hasMore,
  onPageChange,
}: {
  offset: number;
  total: number;
  hasMore: boolean;
  onPageChange: (offset: number) => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <p className="text-sm text-muted-foreground">
        Showing {Math.min(offset + PAGE_SIZE, total)} of {total}
      </p>
      <div className="flex gap-2">
        {offset > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => onPageChange(Math.max(0, offset - PAGE_SIZE))}
          >
            Previous
          </Button>
        )}
        {hasMore && (
          <Button variant="outline" size="sm" onClick={() => onPageChange(offset + PAGE_SIZE)}>
            Next
          </Button>
        )}
      </div>
    </div>
  );
}

export function HistoryListSection({
  entries,
  isDeleting,
  onDelete,
  debriefByMovieId,
  offset,
  total,
  hasMore,
  onPageChange,
}: HistoryListSectionProps) {
  return (
    <>
      <div className="space-y-2 md:hidden">
        {entries.map((entry) => (
          <HistoryItem
            key={entry.id}
            entry={entry}
            onDelete={onDelete}
            isDeleting={isDeleting}
            debriefSessionId={getDebriefId(entry, debriefByMovieId)}
          />
        ))}
      </div>
      <div className="hidden md:grid grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
        {entries.map((entry) => (
          <HistoryCard
            key={entry.id}
            entry={entry}
            onDelete={onDelete}
            isDeleting={isDeleting}
            debriefSessionId={getDebriefId(entry, debriefByMovieId)}
          />
        ))}
      </div>
      <PaginationBar offset={offset} total={total} hasMore={hasMore} onPageChange={onPageChange} />
    </>
  );
}
