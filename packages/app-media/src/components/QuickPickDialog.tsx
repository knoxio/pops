/**
 * QuickPickDialog — "What Should I Watch Tonight?" modal.
 *
 * Shows a single random recommendation at a time.
 * "Not this one" cycles to next, "Watch this!" adds to watchlist.
 */
import { useState, useCallback } from "react";
import { toast } from "sonner";
import {
  Badge,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Button,
  Skeleton,
} from "@pops/ui";
import { Sparkles, SkipForward, Play } from "lucide-react";
import { trpc } from "../lib/trpc";

export function QuickPickDialog() {
  const [open, setOpen] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const utils = trpc.useUtils();

  const { data, isLoading, refetch } = trpc.media.discovery.quickPick.useQuery(
    { count: 5 },
    { enabled: open },
  );

  const addToWatchlist = trpc.media.watchlist.add.useMutation({
    onSuccess: () => {
      toast.success("Added to watchlist!");
      void utils.media.watchlist.list.invalidate();
      setOpen(false);
    },
    onError: (err) => {
      if (err.data?.code === "CONFLICT") {
        toast.info("Already on watchlist");
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
    [refetch],
  );

  const handleSkip = () => setCurrentIndex((i) => i + 1);

  const handleWatch = () => {
    if (!currentMovie) return;
    addToWatchlist.mutate({ mediaType: "movie", mediaId: currentMovie.id });
  };

  const handleRefresh = () => {
    setCurrentIndex(0);
    void refetch();
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Sparkles className="h-4 w-4 mr-1.5" />
          Tonight?
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-md p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-0">
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-indigo-400" />
            What Should I Watch?
          </DialogTitle>
        </DialogHeader>

        <div className="px-6 pb-6 pt-4">
          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="aspect-[2/3] w-full rounded-lg" />
              <Skeleton className="h-6 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          ) : movies.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground">
                No picks available — all movies are watched or on your
                watchlist.
              </p>
            </div>
          ) : isFinished ? (
            <div className="text-center py-8 space-y-4">
              <Sparkles className="h-10 w-10 mx-auto text-indigo-400" />
              <p className="text-muted-foreground">
                You&apos;ve seen all the picks!
              </p>
              <Button onClick={handleRefresh} variant="outline">
                Get More Picks
              </Button>
            </div>
          ) : (
            <PickCard
              movie={currentMovie}
              index={currentIndex}
              total={movies.length}
              onSkip={handleSkip}
              onWatch={handleWatch}
              isAdding={addToWatchlist.isPending}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PickCard({
  movie,
  index,
  total,
  onSkip,
  onWatch,
  isAdding,
}: {
  movie: {
    title: string;
    posterUrl: string | null;
    releaseDate: string | null;
    genres: string | null;
    overview: string | null;
    voteAverage: number | null;
    runtime: number | null;
  };
  index: number;
  total: number;
  onSkip: () => void;
  onWatch: () => void;
  isAdding: boolean;
}) {
  const posterUrl = movie.posterUrl;
  const year = movie.releaseDate?.slice(0, 4);
  const genres: string[] = movie.genres ? JSON.parse(movie.genres) : [];

  return (
    <div className="space-y-4">
      {/* Counter */}
      <p className="text-xs text-muted-foreground text-right">
        {index + 1} / {total}
      </p>

      {/* Poster + info */}
      <div className="flex gap-4">
        {posterUrl ? (
          <img
            src={posterUrl}
            alt={movie.title}
            className="w-28 aspect-[2/3] object-cover rounded-lg shrink-0"
            loading="lazy"
          />
        ) : (
          <div className="w-28 aspect-[2/3] bg-muted rounded-lg flex items-center justify-center shrink-0">
            <span className="text-xs text-muted-foreground">No poster</span>
          </div>
        )}

        <div className="flex-1 min-w-0 space-y-2">
          <h3 className="font-bold leading-tight">{movie.title}</h3>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {year && <span>{year}</span>}
            {movie.runtime && <span>· {movie.runtime} min</span>}
            {movie.voteAverage !== null && (
              <span>· ★ {movie.voteAverage.toFixed(1)}</span>
            )}
          </div>
          {genres.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {genres.slice(0, 3).map((g) => (
                <Badge key={g} variant="secondary" className="text-[10px]">
                  {g}
                </Badge>
              ))}
            </div>
          )}
          {movie.overview && (
            <p className="text-xs text-muted-foreground line-clamp-3">
              {movie.overview}
            </p>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        <Button variant="outline" className="flex-1" onClick={onSkip}>
          <SkipForward className="h-4 w-4 mr-1.5" />
          Not this one
        </Button>
        <Button
          className="flex-1 bg-indigo-600 hover:bg-indigo-700"
          onClick={onWatch}
          loading={isAdding}
          loadingText="Adding..."
        >
          <Play className="h-4 w-4 mr-1.5" />
          Watch this!
        </Button>
      </div>
    </div>
  );
}
