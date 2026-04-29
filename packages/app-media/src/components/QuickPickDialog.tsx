import { Sparkles } from 'lucide-react';
import { useCallback, useState } from 'react';
import { toast } from 'sonner';

import { trpc } from '@pops/api-client';
/**
 * QuickPickDialog — "What Should I Watch Tonight?" modal.
 *
 * Shows a single random recommendation at a time.
 * "Not this one" cycles to next, "Watch this!" adds to watchlist.
 */
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Skeleton,
} from '@pops/ui';

import { PickCard } from './quick-pick/PickCard';

function PickLoading() {
  return (
    <div className="space-y-3">
      <Skeleton className="aspect-[2/3] w-full rounded-lg" />
      <Skeleton className="h-6 w-3/4" />
      <Skeleton className="h-4 w-1/2" />
    </div>
  );
}

function FinishedView({ onRefresh }: { onRefresh: () => void }) {
  return (
    <div className="text-center py-8 space-y-4">
      <Sparkles className="h-10 w-10 mx-auto text-app-accent" />
      <p className="text-muted-foreground">You&apos;ve seen all the picks!</p>
      <Button onClick={onRefresh} variant="outline">
        Get More Picks
      </Button>
    </div>
  );
}

function EmptyView() {
  return (
    <div className="text-center py-8">
      <p className="text-muted-foreground">
        No picks available — all movies are watched or on your watchlist.
      </p>
    </div>
  );
}

function useQuickPickModel() {
  const [open, setOpen] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const utils = trpc.useUtils();

  const { data, isLoading, refetch } = trpc.media.discovery.quickPick.useQuery(
    { count: 5 },
    { enabled: open }
  );

  const addToWatchlist = trpc.media.watchlist.add.useMutation({
    onSuccess: () => {
      toast.success('Added to watchlist!');
      void utils.media.watchlist.list.invalidate();
      setOpen(false);
    },
    onError: (err: { message: string; data?: { code?: string } | null }) => {
      if (err.data?.code === 'CONFLICT') {
        toast.info('Already on watchlist');
        setOpen(false);
      } else {
        toast.error(`Failed to add: ${err.message}`);
      }
    },
  });

  const movies = data?.data ?? [];
  const currentMovie = movies[currentIndex];
  const isFinished = currentIndex >= movies.length && movies.length > 0;

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      setOpen(nextOpen);
      if (nextOpen) {
        setCurrentIndex(0);
        void refetch();
      }
    },
    [refetch]
  );

  return {
    open,
    isLoading,
    movies,
    currentMovie,
    currentIndex,
    isFinished,
    addToWatchlist,
    handleOpenChange,
    handleSkip: () => setCurrentIndex((i) => i + 1),
    handleWatch: () => {
      if (!currentMovie) return;
      addToWatchlist.mutate({ mediaType: 'movie', mediaId: currentMovie.id });
    },
    handleRefresh: () => {
      setCurrentIndex(0);
      void refetch();
    },
  };
}

function PickContent({
  isLoading,
  movies,
  isFinished,
  currentMovie,
  currentIndex,
  isAdding,
  onSkip,
  onWatch,
  onRefresh,
}: {
  isLoading: boolean;
  movies: unknown[];
  isFinished: boolean;
  currentMovie: ReturnType<typeof useQuickPickModel>['currentMovie'];
  currentIndex: number;
  isAdding: boolean;
  onSkip: () => void;
  onWatch: () => void;
  onRefresh: () => void;
}) {
  if (isLoading) return <PickLoading />;
  if (movies.length === 0) return <EmptyView />;
  if (isFinished) return <FinishedView onRefresh={onRefresh} />;
  if (!currentMovie) return null;
  return (
    <PickCard
      movie={currentMovie}
      index={currentIndex}
      total={movies.length}
      onSkip={onSkip}
      onWatch={onWatch}
      isAdding={isAdding}
    />
  );
}

export function QuickPickDialog() {
  const model = useQuickPickModel();

  return (
    <Dialog open={model.open} onOpenChange={model.handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Sparkles className="h-4 w-4 mr-1.5" />
          Tonight?
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-0">
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-app-accent" />
            What Should I Watch?
          </DialogTitle>
          <DialogDescription className="sr-only">
            Get a random movie recommendation from your watchlist
          </DialogDescription>
        </DialogHeader>
        <div className="px-6 pb-6 pt-4">
          <PickContent
            isLoading={model.isLoading}
            movies={model.movies}
            isFinished={model.isFinished}
            currentMovie={model.currentMovie}
            currentIndex={model.currentIndex}
            isAdding={model.addToWatchlist.isPending}
            onSkip={model.handleSkip}
            onWatch={model.handleWatch}
            onRefresh={model.handleRefresh}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
