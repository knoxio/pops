import { usePosterCascade } from '../../hooks/usePosterCascade';
import { formatRuntime } from '../../lib/format';
import { MovieHeroActions } from './MovieHeroActions';
import { MovieHeroBreadcrumb } from './MovieHeroBreadcrumb';

interface MovieHeroProps {
  movie: {
    id: number;
    tmdbId: number;
    title: string;
    tagline: string | null;
    runtime: number | null;
    voteAverage: number | null;
    posterPath: string | null;
    posterUrl: string | null;
    backdropUrl: string | null;
    logoUrl: string | null;
    rotationStatus: string | null;
    rotationExpiresAt: string | null;
  };
  year: number | null;
  daysSinceWatch: number | null;
  staleness: number;
  pendingDebrief: { movieId: number; status: string } | undefined;
}

function HeroPoster({ posterUrl, title }: { posterUrl: string | null; title: string }) {
  const { activeSrc, showPlaceholder, handleImageError } = usePosterCascade(posterUrl);

  if (activeSrc && !showPlaceholder) {
    return (
      <img
        src={activeSrc}
        alt={`${title} poster`}
        className="w-28 md:w-44 aspect-[2/3] rounded-lg object-cover shadow-lg shrink-0"
        onError={handleImageError}
      />
    );
  }
  return <div className="w-28 md:w-44 aspect-[2/3] rounded-lg bg-muted shadow-lg shrink-0" />;
}

function HeroTitle({ title, logoUrl }: { title: string; logoUrl: string | null }) {
  return (
    <h1 className="text-2xl md:text-4xl font-bold text-foreground">
      {logoUrl ? (
        <>
          <img src={logoUrl} alt={title} className="h-12 md:h-16 object-contain" />
          <span className="sr-only">{title}</span>
        </>
      ) : (
        title
      )}
    </h1>
  );
}

export function MovieHero({
  movie,
  year,
  daysSinceWatch,
  staleness,
  pendingDebrief,
}: MovieHeroProps) {
  return (
    <div className="-mx-4 md:-mx-6 lg:-mx-8 -mt-4 md:-mt-6 lg:-mt-8 relative h-64 md:h-96 overflow-hidden bg-muted">
      {movie.backdropUrl && (
        <img
          src={movie.backdropUrl}
          alt=""
          className="absolute inset-0 w-full h-full object-cover"
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-background via-background/80 to-background/20" />
      <MovieHeroBreadcrumb title={movie.title} />
      <div className="relative h-full flex flex-col md:flex-row items-end p-6 gap-4 md:gap-6">
        <HeroPoster posterUrl={movie.posterUrl} title={movie.title} />
        <div className="flex-1 pb-1">
          <HeroTitle title={movie.title} logoUrl={movie.logoUrl} />
          {movie.tagline && (
            <p className="text-sm md:text-base text-muted-foreground italic mt-1">
              {movie.tagline}
            </p>
          )}
          <div className="flex items-center gap-2 mt-2 text-sm text-muted-foreground">
            {year && <span>{year}</span>}
            {year && movie.runtime && <span>·</span>}
            {movie.runtime && <span>{formatRuntime(movie.runtime)}</span>}
          </div>
          <MovieHeroActions
            movie={movie}
            year={year}
            daysSinceWatch={daysSinceWatch}
            staleness={staleness}
            pendingDebrief={pendingDebrief}
          />
        </div>
      </div>
    </div>
  );
}
