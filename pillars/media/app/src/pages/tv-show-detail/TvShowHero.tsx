import { Link } from 'react-router';

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
  Button,
} from '@pops/ui';

import { ArrStatusBadge } from '../../components/ArrStatusBadge';
import { ProgressBar } from '../../components/ProgressBar';
import { formatYearRange } from '../../lib/format';

import type { ProgressData } from './types';

interface TvShowHeroProps {
  show: {
    id: number;
    name: string;
    tvdbId: number;
    status: string | null;
    firstAirDate: string | null;
    lastAirDate: string | null;
    posterUrl: string | null;
    backdropUrl: string | null;
  };
  progress: ProgressData | undefined;
  showId: number;
  onBatchLog: () => void;
  isPending: boolean;
}

function HeroPoster({ posterUrl, name }: { posterUrl: string | null; name: string }) {
  if (posterUrl) {
    return (
      <img
        src={posterUrl}
        alt={`${name} poster`}
        className="w-28 md:w-44 aspect-[2/3] rounded-lg object-cover shadow-lg shrink-0"
      />
    );
  }
  return <div className="w-28 md:w-44 aspect-[2/3] rounded-lg bg-muted shadow-lg shrink-0" />;
}

function HeroBreadcrumb({ name }: { name: string }) {
  return (
    <div className="absolute top-0 left-0 right-0 p-4 md:p-6 z-10">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link to="/media" className="text-white/70 hover:text-white">
                Media
              </Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator className="text-white/50" />
          <BreadcrumbItem>
            <BreadcrumbPage className="text-white/90">{name}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
    </div>
  );
}

function NextEpisodeLink({
  showId,
  nextEpisode,
}: {
  showId: number;
  nextEpisode: NonNullable<ProgressData['nextEpisode']>;
}) {
  return (
    <Link
      to={`/media/tv/${showId}/season/${nextEpisode.seasonNumber}`}
      className="inline-block mt-2 text-sm text-primary hover:underline"
    >
      Continue watching: S{String(nextEpisode.seasonNumber).padStart(2, '0')}E
      {String(nextEpisode.episodeNumber).padStart(2, '0')}
      {nextEpisode.episodeName ? ` — ${nextEpisode.episodeName}` : ''}
    </Link>
  );
}

function BatchWatchButton({
  progress,
  onBatchLog,
  isPending,
}: {
  progress: ProgressData;
  onBatchLog: () => void;
  isPending: boolean;
}) {
  if (progress.overall.watched < progress.overall.total) {
    return (
      <Button variant="outline" size="sm" onClick={onBatchLog} disabled={isPending}>
        Mark All Watched
      </Button>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-sm text-success font-medium">
      <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
        <path
          fillRule="evenodd"
          d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
          clipRule="evenodd"
        />
      </svg>
      All Watched
    </span>
  );
}

function HeroBody({ show, progress, showId, onBatchLog, isPending }: TvShowHeroProps) {
  const yearRange = formatYearRange(show.firstAirDate, show.lastAirDate, show.status ?? null);
  const nextEpisode = progress?.nextEpisode ?? null;
  return (
    <div className="flex-1 pb-1">
      <h1 className="text-2xl md:text-4xl font-bold text-foreground">{show.name}</h1>
      <div className="flex items-center gap-2 mt-2 text-sm text-muted-foreground">
        {yearRange && <span>{yearRange}</span>}
        {show.status && (
          <>
            {yearRange && <span>·</span>}
            <span>{show.status}</span>
          </>
        )}
        <ArrStatusBadge kind="show" externalId={show.tvdbId} />
      </div>
      {progress && progress.overall.total > 0 && (
        <div className="mt-3 max-w-xs">
          <ProgressBar watched={progress.overall.watched} total={progress.overall.total} />
        </div>
      )}
      {nextEpisode && <NextEpisodeLink showId={showId} nextEpisode={nextEpisode} />}
      {progress && progress.overall.total > 0 && (
        <div className="mt-3">
          <BatchWatchButton progress={progress} onBatchLog={onBatchLog} isPending={isPending} />
        </div>
      )}
    </div>
  );
}

export function TvShowHero(props: TvShowHeroProps) {
  const { show } = props;
  return (
    <div className="-mx-4 md:-mx-6 lg:-mx-8 -mt-4 md:-mt-6 lg:-mt-8 relative h-64 md:h-96 overflow-hidden bg-muted">
      {show.backdropUrl && (
        <img
          src={show.backdropUrl}
          alt=""
          className="absolute inset-0 w-full h-full object-cover"
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-background via-background/80 to-background/20" />
      <HeroBreadcrumb name={show.name} />
      <div className="relative h-full flex flex-col md:flex-row items-end p-6 gap-4 md:gap-6">
        <HeroPoster posterUrl={show.posterUrl} name={show.name} />
        <HeroBody {...props} />
      </div>
    </div>
  );
}
