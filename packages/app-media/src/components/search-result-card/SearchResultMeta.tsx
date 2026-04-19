import { Badge } from '@pops/ui';

import type { SearchResultType } from '../SearchResultCard';

export function SearchResultHeader({
  title,
  year,
  voteAverage,
  type,
}: {
  title: string;
  year?: string | null;
  voteAverage?: number | null;
  type: SearchResultType;
}) {
  return (
    <div className="flex items-start justify-between gap-2">
      <div className="min-w-0">
        <h3 className="text-sm font-semibold leading-tight line-clamp-2">{title}</h3>
        <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
          {year && <span>{year}</span>}
          {voteAverage != null && voteAverage > 0 && (
            <>
              {year && <span>·</span>}
              <span>{voteAverage.toFixed(1)}</span>
            </>
          )}
        </div>
      </div>
      <Badge variant={type === 'movie' ? 'default' : 'secondary'} className="shrink-0">
        {type === 'movie' ? 'Movie' : 'TV'}
      </Badge>
    </div>
  );
}

export function SearchResultGenres({ genres }: { genres?: string[] }) {
  if (!genres || genres.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {genres.slice(0, 3).map((genre) => (
        <Badge key={genre} variant="outline" className="text-2xs px-1.5 py-0">
          {genre}
        </Badge>
      ))}
    </div>
  );
}
