import { useState, useCallback, useRef } from "react";
import { useNavigate } from "react-router";
import { Button, Badge, Skeleton } from "@pops/ui";
import { SkipForward, Plus, X, RefreshCw, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "../lib/trpc";

export function QuickPickPage() {
  const navigate = useNavigate();
  const utils = trpc.useUtils();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [addedIds, setAddedIds] = useState<Set<number>>(new Set());

  // Touch/swipe state
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const [swipeOffset, setSwipeOffset] = useState(0);

  const { data, isLoading, refetch } = trpc.media.library.quickPick.useQuery(
    { count: 10 },
    { refetchOnWindowFocus: false }
  );

  const addToWatchlist = trpc.media.watchlist.add.useMutation({
    onSuccess: () => {
      toast.success("Added to watchlist");
      utils.media.watchlist.list.invalidate();
    },
    onError: (err) => {
      if (err.message.includes("already")) {
        toast.info("Already on your watchlist");
      } else {
        toast.error("Failed to add to watchlist");
      }
    },
  });

  const picks = data?.data ?? [];
  const currentPick = picks[currentIndex];
  const isFinished = !isLoading && currentIndex >= picks.length;

  const goNext = useCallback(() => {
    setCurrentIndex((i) => i + 1);
    setSwipeOffset(0);
  }, []);

  const handleAddToWatchlist = useCallback(() => {
    if (!currentPick || addedIds.has(currentPick.id)) return;
    addToWatchlist.mutate(
      { mediaType: "movie", mediaId: currentPick.id },
      {
        onSuccess: () => {
          setAddedIds((prev) => new Set(prev).add(currentPick.id));
          goNext();
        },
      }
    );
  }, [currentPick, addedIds, addToWatchlist, goNext]);

  const handleRefresh = useCallback(() => {
    setCurrentIndex(0);
    setAddedIds(new Set());
    refetch();
  }, [refetch]);

  // Touch handlers for swipe
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!touchStart.current) return;
    const dx = e.touches[0].clientX - touchStart.current.x;
    setSwipeOffset(dx);
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (!touchStart.current) return;
    const threshold = 80;

    if (swipeOffset > threshold) {
      // Swipe right → add to watchlist
      handleAddToWatchlist();
    } else if (swipeOffset < -threshold) {
      // Swipe left → skip
      goNext();
    }

    touchStart.current = null;
    setSwipeOffset(0);
  }, [swipeOffset, handleAddToWatchlist, goNext]);

  // Swipe indicator colors
  const swipeIndicator =
    swipeOffset > 40
      ? "ring-2 ring-emerald-500/50"
      : swipeOffset < -40
        ? "ring-2 ring-rose-500/50"
        : "";

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <Sparkles className="h-8 w-8 text-indigo-400 animate-pulse" />
        <Skeleton className="h-[400px] w-[280px] rounded-xl" />
        <Skeleton className="h-4 w-40" />
      </div>
    );
  }

  if (picks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center">
        <Sparkles className="h-10 w-10 text-muted-foreground" />
        <h2 className="text-xl font-semibold">No unwatched movies</h2>
        <p className="text-muted-foreground text-sm max-w-xs">
          Add more movies to your library or mark some as unwatched to get picks.
        </p>
        <Button onClick={() => navigate("/media/search")}>Search for movies</Button>
      </div>
    );
  }

  if (isFinished) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center">
        <Sparkles className="h-10 w-10 text-indigo-400" />
        <h2 className="text-xl font-semibold">That's all for now!</h2>
        <p className="text-muted-foreground text-sm max-w-xs">
          You've seen all the picks. Refresh for a new set of suggestions.
        </p>
        <div className="flex gap-3">
          <Button onClick={handleRefresh}>
            <RefreshCw className="h-4 w-4 mr-2" />
            New picks
          </Button>
          <Button variant="outline" onClick={() => navigate("/media")}>
            Back to Library
          </Button>
        </div>
      </div>
    );
  }

  const movie = currentPick;
  const year = movie.releaseDate?.slice(0, 4);

  return (
    <div className="flex flex-col items-center gap-6 pb-8">
      {/* Header */}
      <div className="flex items-center justify-between w-full max-w-sm">
        <h1 className="text-lg font-semibold flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-indigo-400" />
          Quick Pick
        </h1>
        <span className="text-xs text-muted-foreground">
          {currentIndex + 1} / {picks.length}
        </span>
      </div>

      {/* Card */}
      <div
        ref={cardRef}
        className={`relative w-full max-w-sm rounded-xl overflow-hidden bg-card border shadow-lg transition-transform duration-200 ${swipeIndicator}`}
        style={{
          transform: `translateX(${swipeOffset * 0.3}px) rotate(${swipeOffset * 0.05}deg)`,
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Swipe indicators */}
        {swipeOffset > 40 && (
          <div className="absolute top-4 left-4 z-10">
            <Badge className="bg-emerald-500 text-white text-sm px-3 py-1">+ Watchlist</Badge>
          </div>
        )}
        {swipeOffset < -40 && (
          <div className="absolute top-4 right-4 z-10">
            <Badge className="bg-rose-500 text-white text-sm px-3 py-1">Skip</Badge>
          </div>
        )}

        {/* Poster */}
        <div className="aspect-[2/3] bg-muted">
          {movie.posterUrl ? (
            <img
              src={movie.posterUrl}
              alt={movie.title}
              className="w-full h-full object-cover"
              draggable={false}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-muted-foreground">
              No Poster
            </div>
          )}
        </div>

        {/* Info */}
        <div className="p-4 space-y-3">
          <div>
            <h2 className="text-lg font-semibold line-clamp-2">{movie.title}</h2>
            <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
              {year && <span>{year}</span>}
              {movie.runtime && (
                <>
                  <span>·</span>
                  <span>{movie.runtime} min</span>
                </>
              )}
              {movie.voteAverage != null && (
                <>
                  <span>·</span>
                  <span>★ {movie.voteAverage.toFixed(1)}</span>
                </>
              )}
            </div>
          </div>

          {/* Genres */}
          {movie.genres.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {movie.genres.slice(0, 4).map((genre) => (
                <Badge key={genre} variant="secondary" className="text-xs">
                  {genre}
                </Badge>
              ))}
            </div>
          )}

          {/* Overview */}
          {movie.overview && (
            <p className="text-sm text-muted-foreground line-clamp-3">{movie.overview}</p>
          )}
        </div>
      </div>

      {/* Swipe hint (mobile only) */}
      <p className="text-xs text-muted-foreground sm:hidden">
        Swipe right to add · Swipe left to skip
      </p>

      {/* Action buttons */}
      <div className="flex items-center gap-3 w-full max-w-sm">
        <Button variant="outline" className="flex-1" onClick={goNext}>
          <SkipForward className="h-4 w-4 mr-2" />
          Skip
        </Button>
        <Button
          className="flex-1 bg-indigo-600 hover:bg-indigo-700"
          onClick={handleAddToWatchlist}
          disabled={addToWatchlist.isPending || addedIds.has(movie.id)}
        >
          <Plus className="h-4 w-4 mr-2" />
          Watchlist
        </Button>
      </div>

      {/* Close button */}
      <Button
        variant="ghost"
        size="sm"
        className="text-muted-foreground"
        onClick={() => navigate("/media")}
      >
        <X className="h-4 w-4 mr-1" />
        Not tonight
      </Button>
    </div>
  );
}
