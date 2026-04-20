import { AlertCircle } from 'lucide-react';
import { Link } from 'react-router';

import { Button } from '@pops/ui';

import { MediaCard } from '../../components/MediaCard';
import { MediaGrid } from '../../components/MediaGrid';
import { LibrarySkeleton } from './LibrarySkeleton';
import { PaginationControls } from './PaginationControls';

import type { MediaItem } from '../../hooks/useMediaLibrary';

interface LibraryContentProps {
  isLoading: boolean;
  error: unknown;
  isLibraryEmpty: boolean;
  items: MediaItem[];
  debouncedSearch: string;
  pageSize: number;
  showTypeBadge: boolean;
  clampedPage: number;
  totalPages: number;
  totalItems: number;
  setLocalSearch: (v: string) => void;
  setParam: (key: string, value: string) => void;
  setPageSize: (s: number) => void;
  refetch: () => void;
}

function ErrorView({ refetch }: { refetch: () => void }) {
  return (
    <div className="text-center py-16">
      <AlertCircle className="mx-auto h-10 w-10 text-muted-foreground mb-3" />
      <p className="text-muted-foreground">Something went wrong loading your library.</p>
      <Button variant="outline" size="sm" className="mt-4" onClick={() => void refetch()}>
        Retry
      </Button>
    </div>
  );
}

function LibraryEmptyView() {
  return (
    <div className="text-center py-16">
      <p className="text-muted-foreground">
        Your library is empty. Search for movies and shows to get started.
      </p>
      <Link to="/media/search" className="mt-4 inline-block text-sm text-primary underline">
        Search for media
      </Link>
    </div>
  );
}

function NoResults({
  debouncedSearch,
  setLocalSearch,
}: {
  debouncedSearch: string;
  setLocalSearch: (v: string) => void;
}) {
  return (
    <div className="text-center py-16">
      {debouncedSearch ? (
        <>
          <p className="text-muted-foreground">No results for &ldquo;{debouncedSearch}&rdquo;</p>
          <Button variant="outline" size="sm" className="mt-4" onClick={() => setLocalSearch('')}>
            Clear search
          </Button>
        </>
      ) : (
        <p className="text-muted-foreground">No results match your filters.</p>
      )}
    </div>
  );
}

export function LibraryContent(props: LibraryContentProps) {
  if (props.isLoading) return <LibrarySkeleton count={props.pageSize} />;
  if (props.error) return <ErrorView refetch={props.refetch} />;
  if (props.isLibraryEmpty) return <LibraryEmptyView />;
  if (props.items.length === 0) {
    return (
      <NoResults debouncedSearch={props.debouncedSearch} setLocalSearch={props.setLocalSearch} />
    );
  }
  return (
    <>
      <MediaGrid>
        {props.items.map((item) => (
          <MediaCard
            key={`${item.type}-${item.id}`}
            id={item.id}
            type={item.type}
            title={item.title}
            year={item.year}
            posterUrl={item.cdnPosterUrl ?? item.posterUrl}
            fallbackPosterUrl={item.cdnPosterUrl ? item.posterUrl : undefined}
            showTypeBadge={props.showTypeBadge}
          />
        ))}
      </MediaGrid>
      <PaginationControls
        page={props.clampedPage}
        totalPages={props.totalPages}
        pageSize={props.pageSize}
        totalItems={props.totalItems}
        onPageChange={(p) => props.setParam('page', String(p))}
        onPageSizeChange={props.setPageSize}
      />
    </>
  );
}
