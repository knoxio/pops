import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Sparkles } from 'lucide-react';
import { useCallback, useState } from 'react';
import { toast } from 'sonner';

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@pops/ui';

import { unwrap } from '../media-api-helpers.js';
import { discoveryQuickPick, watchlistAdd } from '../media-api/index.js';
import { PickCard } from './quick-pick/PickCard';
import { EmptyView, ErrorView, FinishedView, PickLoading } from './quick-pick/PickViews';

interface QuickPickMovie {
  id: number;
  title: string;
  posterUrl: string | null;
  releaseDate: string | null;
  genres: string | null;
  overview: string | null;
  voteAverage: number | null;
  runtime: number | null;
}
interface QuickPickResult {
  data: QuickPickMovie[];
}
interface AddToWatchlistInput {
  mediaType: 'movie';
  mediaId: number;
}

function useQuickPickModel() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);

  const { data, isLoading, error, refetch } = useQuery<QuickPickResult>({
    queryKey: ['media', 'discovery', 'quickPick', { count: 5 }],
    queryFn: async () => unwrap(await discoveryQuickPick({ query: { count: 5 } })),
    enabled: open,
  });

  const addToWatchlist = useMutation({
    mutationFn: async (input: AddToWatchlistInput) => unwrap(await watchlistAdd({ body: input })),
    onSuccess: () => {
      toast.success('Added to watchlist!');
      setOpen(false);
      void queryClient.invalidateQueries({ queryKey: ['media', 'watchlist'] });
    },
    onError: (err: Error) => {
      toast.error(`Failed to add: ${err.message}`);
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
    error,
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
  error,
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
  error: { message: string } | null;
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
  if (error) return <ErrorView message={error.message} />;
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
            error={model.error}
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
