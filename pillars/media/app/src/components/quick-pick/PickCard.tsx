import { Play, SkipForward } from 'lucide-react';

import { Badge, Button } from '@pops/ui';

interface PickMovie {
  title: string;
  posterUrl: string | null;
  releaseDate: string | null;
  genres: string | null;
  overview: string | null;
  voteAverage: number | null;
  runtime: number | null;
}

interface PickCardProps {
  movie: PickMovie;
  index: number;
  total: number;
  onSkip: () => void;
  onWatch: () => void;
  isAdding: boolean;
}

function PickPoster({ movie }: { movie: PickMovie }) {
  if (movie.posterUrl) {
    return (
      <img
        src={movie.posterUrl}
        alt={movie.title}
        className="w-28 aspect-[2/3] object-cover rounded-lg shrink-0"
        loading="lazy"
      />
    );
  }
  return (
    <div className="w-28 aspect-[2/3] bg-muted rounded-lg flex items-center justify-center shrink-0">
      <span className="text-xs text-muted-foreground">No poster</span>
    </div>
  );
}

function PickInfo({ movie }: { movie: PickMovie }) {
  const year = movie.releaseDate?.slice(0, 4);
  const genres: string[] = movie.genres ? JSON.parse(movie.genres) : [];
  return (
    <div className="flex-1 min-w-0 space-y-2">
      <h3 className="font-bold leading-tight">{movie.title}</h3>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {year && <span>{year}</span>}
        {movie.runtime && <span>· {movie.runtime} min</span>}
        {movie.voteAverage !== null && <span>· ★ {movie.voteAverage.toFixed(1)}</span>}
      </div>
      {genres.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {genres.slice(0, 3).map((g) => (
            <Badge key={g} variant="secondary" className="text-2xs">
              {g}
            </Badge>
          ))}
        </div>
      )}
      {movie.overview && (
        <p className="text-xs text-muted-foreground line-clamp-3">{movie.overview}</p>
      )}
    </div>
  );
}

export function PickCard({ movie, index, total, onSkip, onWatch, isAdding }: PickCardProps) {
  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground text-right">
        {index + 1} / {total}
      </p>
      <div className="flex gap-4">
        <PickPoster movie={movie} />
        <PickInfo movie={movie} />
      </div>
      <div className="flex gap-3">
        <Button variant="outline" className="flex-1" onClick={onSkip}>
          <SkipForward className="h-4 w-4 mr-1.5" />
          Not this one
        </Button>
        <Button
          className="flex-1 bg-app-accent hover:bg-app-accent/90"
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
